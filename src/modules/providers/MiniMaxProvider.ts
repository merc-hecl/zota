/**
 * MiniMaxProvider - MiniMax API implementation
 * Extends AnthropicProvider as MiniMax supports Anthropic-compatible API
 * Supports both domestic (China) and international endpoints
 * Supports thinking mode via reasoning_split parameter
 */

import { AnthropicProvider } from "./AnthropicProvider";
import type { ApiKeyProviderConfig, ModelInfo } from "../../types/provider";
import type { ChatMessage, StreamCallbacks } from "../../types/chat";

const MINIMAX_DEFAULT_MODELS: ModelInfo[] = [
  {
    modelId: "MiniMax-M2.5",
    nickname: "M2.5",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2.5-highspeed",
    nickname: "M2.5 Highspeed",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2.1",
    nickname: "M2.1",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2.1-highspeed",
    nickname: "M2.1 Highspeed",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2",
    nickname: "M2",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "M2-her",
    nickname: "M2-her",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning"],
  },
];

export class MiniMaxProvider extends AnthropicProvider {
  private thinkingModeEnabled = false;

  constructor(config: ApiKeyProviderConfig) {
    const configWithModels: ApiKeyProviderConfig = {
      ...config,
      models: config.models?.length ? config.models : MINIMAX_DEFAULT_MODELS,
      availableModels:
        config.availableModels?.length > 0
          ? config.availableModels
          : MINIMAX_DEFAULT_MODELS.map((m) => m.modelId),
    };
    super(configWithModels);
  }

  async getAvailableModels(): Promise<string[]> {
    if (
      this._config.availableModels &&
      this._config.availableModels.length > 0
    ) {
      return this._config.availableModels;
    }
    return MINIMAX_DEFAULT_MODELS.map((m) => m.modelId);
  }

  /**
   * Enable or disable thinking mode
   * When enabled, API requests will include reasoning_split parameter
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
   * Override streamChatCompletion to support MiniMax reasoning_split parameter
   * MiniMax uses Anthropic-compatible API but with different thinking parameters
   */
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
        "[MiniMaxProvider] streamChatCompletion called, thinking mode:",
        this.thinkingModeEnabled,
      );

      const anthropicMessages = this.formatAnthropicMessages(messages);
      const systemPrompt = this.buildSystemPrompt(this._config.systemPrompt);

      const requestBody: Record<string, unknown> = {
        model: this._config.defaultModel,
        max_tokens: this._config.maxTokens || 8192,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
      };

      // Enable thinking mode via reasoning_split parameter
      // This makes reasoning content appear in reasoning_details field
      if (this.thinkingModeEnabled) {
        requestBody.extra_body = {
          reasoning_split: true,
        };
      }

      ztoolkit.log(
        "[MiniMaxProvider] Request body:",
        JSON.stringify(requestBody),
      );

      const response = await fetch(`${this._config.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this._config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      await this.validateResponse(response);

      // Use custom stream parsing for MiniMax
      await this.parseMiniMaxStream(
        response,
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
   * Custom SSE parser for MiniMax that handles reasoning_details
   */
  private async parseMiniMaxStream(
    response: Response,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const { onChunk, onComplete, onError, onReasoningChunk } = callbacks;
    const reader = this.getResponseReader(response);
    let fullContent = "";
    let fullReasoningContent = "";
    const decoder = new TextDecoder();
    let buffer = "";

    const abortHandler = (): void => {
      ztoolkit.log("[MiniMaxProvider] abortHandler called");
      reader.cancel().catch(() => {});
    };

    if (signal) {
      signal.addEventListener("abort", abortHandler);
    }

    try {
      while (true) {
        if (signal?.aborted) {
          const abortError = new Error("Request aborted");
          abortError.name = "AbortError";
          onError(abortError);
          return;
        }

        const result = await reader.read();

        if (result.done) {
          break;
        }

        const value = result.value as Uint8Array;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            // Check for message stop
            if (parsed.type === "message_stop") {
              onComplete(fullContent);
              return;
            }

            // Extract text content
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              const text = parsed.delta.text;
              fullContent += text;
              onChunk(text);
            }

            // Extract reasoning content from reasoning_details field
            if (this.thinkingModeEnabled && parsed.reasoning_details) {
              const reasoningDetails = parsed.reasoning_details as Array<{
                text?: string;
              }>;
              if (reasoningDetails.length > 0 && reasoningDetails[0]?.text) {
                const reasoningText = reasoningDetails[0].text;
                fullReasoningContent += reasoningText;
                if (onReasoningChunk) {
                  onReasoningChunk(reasoningText);
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      onComplete(fullContent);
    } catch (error) {
      if (signal?.aborted) {
        const abortError = new Error("Request aborted");
        abortError.name = "AbortError";
        onError(abortError);
        return;
      }
      onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
    }
  }
}

export { MINIMAX_DEFAULT_MODELS };
