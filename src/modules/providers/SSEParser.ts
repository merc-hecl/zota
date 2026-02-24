/**
 * SSEParser - Server-Sent Events stream parser
 * Supports multiple API formats: OpenAI, Anthropic, Gemini
 */

export type SSEFormat = "openai" | "anthropic" | "gemini";

export interface SSEParserCallbacks {
  onText: (text: string) => void;
  onDone: () => void;
  onError?: (error: Error) => void;
  onReasoningText?: (text: string) => void; // Callback for reasoning content chunks
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
 * Reasoning content extractors for different API formats
 * Returns reasoning_content if present in the response
 */
const reasoningExtractors: Record<
  SSEFormat,
  (parsed: unknown) => string | null
> = {
  openai: (parsed) => {
    const data = parsed as {
      choices?: Array<{ delta?: { reasoning_content?: string | null } }>;
    };
    const reasoning = data.choices?.[0]?.delta?.reasoning_content;
    // Return null if reasoning_content is undefined or null
    if (reasoning === undefined || reasoning === null) {
      return null;
    }
    return reasoning;
  },
  anthropic: () => null, // Anthropic doesn't support reasoning_content in this format
  gemini: () => null, // Gemini doesn't support reasoning_content in this format
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
  signal?: AbortSignal,
): Promise<void> {
  const { onText, onDone, onError, onReasoningText } = callbacks;
  const extractContent = contentExtractors[format];
  const extractReasoning = reasoningExtractors[format];
  const isComplete = completionCheckers[format];
  const decoder = new TextDecoder();
  let buffer = "";

  const abortHandler = (): void => {
    ztoolkit.log("[SSEParser] abortHandler called");
    reader.cancel().catch(() => {});
  };

  if (signal) {
    signal.addEventListener("abort", abortHandler);
    ztoolkit.log(
      "[SSEParser] Abort listener added, signal.aborted:",
      signal.aborted,
    );
  }

  try {
    while (true) {
      ztoolkit.log(
        "[SSEParser] Before read, signal?.aborted:",
        signal?.aborted,
      );
      if (signal?.aborted) {
        ztoolkit.log("[SSEParser] Signal aborted detected in loop");
        const abortError = new Error("Request aborted");
        abortError.name = "AbortError";
        if (onError) {
          onError(abortError);
        }
        return;
      }

      const result = await reader.read();
      ztoolkit.log(
        "[SSEParser] After read, result.done:",
        result.done,
        "result.value:",
        result.value,
      );

      // Check if stream was cancelled (aborted)
      const wasAborted =
        !result.value || (result.value as Uint8Array).length === 0;

      if (result.done) {
        if (wasAborted && signal?.aborted) {
          ztoolkit.log("[SSEParser] Stream cancelled due to abort");
          const abortError = new Error("Request aborted");
          abortError.name = "AbortError";
          if (onError) {
            onError(abortError);
          }
          return;
        }
        break;
      }
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
            ztoolkit.log("[SSEParser] Parsed data:", JSON.stringify(parsed));
            if (isComplete(parsed)) {
              onDone();
              return;
            }
            // Extract regular content
            const text = extractContent(parsed);
            if (text) {
              onText(text);
            }
            // Extract reasoning content if present
            const reasoningText = extractReasoning(parsed);
            if (reasoningText) {
              ztoolkit.log("[SSEParser] Got reasoning content:", reasoningText);
              if (onReasoningText) {
                onReasoningText(reasoningText);
              }
            }
          } catch {
            // Ignore parse errors for this chunk
          }
        }
      }
    }
    onDone();
  } catch (error) {
    if (signal?.aborted) {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      if (onError) {
        onError(abortError);
      }
      return;
    }
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  } finally {
    if (signal) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}
