/**
 * AnthropicProvider - Anthropic compatible API implementation
 * Uses Anthropic Messages API format
 */

import { BaseProvider } from "./BaseProvider";
import type { ChatMessage, StreamCallbacks } from "../../types/chat";

export type ClaudeThinkingEffort = "none" | "low" | "medium" | "high" | "max";

export class AnthropicProvider extends BaseProvider {
  private _thinkingEffort: ClaudeThinkingEffort = "none";

  setThinkingEffort(effort: ClaudeThinkingEffort): void {
    this._thinkingEffort = effort;
  }

  getThinkingEffort(): ClaudeThinkingEffort {
    return this._thinkingEffort;
  }

  isThinkingEnabled(): boolean {
    return this._thinkingEffort !== "none";
  }

  async streamChatCompletion(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const { onChunk, onComplete, onError } = callbacks;

    if (!this.isReady()) {
      onError(new Error("Provider is not configured"));
      return;
    }

    try {
      const anthropicMessages = this.formatAnthropicMessages(messages);
      const systemPrompt = this.buildSystemPrompt(this._config.systemPrompt);

      const requestBody: Record<string, unknown> = {
        model: this._config.defaultModel,
        max_tokens: this._config.maxTokens || 8192,
        system: systemPrompt,
        messages: anthropicMessages,
        stream: true,
      };

      if (this._thinkingEffort !== "none") {
        requestBody.thinking = { type: "adaptive" };
        requestBody.output_config = { effort: this._thinkingEffort };
      }

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
      await this.streamWithCallbacks(response, "anthropic", callbacks, signal);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      onError(this.wrapError(error));
    }
  }

  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Provider is not configured");
    }

    const anthropicMessages = this.formatAnthropicMessages(messages);
    const systemPrompt = this.buildSystemPrompt(this._config.systemPrompt);

    const requestBody: Record<string, unknown> = {
      model: this._config.defaultModel,
      max_tokens: this._config.maxTokens || 8192,
      system: systemPrompt,
      messages: anthropicMessages,
    };

    if (this._thinkingEffort !== "none") {
      requestBody.thinking = { type: "adaptive" };
      requestBody.output_config = { effort: this._thinkingEffort };
    }

    const response = await fetch(`${this._config.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this._config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    await this.validateResponse(response);

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    return (
      data.content
        ?.filter((block) => block.type === "text")
        .map((block) => block.text || "")
        .join("") || ""
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this._config.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this._config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this._config.defaultModel || "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });

      if (response.ok) {
        return true;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const errorData = (await response.json()) as {
          type?: string;
          error?: { type?: string };
        };

        if (
          response.status === 400 &&
          (errorData.type === "invalid_request_error" ||
            errorData.error?.type === "invalid_request_error")
        ) {
          return true;
        }
      }

      return response.status === 401 || response.status === 403 ? false : true;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return this._config.availableModels || [];
  }
}
