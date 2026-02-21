/**
 * BaseProvider - Abstract base class with shared functionality
 */

import type {
  ChatMessage,
  StreamCallbacks,
  OpenAIMessage,
  OpenAIMessageContent,
} from "../../types/chat";
import type {
  AIProvider,
  ApiKeyProviderConfig,
  AnthropicMessage,
  AnthropicTextBlock,
  AnthropicImageBlock,
  GeminiContent,
  GeminiPart,
} from "../../types/provider";
import {
  parseSSEStream,
  type SSEFormat,
  type SSEParserCallbacks,
} from "./SSEParser";

export abstract class BaseProvider implements AIProvider {
  protected _config: ApiKeyProviderConfig;

  static readonly DEFAULT_SYSTEM_PROMPT =
    "You are a helpful research assistant. Help the user understand and analyze academic papers and documents.";

  static readonly FORMATTING_REQUIREMENTS = `

=== FORMATTING REQUIREMENTS ===

When writing mathematical formulas, you MUST follow these formatting rules:

1. ALWAYS wrap inline formulas with single dollar signs: $formula$
   - Correct: The energy is $E = mc^2$ and the result is...
   - Incorrect: The energy is $E = mc^2 and the result is...$

2. ALWAYS wrap block/display formulas with double dollar signs: $$formula$$
   - Put the opening $$ on its own line or at the start of a line
   - Put the closing $$ on its own line or at the end of a line

3. NEVER put other text inside the dollar signs with LaTeX code
   - Correct: The formula is $E = mc^2$ where $E$ represents energy
   - Incorrect: The formula is $E = mc^2 where E represents energy$

4. Keep LaTeX code clean inside dollar signs - only mathematical expressions, no explanatory text

=== END FORMATTING REQUIREMENTS ===`;

  constructor(config: ApiKeyProviderConfig) {
    this._config = config;
  }

  protected buildSystemPrompt(userCustomPrompt?: string): string {
    const basePrompt =
      userCustomPrompt?.trim() || BaseProvider.DEFAULT_SYSTEM_PROMPT;
    return basePrompt + BaseProvider.FORMATTING_REQUIREMENTS;
  }

  get config(): ApiKeyProviderConfig {
    return this._config;
  }

  getName(): string {
    return this._config.name;
  }

  isReady(): boolean {
    return (
      !!this._config.apiKey && !!this._config.baseUrl && this._config.enabled
    );
  }

  updateConfig(config: Partial<ApiKeyProviderConfig>): void {
    this._config = { ...this._config, ...config };
  }

  abstract streamChatCompletion(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void>;

  abstract chatCompletion(messages: ChatMessage[]): Promise<string>;

  abstract testConnection(): Promise<boolean>;

  abstract getAvailableModels(): Promise<string[]>;

  /**
   * Parse SSE stream using unified parser
   */
  protected async parseSSE(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    format: SSEFormat,
    callbacks: SSEParserCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    return parseSSEStream(reader, format, callbacks, signal);
  }

  /**
   * Validate fetch response and throw error if not ok
   */
  protected async validateResponse(response: Response): Promise<void> {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
  }

  /**
   * Get readable stream reader from response, throws if unavailable
   */
  protected getResponseReader(
    response: Response,
  ): ReadableStreamDefaultReader<Uint8Array> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");
    return reader as ReadableStreamDefaultReader<Uint8Array>;
  }

  /**
   * Stream SSE response with content accumulation
   */
  protected async streamWithCallbacks(
    response: Response,
    format: SSEFormat,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const { onChunk, onComplete, onError } = callbacks;
    const reader = this.getResponseReader(response);
    let fullContent = "";

    await this.parseSSE(
      reader,
      format,
      {
        onText: (text) => {
          fullContent += text;
          onChunk(text);
        },
        onDone: () => onComplete(fullContent),
        onError,
      },
      signal,
    );
  }

  /**
   * Wrap unknown error as Error instance
   */
  protected wrapError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * Filter messages - remove empty content and error messages
   */
  protected filterMessages(messages: ChatMessage[]): ChatMessage[] {
    const nonErrorMessages = messages.filter((msg) => msg.role !== "error");
    const lastIndex = nonErrorMessages.length - 1;

    return nonErrorMessages.filter((msg, index) => {
      if (index === lastIndex && msg.role === "assistant") {
        return msg.content.trim() !== "";
      }
      return msg.content && msg.content.trim() !== "";
    });
  }

  /**
   * Format messages for OpenAI-compatible API
   */
  protected formatOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
    const filtered = this.filterMessages(messages);

    return filtered.map((msg) => {
      if (msg.images && msg.images.length > 0) {
        const content: OpenAIMessageContent[] = [];

        if (msg.content && msg.content.trim()) {
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

        return {
          role: msg.role as "user" | "assistant" | "system",
          content,
        };
      }

      return {
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      };
    });
  }

  /**
   * Format messages for Anthropic API
   */
  protected formatAnthropicMessages(
    messages: ChatMessage[],
  ): AnthropicMessage[] {
    const filtered = this.filterMessages(messages).filter(
      (msg) => msg.role !== "system",
    );

    return filtered.map((msg) => {
      const hasImages = msg.images && msg.images.length > 0;

      if (hasImages) {
        const content: (AnthropicTextBlock | AnthropicImageBlock)[] = [];

        if (msg.images) {
          for (const img of msg.images) {
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: img.mimeType,
                data: img.base64,
              },
            });
          }
        }

        content.push({ type: "text", text: msg.content });

        return { role: msg.role as "user" | "assistant", content };
      }

      return { role: msg.role as "user" | "assistant", content: msg.content };
    });
  }

  /**
   * Format messages for Gemini API
   */
  protected formatGeminiMessages(messages: ChatMessage[]): GeminiContent[] {
    return this.filterMessages(messages)
      .filter((msg) => msg.role !== "system")
      .map((msg) => {
        const parts: GeminiPart[] = [];

        if (msg.images && msg.images.length > 0) {
          for (const img of msg.images) {
            parts.push({
              inline_data: {
                mime_type: img.mimeType,
                data: img.base64,
              },
            });
          }
        }

        parts.push({ text: msg.content });

        return {
          role: msg.role === "assistant" ? "model" : "user",
          parts,
        };
      });
  }
}
