/**
 * OpenAIProvider - OpenAI compatible API implementation
 * Supports both /v1/chat/completions and /v1/responses endpoints
 */

import { BaseProvider } from "./BaseProvider";
import type { ChatMessage, StreamCallbacks } from "../../types/chat";

export class OpenAIProvider extends BaseProvider {
  private isResponsesEndpoint(): boolean {
    const baseUrl = this._config.baseUrl || "";
    return baseUrl.includes("/v1/responses") || baseUrl.includes("/responses");
  }

  async streamChatCompletion(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    if (this.isResponsesEndpoint()) {
      await this.streamChatCompletionResponses(messages, callbacks, signal);
    } else {
      await this.streamChatCompletionCompletions(messages, callbacks, signal);
    }
  }

  private async streamChatCompletionCompletions(
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
      ztoolkit.log(
        "[OpenAIProvider] streamChatCompletionCompletions called, signal:",
        !!signal,
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
      await this.streamWithCallbacks(response, "openai", callbacks, signal);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      onError(this.wrapError(error));
    }
  }

  private async streamChatCompletionResponses(
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
      const input = this.formatInput(messages);
      const systemPrompt = this.buildSystemPrompt(this._config.systemPrompt);

      const requestBody: Record<string, unknown> = {
        model: this._config.defaultModel,
        instructions: systemPrompt,
        input: input,
        stream: true,
        store: true,
      };

      if (this._config.maxTokens && this._config.maxTokens > 0) {
        requestBody.max_output_tokens = this._config.maxTokens;
      }

      if (this._config.temperature !== undefined) {
        requestBody.temperature = this._config.temperature;
      }

      const baseUrl = this._config.baseUrl.endsWith("/v1")
        ? this._config.baseUrl
        : this._config.baseUrl.replace(/\/v1\/responses.*$/, "/v1");

      const response = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal,
      });

      await this.validateResponse(response);
      await this.parseResponsesStream(response, callbacks, signal);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      onError(this.wrapError(error));
    }
  }

  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    if (this.isResponsesEndpoint()) {
      return this.chatCompletionResponses(messages);
    } else {
      return this.chatCompletionCompletions(messages);
    }
  }

  private async chatCompletionCompletions(
    messages: ChatMessage[],
  ): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Provider is not configured");
    }

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
      stream: false,
    };

    if (this._config.maxTokens && this._config.maxTokens > 0) {
      requestBody.max_tokens = this._config.maxTokens;
    }

    const response = await fetch(`${this._config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this._config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    await this.validateResponse(response);

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content || "";
  }

  private async chatCompletionResponses(
    messages: ChatMessage[],
  ): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Provider is not configured");
    }

    const input = this.formatInput(messages);
    const systemPrompt = this.buildSystemPrompt(this._config.systemPrompt);

    const requestBody: Record<string, unknown> = {
      model: this._config.defaultModel,
      instructions: systemPrompt,
      input: input,
      store: true,
    };

    if (this._config.maxTokens && this._config.maxTokens > 0) {
      requestBody.max_output_tokens = this._config.maxTokens;
    }

    if (this._config.temperature !== undefined) {
      requestBody.temperature = this._config.temperature;
    }

    const baseUrl = this._config.baseUrl.endsWith("/v1")
      ? this._config.baseUrl
      : this._config.baseUrl.replace(/\/v1\/responses.*$/, "/v1");

    const response = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this._config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    await this.validateResponse(response);

    const data = (await response.json()) as {
      id?: string;
      output?: Array<{ type: string; text?: string }>;
      output_text?: string;
    };

    if (data.output_text) {
      return data.output_text;
    }

    if (data.output) {
      return data.output
        .filter(
          (block) => block.type === "message" || block.type === "output_text",
        )
        .map((block) => block.text || "")
        .join("");
    }

    return "";
  }

  async testConnection(): Promise<boolean> {
    try {
      const baseUrl = this._config.baseUrl.endsWith("/v1")
        ? this._config.baseUrl
        : this._config.baseUrl.replace(/\/v1\/responses.*$/, "/v1");

      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this._config.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const baseUrl = this._config.baseUrl.endsWith("/v1")
        ? this._config.baseUrl
        : this._config.baseUrl.replace(/\/v1\/responses.*$/, "/v1");

      const response = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this._config.apiKey}` },
      });
      if (response.ok) {
        const data = (await response.json()) as {
          data?: Array<{ id: string }>;
        };
        return data.data?.map((m) => m.id) || [];
      }
    } catch {
      // Ignore errors
    }
    return this._config.availableModels || [];
  }

  private formatInput(
    messages: ChatMessage[],
  ): Array<{ role: string; content: string }> {
    const filtered = this.filterMessages(messages);

    return filtered
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
      }));
  }

  private async parseResponsesStream(
    response: Response,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    const { onChunk, onComplete, onError } = callbacks;
    const reader = this.getResponseReader(response);
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    try {
      while (true) {
        if (signal?.aborted) {
          return;
        }

        const result = await reader.read();
        if (result.done) break;
        const value = result.value as Uint8Array;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            onComplete(fullContent);
            return;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "response.output_text.delta") {
              const text = parsed.delta || "";
              fullContent += text;
              onChunk(text);
            }

            if (parsed.type === "response.completed") {
              onComplete(fullContent);
              return;
            }
          } catch {
            // Ignore JSON parse errors
          }
        }
      }

      onComplete(fullContent);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      onError(this.wrapError(error));
    }
  }
}
