/**
 * google-generative-ai streaming adapter
 * (POST {base}/models/{model}:streamGenerateContent?alt=sse).
 *
 * Mirrors pi-ai's google-generative-ai wire behavior: contents with
 * user/model roles, systemInstruction, generationConfig (incl.
 * thinkingConfig.thinkingBudget) and thought-part extraction
 * (parts with thought:true are reasoning).
 */

import type {
  AdapterModel,
  StreamEventSink,
  StreamRequest,
  ThinkingControl,
} from ".";
import { assertOkResponse, readSSE } from "./sse";

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

function buildContents(
  request: StreamRequest,
  supportsImages: boolean,
): Array<{ role: "user" | "model"; parts: GeminiPart[] }> {
  return request.messages.map((msg) => {
    const parts: GeminiPart[] = [];
    if (msg.images && msg.images.length > 0 && supportsImages) {
      for (const image of msg.images) {
        parts.push({
          inline_data: { mime_type: image.mimeType, data: image.base64 },
        });
      }
    }
    parts.push({ text: msg.content });
    return {
      role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
      parts,
    };
  });
}

export async function streamGoogleGenerativeAI(
  request: StreamRequest,
  model: AdapterModel,
  thinking: ThinkingControl,
  events: StreamEventSink,
): Promise<string> {
  const supportsImages = model.input.includes("image");

  const generationConfig: Record<string, unknown> = {};
  if (request.temperature !== undefined) {
    generationConfig.temperature = request.temperature;
  }
  if (request.maxTokens) {
    generationConfig.maxOutputTokens = request.maxTokens;
  }
  if (thinking.enabled && model.reasoning) {
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      thinkingBudget: thinking.budgetTokens ?? 1024,
    };
  }

  const body: Record<string, unknown> = {
    contents: buildContents(request, supportsImages),
    systemInstruction: { parts: [{ text: request.systemPrompt }] },
  };
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }

  const response = await fetch(
    `${request.baseUrl}/models/${request.modelId}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": request.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: request.signal,
    },
  );
  await assertOkResponse(response);

  let fullText = "";
  let streamError: string | null = null;

  await readSSE(
    response,
    (data) => {
      let chunk: unknown;
      try {
        chunk = JSON.parse(data);
      } catch {
        return;
      }
      const parsed = chunk as {
        error?: { message?: unknown };
        candidates?: Array<{
          content?: { parts?: Array<{ text?: unknown; thought?: unknown }> };
        }>;
      };
      if (typeof parsed.error?.message === "string") {
        streamError = parsed.error.message;
        return;
      }
      const parts = parsed.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) return;
      for (const part of parts) {
        if (typeof part.text !== "string" || part.text.length === 0) continue;
        if (part.thought === true) {
          events.onThinking(part.text);
        } else {
          fullText += part.text;
          events.onText(part.text);
        }
      }
    },
    request.signal,
  );

  if (streamError) throw new Error(streamError);
  return fullText;
}
