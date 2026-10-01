/**
 * anthropic-messages streaming adapter (POST {base}/v1/messages + SSE).
 *
 * Mirrors pi-ai's anthropic-messages wire behavior: system prompt as text
 * blocks, adaptive vs budget-based thinking (compat.forceAdaptiveThinking /
 * supportsMidConvoEffort), temperature only without thinking, and standard
 * Anthropic SSE events (content_block_delta text/thinking, message_stop).
 */

import type {
  AdapterModel,
  StreamEventSink,
  StreamRequest,
  ThinkingControl,
} from ".";
import { assertOkResponse, readSSE } from "./sse";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

function buildMessages(request: StreamRequest): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];
  for (const msg of request.messages) {
    if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.role !== "user") continue;

    if (msg.images && msg.images.length > 0) {
      const content: AnthropicContentBlock[] = msg.images.map((image) => ({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mimeType,
          data: image.base64,
        },
      }));
      if (msg.content.trim()) {
        content.push({ type: "text", text: msg.content });
      }
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "user", content: msg.content });
    }
  }
  return messages;
}

function applyThinkingParams(
  body: Record<string, unknown>,
  model: AdapterModel,
  thinking: ThinkingControl,
): void {
  if (model.compat?.supportsMidConvoEffort === true) {
    // Managed-effort models always think adaptively so prefix mismatches
    // can be dropped instead of surfacing as persistent 400 responses.
    body.thinking = {
      type: "adaptive",
      display: "summarized",
      block_binding: { prefix_mismatch_behavior: "drop_block" },
    };
    body.output_config = { effort: "high" };
    return;
  }
  if (!model.reasoning || !thinking.enabled) return;

  if (model.compat?.forceAdaptiveThinking === true) {
    body.thinking = { type: "adaptive", display: "summarized" };
    if (thinking.effort) {
      body.output_config = { effort: thinking.effort };
    }
  } else {
    // Budget-based thinking (MiniMax, older Claude models)
    body.thinking = {
      type: "enabled",
      budget_tokens: 1024,
      display: "summarized",
    };
  }
}

export async function streamAnthropicMessages(
  request: StreamRequest,
  model: AdapterModel,
  thinking: ThinkingControl,
  events: StreamEventSink,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: request.modelId,
    max_tokens: request.maxTokens || 8192,
    system: [{ type: "text", text: request.systemPrompt }],
    messages: buildMessages(request),
    stream: true,
  };
  applyThinkingParams(body, model, thinking);
  if (
    request.temperature !== undefined &&
    !thinking.enabled &&
    model.compat?.supportsMidConvoEffort !== true &&
    model.compat?.supportsTemperature !== false
  ) {
    body.temperature = request.temperature;
  }

  const response = await fetch(`${request.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  await assertOkResponse(response);

  let fullText = "";
  let streamError: string | null = null;

  await readSSE(
    response,
    (data) => {
      let event: unknown;
      try {
        event = JSON.parse(data);
      } catch {
        return;
      }
      const parsed = event as {
        type?: string;
        delta?: { type?: string; text?: unknown; thinking?: unknown };
        error?: { message?: unknown };
      };
      if (parsed.type === "content_block_delta") {
        const delta = parsed.delta;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          fullText += delta.text;
          events.onText(delta.text);
        } else if (
          delta?.type === "thinking_delta" &&
          typeof delta.thinking === "string"
        ) {
          events.onThinking(delta.thinking);
        }
      } else if (parsed.type === "error") {
        streamError =
          typeof parsed.error?.message === "string"
            ? parsed.error.message
            : "Anthropic stream error";
      }
      // message_start/content_block_start/message_delta/message_stop/ping
      // need no handling for plain chat streaming.
    },
    request.signal,
  );

  if (streamError) throw new Error(streamError);
  return fullText;
}
