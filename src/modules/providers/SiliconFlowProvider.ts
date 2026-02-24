/**
 * SiliconFlowProvider - SiliconFlow API implementation
 * Extends OpenAIProvider with SiliconFlow-specific features including thinking mode
 * Supports both domestic (China) and international endpoints
 */

import { OpenAIProvider } from "./OpenAIProvider";
import type { ChatMessage, StreamCallbacks } from "../../types/chat";

export class SiliconFlowProvider extends OpenAIProvider {
  private thinkingModeEnabled = false;

  /**
   * Enable or disable thinking mode
   * When enabled, API requests will include enable_thinking: true
   */
  setThinkingMode(enabled: boolean): void {
    this.thinkingModeEnabled = enabled;
  }

  /**
   * Check if thinking mode is enabled
   */
  isThinkingModeEnabled(): boolean {
    return this.thinkingModeEnabled;
  }

  async streamChatCompletion(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const { onChunk, onComplete, onError, onReasoningChunk } = callbacks;

    if (!this.isReady()) {
      onError(new Error("Provider is not configured"));
      return;
    }

    try {
      ztoolkit.log(
        "[SiliconFlowProvider] streamChatCompletion called, thinking mode:",
        this.thinkingModeEnabled,
      );

      const apiMessages = this.formatOpenAIMessages(messages);
      const systemPrompt = this.buildSystemPrompt(this._config.systemPrompt);
      apiMessages.unshift({
        role: "system",
        content: systemPrompt,
      });

      const requestBody: Record<string, unknown> = {
        model: this._config.defaultModel,
        messages: apiMessages,
        temperature: this._config.temperature ?? 0.7,
        stream: true,
      };

      if (this._config.maxTokens && this._config.maxTokens > 0) {
        requestBody.max_tokens = this._config.maxTokens;
      }

      // Enable thinking mode if set
      if (this.thinkingModeEnabled) {
        requestBody.enable_thinking = true;
      }

      ztoolkit.log(
        "[SiliconFlowProvider] Request body:",
        JSON.stringify(requestBody),
      );

      const response = await fetch(`${this._config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      await this.validateResponse(response);
      await this.streamWithCallbacks(
        response,
        "openai",
        {
          onChunk,
          onComplete,
          onError,
          onReasoningChunk,
        },
        signal,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      onError(this.wrapError(error));
    }
  }

  /**
   * Override streamWithCallbacks to handle reasoning_content from SSE chunks
   */
  protected async streamWithCallbacks(
    response: Response,
    format: "openai" | "anthropic" | "gemini",
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const { onChunk, onComplete, onError, onReasoningChunk } = callbacks;
    const reader = this.getResponseReader(response);
    let fullContent = "";
    let fullReasoningContent = "";

    await this.parseSSE(
      reader,
      format,
      {
        onText: (text) => {
          fullContent += text;
          onChunk(text);
        },
        onReasoningText: (text) => {
          if (onReasoningChunk) {
            fullReasoningContent += text;
            onReasoningChunk(text);
          }
        },
        onDone: () => onComplete(fullContent),
        onError,
      },
      signal,
    );
  }
}
