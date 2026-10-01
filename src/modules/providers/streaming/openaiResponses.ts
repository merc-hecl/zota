/**
 * openai-responses streaming adapter (POST {base}/responses + SSE).
 *
 * Mirrors pi-ai's openai-responses wire behavior: input items with
 * input_text/input_image/output_text content, reasoning effort with
 * encrypted reasoning content, and the response.* SSE event family.
 */

import type {
  AdapterModel,
  StreamEventSink,
  StreamRequest,
  ThinkingControl,
} from ".";
import { assertOkResponse, readSSE } from "./sse";

type InputContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

type InputItem =
  | { role: "system"; content: string }
  | { role: "user"; content: string | InputContentPart[] }
  | {
      role: "assistant";
      content: Array<{ type: "output_text"; text: string }>;
    };

function buildInput(request: StreamRequest): InputItem[] {
  const input: InputItem[] = [
    { role: "system", content: request.systemPrompt },
  ];
  for (const msg of request.messages) {
    if (msg.role === "assistant") {
      input.push({
        role: "assistant",
        content: [{ type: "output_text", text: msg.content }],
      });
      continue;
    }
    if (msg.role !== "user") continue;

    if (msg.images && msg.images.length > 0) {
      const content: InputContentPart[] = [];
      if (msg.content.trim()) {
        content.push({ type: "input_text", text: msg.content });
      }
      for (const image of msg.images) {
        content.push({
          type: "input_image",
          image_url: `data:${image.mimeType};base64,${image.base64}`,
        });
      }
      input.push({ role: "user", content });
    } else {
      input.push({ role: "user", content: msg.content });
    }
  }
  return input;
}

function applyReasoningParams(
  body: Record<string, unknown>,
  model: AdapterModel,
  thinking: ThinkingControl,
): void {
  if (!model.reasoning) return;
  const levelMap = model.thinkingLevelMap;

  if (thinking.enabled && thinking.effort) {
    body.reasoning = {
      effort: levelMap?.[thinking.effort] ?? thinking.effort,
      summary: "auto",
    };
    body.include = ["reasoning.encrypted_content"];
  } else if (levelMap?.off !== null) {
    body.reasoning = { effort: levelMap?.off ?? "none" };
  }
  if (model.provider === "xai") {
    body.include = ["reasoning.encrypted_content"];
  }
}

export async function streamOpenAIResponses(
  request: StreamRequest,
  model: AdapterModel,
  thinking: ThinkingControl,
  events: StreamEventSink,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: request.modelId,
    input: buildInput(request),
    stream: true,
    store: false,
  };
  if (request.maxTokens) {
    body.max_output_tokens = request.maxTokens;
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  applyReasoningParams(body, model, thinking);

  const response = await fetch(`${request.baseUrl}/responses`, {
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
        delta?: unknown;
        message?: unknown;
        response?: { error?: { message?: unknown } };
      };
      switch (parsed.type) {
        case "response.output_text.delta":
          if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
            fullText += parsed.delta;
            events.onText(parsed.delta);
          }
          break;
        case "response.reasoning_summary_text.delta":
        case "response.reasoning_text.delta":
          if (typeof parsed.delta === "string" && parsed.delta.length > 0) {
            events.onThinking(parsed.delta);
          }
          break;
        case "response.completed":
        case "response.incomplete":
          break;
        case "response.failed":
          streamError =
            typeof parsed.response?.error?.message === "string"
              ? parsed.response.error.message
              : "Response failed";
          break;
        case "error":
          streamError =
            typeof parsed.message === "string" ? parsed.message : "API error";
          break;
        default:
          break;
      }
    },
    request.signal,
  );

  if (streamError) throw new Error(streamError);
  return fullText;
}
