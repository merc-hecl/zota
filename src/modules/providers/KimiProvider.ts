/**
 * KimiProvider - Kimi (Moonshot AI) API implementation
 * Extends OpenAIProvider with Kimi-specific features including thinking mode
 * Supports thinking mode control via thinking parameter:
 * - kimi-k2.5: Default enabled, can be disabled with "thinking": {"type": "disabled"}
 * - kimi-k2-thinking: Always has thinking enabled
 * - kimi-k2-thinking-turbo: Thinking mode variant
 */

import { OpenAIProvider } from "./OpenAIProvider";
import type { ChatMessage, StreamCallbacks } from "../../types/chat";

export class KimiProvider extends OpenAIProvider {
  private thinkingModeEnabled = true;
  private currentModel = "";

  /**
   * Enable or disable thinking mode
   * When enabled, API requests will include thinking parameter (default behavior for kimi-k2.5)
   * When disabled, explicitly sets "thinking": {"type": "disabled"}
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

  /**
   * Set current model to determine default thinking mode behavior
   */
  setCurrentModel(model: string): void {
    this.currentModel = model;
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    return this.currentModel;
  }

  /**
   * Check if thinking mode should be enabled by default for current model
   * kimi-k2.5 defaults to thinking enabled
   * kimi-k2-thinking and kimi-k2-thinking-turbo always have thinking enabled
   */
  isThinkingModeDefault(): boolean {
    const thinkingModels = [
      "kimi-k2.5",
      "kimi-k2-thinking",
      "kimi-k2-thinking-turbo",
    ];
    return thinkingModels.some((m) => this.currentModel.includes(m));
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
      const apiMessages = this.formatOpenAIMessages(messages);
      const systemPrompt = this.buildSystemPrompt(this._config.systemPrompt);
      apiMessages.unshift({
        role: "system",
        content: systemPrompt,
      });

      const requestBody: Record<string, unknown> = {
        model: this._config.defaultModel,
        messages: apiMessages,
        stream: true,
      };

      // Set temperature based on thinking mode:
      // - Thinking disabled: API requires temperature to be 0.6
      // - Thinking enabled: use user configured temperature (or default to 1.0)
      if (this.thinkingModeEnabled === false) {
        requestBody.thinking = { type: "disabled" };
        requestBody.temperature = this._config.temperature ?? 0.6;
      } else {
        requestBody.temperature = this._config.temperature ?? 1.0;
      }

      if (this._config.maxTokens && this._config.maxTokens > 0) {
        requestBody.max_tokens = this._config.maxTokens;
      } else {
        requestBody.max_tokens = 16000;
      }

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
