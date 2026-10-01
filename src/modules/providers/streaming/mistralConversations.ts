/**
 * mistral-conversations streaming adapter
 * (POST {base}/v1/chat/completions + SSE).
 *
 * Mirrors pi-ai's mistral-conversations wire behavior: accept
 * text/event-stream header, image_url content chunks with plain data-URL
 * strings, reasoning_effort for thinking models, and delta.content payloads
 * that may be a plain string or an array of thinking/text chunks.
 */

import type {
  AdapterModel,
  StreamEventSink,
  StreamRequest,
  ThinkingControl,
} from ".";
import { assertOkResponse, readSSE } from "./sse";

type WireContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: string };

interface WireMessage {
  role: string;
  content: string | WireContentPart[];
}

function buildMessages(
  request: StreamRequest,
  model: AdapterModel,
): WireMessage[] {
  const supportsImages = model.input.includes("image");
  const messages: WireMessage[] = [
    { role: "system", content: request.systemPrompt },
  ];

  for (const msg of request.messages) {
    if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.role !== "user") continue;

    if (msg.images && msg.images.length > 0 && supportsImages) {
      const content: WireContentPart[] = [];
      if (msg.content.trim()) {
        content.push({ type: "text", text: msg.content });
      }
      for (const image of msg.images) {
        content.push({
          type: "image_url",
          image_url: `data:${image.mimeType};base64,${image.base64}`,
        });
      }
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "user", content: msg.content });
    }
  }
  return messages;
}

/**
 * Acceptable finish reasons. Everything else mirrors pi-ai's
 * mapChatStopReason: an error stop surfaces as "Provider stopped with: X".
 */
function finishReasonError(reason: string): string | null {
  switch (reason) {
    case "stop":
    case "length":
    case "model_length":
    case "tool_calls":
      return null;
    case "error":
      return "Provider stopped with: error";
    default:
      return `Provider stopped with: ${reason}`;
  }
}

export async function streamMistralConversations(
  request: StreamRequest,
  model: AdapterModel,
  thinking: ThinkingControl,
  events: StreamEventSink,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: request.modelId,
    stream: true,
    messages: buildMessages(request, model),
  };
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.maxTokens) {
    body.max_tokens = request.maxTokens;
  }
  if (thinking.enabled && model.reasoning) {
    // Mistral only accepts none|high; zota resolves "high" upstream.
    body.reasoning_effort = thinking.effort ?? "high";
  }

  const response = await fetch(`${request.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  await assertOkResponse(response);

  let fullText = "";
  let finishError: string | null = null;
  let sawFinishReason = false;

  await readSSE(
    response,
    (data) => {
      if (data === "[DONE]") return;
      let chunk: unknown;
      try {
        chunk = JSON.parse(data);
      } catch {
        return;
      }
      const choice = (chunk as { choices?: unknown[] }).choices?.[0] as
        | {
            delta?: { content?: unknown };
            finish_reason?: unknown;
          }
        | undefined;
      // Chunks without a choice (e.g. model_loaded notifications) are skipped.
      if (!choice) return;

      if (typeof choice.finish_reason === "string") {
        sawFinishReason = true;
        const error = finishReasonError(choice.finish_reason);
        if (error) finishError = error;
      }

      const content = choice.delta?.content;
      if (typeof content === "string" && content.length > 0) {
        fullText += content;
        events.onText(content);
        return;
      }
      if (!Array.isArray(content)) return;
      for (const item of content) {
        if (typeof item === "string" && item.length > 0) {
          fullText += item;
          events.onText(item);
          continue;
        }
        const part = item as {
          type?: string;
          text?: unknown;
          thinking?: Array<{ text?: unknown }>;
        };
        if (part.type === "thinking") {
          const thinkingText = (part.thinking ?? [])
            .map((t) => (typeof t.text === "string" ? t.text : ""))
            .filter((text) => text.length > 0)
            .join("");
          if (thinkingText) events.onThinking(thinkingText);
        } else if (part.type === "text" && typeof part.text === "string") {
          if (part.text.length > 0) {
            fullText += part.text;
            events.onText(part.text);
          }
        }
      }
    },
    request.signal,
  );

  if (finishError) throw new Error(finishError);
  if (!sawFinishReason) {
    throw new Error("Mistral stream ended without a finish reason");
  }
  return fullText;
}
