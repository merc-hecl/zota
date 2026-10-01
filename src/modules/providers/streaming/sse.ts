/**
 * Shared wire helpers for zota's own streaming adapters.
 *
 * Zotero loads plugin code via loadSubScript into a privileged scope that
 * lacks standard host globals, so the adapters rely only on fetch,
 * TextDecoder and AbortSignal — the same primitives the pre-pi-ai provider
 * stack used successfully.
 */

const SSE_EVENT_BOUNDARY = /\r\n\r\n|\n\n|\r\r/;

/** Standard abort error (callers treat AbortError as a silent stop). */
export function abortError(): Error {
  const error = new Error("Request aborted");
  error.name = "AbortError";
  return error;
}

/** Throw a readable error for a non-2xx API response. */
export async function assertOkResponse(response: Response): Promise<void> {
  if (response.ok) return;
  let body = "";
  try {
    body = await response.text();
  } catch {
    // keep the empty body
  }
  throw new Error(apiErrorMessage(response.status, body));
}

function apiErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown; error?: { message?: unknown } };
      message?: unknown;
    };
    const message =
      parsed.error?.message ?? parsed.error?.error?.message ?? parsed.message;
    if (typeof message === "string" && message.length > 0) {
      return `API Error ${status}: ${message}`;
    }
  } catch {
    // fall through to the raw body
  }
  return `API Error ${status}: ${body.slice(0, 500)}`;
}

/**
 * Read a fetch response body as Server-Sent Events. Each complete event's
 * `data:` payload (multi-line data joined with \n) is passed to onData.
 * Resolves when the stream ends; throws AbortError when the signal fires.
 */
export async function readSSE(
  response: Response,
  onData: (data: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const bodyStream = response.body;
  if (!bodyStream) throw new Error("Response body is not readable");
  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const onAbort = (): void => {
    void reader.cancel().catch(() => {});
  };
  if (signal) signal.addEventListener("abort", onAbort);

  try {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let match = SSE_EVENT_BOUNDARY.exec(buffer);
      while (match) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = parseDataLines(block);
        if (data !== undefined) onData(data);
        match = SSE_EVENT_BOUNDARY.exec(buffer);
      }
    }
    buffer += decoder.decode();
    const tail = parseDataLines(buffer);
    if (tail !== undefined) onData(tail);
    if (signal?.aborted) throw abortError();
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
    try {
      await reader.cancel();
    } catch {
      // reader already closed/cancelled
    }
  }
}

function parseDataLines(block: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  return dataLines.length > 0 ? dataLines.join("\n") : undefined;
}
