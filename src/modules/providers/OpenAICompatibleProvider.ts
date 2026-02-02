/**
 * OpenAICompatibleProvider - For OpenAI, DeepSeek, Mistral, Groq, OpenRouter, Custom
 */

import { BaseProvider } from "./BaseProvider";
import type { ChatMessage, StreamCallbacks } from "../../types/chat";

/**
 * Default system prompt used when user has not set a custom prompt
 */
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful research assistant. Help the user understand and analyze academic papers and documents.";

/**
 * Formatting requirements for mathematical formulas
 * This is always appended to ensure consistent rendering
 */
const FORMATTING_REQUIREMENTS = `

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

export class OpenAICompatibleProvider extends BaseProvider {
  /**
   * Build the complete system prompt
   * - If user has custom prompt: user custom prompt + formatting requirements
   * - If user has no custom prompt: default prompt + formatting requirements
   */
  private buildSystemPrompt(userCustomPrompt?: string): string {
    const basePrompt = userCustomPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
    return basePrompt + FORMATTING_REQUIREMENTS;
  }

  async streamChatCompletion(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
  ): Promise<void> {
    const { onChunk, onComplete, onError } = callbacks;

    if (!this.isReady()) {
      onError(new Error("Provider is not configured"));
      return;
    }

    try {
      const apiMessages = this.formatOpenAIMessages(messages);

      // Always include system prompt with base instructions + user custom + formatting requirements
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
      });

      await this.validateResponse(response);
      await this.streamWithCallbacks(response, "openai", callbacks);
    } catch (error) {
      onError(this.wrapError(error));
    }
  }

  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Provider is not configured");
    }

    const apiMessages = this.formatOpenAIMessages(messages);

    // Always include system prompt with base instructions + user custom + formatting requirements
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

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this._config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this._config.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this._config.baseUrl}/models`, {
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
}
