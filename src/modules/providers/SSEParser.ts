/**
 * SSEParser - Server-Sent Events stream parser
 * Supports multiple API formats: OpenAI, Anthropic, Gemini
 */

export type SSEFormat = "openai" | "anthropic" | "gemini";

export interface SSEParserCallbacks {
  onText: (text: string) => void;
  onDone: () => void;
  onError?: (error: Error) => void;
}

/**
 * Content extractors for different API formats
 */
const contentExtractors: Record<SSEFormat, (parsed: unknown) => string | null> =
  {
    openai: (parsed) => {
      const data = parsed as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      return data.choices?.[0]?.delta?.content || null;
    },
    anthropic: (parsed) => {
      const data = parsed as {
        type?: string;
        delta?: { text?: string };
        content_block?: { type?: string; text?: string };
      };
      if (data.type === "content_block_delta" && data.delta?.text) {
        return data.delta.text;
      }
      return null;
    },
    gemini: (parsed) => {
      const data = parsed as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    },
  };

/**
 * Check if the event indicates completion for different formats
 */
const completionCheckers: Record<SSEFormat, (parsed: unknown) => boolean> = {
  openai: (parsed) => {
    const data = parsed as {
      choices?: Array<{ finish_reason?: string | null }>;
    };
    const finishReason = data.choices?.[0]?.finish_reason;
    return finishReason !== undefined && finishReason !== null;
  },
  anthropic: (parsed) => {
    const data = parsed as { type?: string };
    return data.type === "message_stop";
  },
  gemini: (parsed) => {
    const data = parsed as {
      candidates?: Array<{ finishReason?: string }>;
    };
    return data.candidates?.[0]?.finishReason !== undefined;
  },
};

/**
 * Parse SSE stream with unified handling for different API formats
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  format: SSEFormat,
  callbacks: SSEParserCallbacks,
): Promise<void> {
  const { onText, onDone, onError } = callbacks;
  const extractContent = contentExtractors[format];
  const isComplete = completionCheckers[format];
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const value = result.value as Uint8Array;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (format === "anthropic") {
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (isComplete(parsed)) {
              onDone();
              return;
            }
            const text = extractContent(parsed);
            if (text) {
              onText(text);
            }
          } catch {
            // Ignore parse errors for this chunk
          }
        } else if (format === "gemini") {
          try {
            const parsed = JSON.parse(trimmed);
            if (isComplete(parsed)) {
              onDone();
              return;
            }
            const text = extractContent(parsed);
            if (text) {
              onText(text);
            }
          } catch {
            // Ignore parse errors for this chunk
          }
        } else {
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (isComplete(parsed)) {
              onDone();
              return;
            }
            const text = extractContent(parsed);
            if (text) {
              onText(text);
            }
          } catch {
            // Ignore parse errors for this chunk
          }
        }
      }
    }
    onDone();
  } catch (error) {
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
