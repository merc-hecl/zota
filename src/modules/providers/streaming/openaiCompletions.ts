/**
 * openai-completions streaming adapter (POST {base}/chat/completions + SSE).
 *
 * Mirrors pi-ai's openai-completions wire behavior for plain chat: payload
 * fields, per-vendor thinking formats (compat.thinkingFormat) and delta
 * extraction (content + reasoning_content/reasoning/reasoning_text).
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
  | { type: "image_url"; image_url: { url: string } };

interface WireMessage {
  role: string;
  content: string | WireContentPart[];
}

function buildMessages(
  request: StreamRequest,
  model: AdapterModel,
): WireMessage[] {
  const systemRole =
    model.reasoning && model.compat?.supportsDeveloperRole === true
      ? "developer"
      : "system";
  const messages: WireMessage[] = [
    { role: systemRole, content: request.systemPrompt },
  ];

  for (const msg of request.messages) {
    if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    if (msg.role !== "user") continue;

    if (msg.images && msg.images.length > 0) {
      const content: WireContentPart[] = [];
      if (msg.content.trim()) {
        content.push({ type: "text", text: msg.content });
      }
      for (const image of msg.images) {
        content.push({
          type: "image_url",
          image_url: {
            url: `data:${image.mimeType};base64,${image.base64}`,
          },
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
 * Per-vendor thinking parameters, mirroring pi-ai's compat.thinkingFormat
 * dispatch. `level` is the resolved effort string when thinking is on.
 */
function applyThinkingParams(
  body: Record<string, unknown>,
  model: AdapterModel,
  thinking: ThinkingControl,
): void {
  if (!model.reasoning) return;
  const format = model.compat?.thinkingFormat;
  const level = thinking.enabled ? (thinking.effort ?? "medium") : undefined;
  const supportsEffort = model.compat?.supportsReasoningEffort === true;
  const levelMap = model.thinkingLevelMap;

  if (format === "zai") {
    body.thinking = level
      ? { type: "enabled", clear_thinking: false }
      : { type: "disabled" };
    if (level && supportsEffort) {
      const mapped = levelMap?.[level];
      const effort = mapped === undefined ? level : mapped;
      if (typeof effort === "string") body.reasoning_effort = effort;
    }
  } else if (format === "qwen") {
    body.enable_thinking = !!level;
    if (level && supportsEffort) {
      body.reasoning_effort = levelMap?.[level] ?? level;
    }
  } else if (format === "deepseek") {
    if (level) {
      body.thinking = { type: "enabled" };
    } else if (levelMap?.off !== null) {
      body.thinking = { type: "disabled" };
    }
    if (level && supportsEffort) {
      body.reasoning_effort = levelMap?.[level] ?? level;
    }
  } else if (format === "openrouter") {
    if (level) {
      body.reasoning = { effort: levelMap?.[level] ?? level };
    } else if (levelMap?.off !== null) {
      body.reasoning = { effort: levelMap?.off ?? "none" };
    }
  } else if (format === "together") {
    body.reasoning = { enabled: !!level };
    if (level && supportsEffort) {
      body.reasoning_effort = levelMap?.[level] ?? level;
    }
  } else if (format === "ant-ling") {
    if (level) {
      const effort = levelMap?.[level];
      if (typeof effort === "string") body.reasoning = { effort };
    }
  } else if (format === "baseten") {
    if (supportsEffort) {
      const mapped = level ? levelMap?.[level] : levelMap?.off;
      const effort = mapped === undefined ? level : mapped;
      if (typeof effort === "string") body.reasoning_effort = effort;
    }
  } else if (level && supportsEffort) {
    // OpenAI-style reasoning_effort (default format)
    body.reasoning_effort = levelMap?.[level] ?? level;
  } else if (!level && supportsEffort) {
    const off = levelMap?.off;
    if (typeof off === "string") body.reasoning_effort = off;
  }
}

/** Map finish_reason to an error message (null = acceptable stop). */
function finishReasonError(reason: string): string | null {
  switch (reason) {
    case "stop":
    case "end":
    case "length":
    case "function_call":
    case "tool_calls":
      return null;
    case "content_filter":
      return "Provider finish_reason: content_filter";
    case "network_error":
      return "Provider finish_reason: network_error";
    default:
      return `Provider finish_reason: ${reason}`;
  }
}

export async function streamOpenAICompletions(
  request: StreamRequest,
  model: AdapterModel,
  thinking: ThinkingControl,
  events: StreamEventSink,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: request.modelId,
    messages: buildMessages(request, model),
    stream: true,
  };
  if (model.compat?.supportsUsageInStreaming !== false) {
    body.stream_options = { include_usage: true };
  }
  if (model.compat?.supportsStore === true) {
    body.store = false;
  }
  if (request.maxTokens) {
    body[
      model.compat?.maxTokensField === "max_completion_tokens"
        ? "max_completion_tokens"
        : "max_tokens"
    ] = request.maxTokens;
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  applyThinkingParams(body, model, thinking);

  const response = await fetch(`${request.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: request.signal,
  });
  await assertOkResponse(response);

  let fullText = "";
  let finishError: string | null = null;

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
            delta?: {
              content?: unknown;
              reasoning_content?: unknown;
              reasoning?: unknown;
              reasoning_text?: unknown;
            };
            finish_reason?: unknown;
          }
        | undefined;
      if (!choice) return;

      if (typeof choice.finish_reason === "string") {
        const error = finishReasonError(choice.finish_reason);
        if (error) finishError = error;
      }

      const delta = choice.delta;
      if (!delta) return;
      if (typeof delta.content === "string" && delta.content.length > 0) {
        fullText += delta.content;
        events.onText(delta.content);
      }
      const reasoning =
        typeof delta.reasoning_content === "string" &&
        delta.reasoning_content.length > 0
          ? delta.reasoning_content
          : typeof delta.reasoning === "string" && delta.reasoning.length > 0
            ? delta.reasoning
            : typeof delta.reasoning_text === "string" &&
                delta.reasoning_text.length > 0
              ? delta.reasoning_text
              : null;
      if (reasoning) events.onThinking(reasoning);
    },
    request.signal,
  );

  if (finishError) throw new Error(finishError);
  return fullText;
}
