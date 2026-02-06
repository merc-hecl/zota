/**
 * BaseProvider - Abstract base class with shared functionality
 */

import type {
  ChatMessage,
  StreamCallbacks,
  OpenAIMessage,
  OpenAIMessageContent,
} from "../../types/chat";
import type { AIProvider, ApiKeyProviderConfig } from "../../types/provider";
import {
  parseSSEStream,
  type SSEFormat,
  type SSEParserCallbacks,
} from "./SSEParser";

export abstract class BaseProvider implements AIProvider {
  protected _config: ApiKeyProviderConfig;

  constructor(config: ApiKeyProviderConfig) {
    this._config = config;
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
  ): Promise<void> {
    return parseSSEStream(reader, format, callbacks);
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
   * Handles the common pattern of accumulating content and calling callbacks
   */
  protected async streamWithCallbacks(
    response: Response,
    format: SSEFormat,
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const { onChunk, onComplete, onError } = callbacks;
    const reader = this.getResponseReader(response);
    let fullContent = "";

    await this.parseSSE(reader, format, {
      onText: (text) => {
        fullContent += text;
        onChunk(text);
      },
      onDone: () => onComplete(fullContent),
      onError,
    });
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
      // Allow empty content for last assistant message (streaming placeholder)
      if (index === lastIndex && msg.role === "assistant") {
        return msg.content.trim() !== "";
      }
      return msg.content && msg.content.trim() !== "";
    });
  }

  /**
   * Format messages for OpenAI-compatible API
   * Supports text and image content (Vision API)
   */
  protected formatOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
    const filtered = this.filterMessages(messages);

    return filtered.map((msg) => {
      // If message has images, use array content format for Vision API
      if (msg.images && msg.images.length > 0) {
        const content: OpenAIMessageContent[] = [];

        // Add text content if present
        if (msg.content && msg.content.trim()) {
          content.push({ type: "text", text: msg.content });
        }

        // Add images
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

      // Plain text message
      return {
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      };
    });
  }
}
