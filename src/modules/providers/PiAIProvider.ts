/**
 * PiAIProvider - Unified AI provider backed by @earendil-works/pi-ai
 *
 * Replaces the per-vendor provider implementations with pi-ai's API adapters:
 * - anthropic-compatible vendors (Claude, MiniMax) -> anthropic-messages API
 * - gemini -> google-generative-ai API
 * - all other OpenAI-compatible vendors -> openai-completions API
 *
 * Models are constructed on the fly from the stored provider config so that
 * custom base URLs, fetched model lists, and user-added custom models all work
 * without depending on pi-ai's static catalog.
 */

import { normalizeContext } from "@earendil-works/pi-ai";
import type {
  Context,
  Message,
  Model,
  UserMessage,
} from "@earendil-works/pi-ai";
import { stream as openAICompletionsStream } from "@earendil-works/pi-ai/api/openai-completions";
import { stream as anthropicMessagesStream } from "@earendil-works/pi-ai/api/anthropic-messages";
import { stream as googleGenerativeAIStream } from "@earendil-works/pi-ai/api/google-generative-ai";
import type { ChatMessage, StreamCallbacks } from "../../types/chat";
import type {
  AIProvider,
  ApiKeyProviderConfig,
  ProviderConfig,
} from "../../types/provider";

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful research assistant. Help the user understand and analyze academic papers and documents.";

export const FORMATTING_REQUIREMENTS = `

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

type OpenAICompletionsModel = Model<"openai-completions">;
type AnthropicMessagesModel = Model<"anthropic-messages">;
type GoogleGenerativeAIModel = Model<"google-generative-ai">;

/** Supported pi-ai API kinds mapped from zota provider types */
type PiApiKind =
  | "openai-completions"
  | "anthropic-messages"
  | "google-generative-ai";

const API_KIND_BY_TYPE: Record<string, PiApiKind> = {
  "anthropic-compatible": "anthropic-messages",
  gemini: "google-generative-ai",
};

function getApiKind(type: string): PiApiKind {
  return API_KIND_BY_TYPE[type] || "openai-completions";
}

/**
 * Vendor-specific OpenAI-completions compatibility settings, mirroring the
 * tested configurations from pi-ai's built-in provider catalogs. All vendors
 * disable `store` (zota never persisted server-side sessions).
 */
function getOpenAICompat(
  type: string,
  isBuiltin: boolean,
): OpenAICompletionsModel["compat"] {
  // Built-in OpenAI keeps pi-ai defaults (developer role, max_completion_tokens)
  if (isBuiltin && type === "openai-compatible") {
    return { supportsStore: false };
  }
  switch (type) {
    case "deepseek":
      // https://api.deepseek.com - thinking: {type} + max_tokens
      return {
        supportsStore: false,
        maxTokensField: "max_tokens",
      };
    case "kimi":
      // api.moonshot.cn / api.moonshot.ai - thinking: {type} only
      return {
        supportsStore: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
        supportsMidConvoSystemMessages: true,
      };
    case "glm":
      // open.bigmodel.cn / api.z.ai - thinking: {type: enabled|disabled}
      return {
        supportsStore: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
      };
    case "siliconflow":
      // api.siliconflow.cn - enable_thinking via qwen-style format
      return {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
        thinkingFormat: "qwen",
      };
    case "mistral":
      return { supportsStore: false, maxTokensField: "max_tokens" };
    case "groq":
    case "openrouter":
    case "xai":
      // Auto-detected by pi-ai from the base URL where applicable
      return { supportsStore: false };
    default:
      // Custom OpenAI-compatible endpoints - conservative settings
      return {
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        maxTokensField: "max_tokens",
      };
  }
}

/** Gemini thinking budget mapped from effort level (parity with the old provider) */
function geminiThinkingBudget(effort: string): number {
  switch (effort) {
    case "low":
      return 1024;
    case "medium":
      return 4096;
    case "high":
      return 16384;
    default:
      return 1024;
  }
}

export class PiAIProvider implements AIProvider {
  protected _config: ApiKeyProviderConfig;

  // Unified thinking controls (set by ChatManager before each request)
  private thinkingModeEnabled = false;
  private reasoningEffort = "medium"; // OpenAI-style: none|low|medium|high|xhigh
  private thinkingEffort = "none"; // Claude/Gemini-style: none|low|medium|high
  private currentModel = "";

  constructor(config: ApiKeyProviderConfig) {
    this._config = config;
  }

  get config(): ProviderConfig {
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

  updateConfig(config: Partial<ProviderConfig>): void {
    this._config = { ...this._config, ...config } as ApiKeyProviderConfig;
  }

  /** Enable/disable binary thinking mode (SiliconFlow/DeepSeek/Kimi/GLM/MiniMax) */
  setThinkingMode(enabled: boolean): void {
    this.thinkingModeEnabled = enabled;
  }

  isThinkingModeEnabled(): boolean {
    return this.thinkingModeEnabled;
  }

  /** Set OpenAI-style reasoning effort (none|low|medium|high|xhigh) */
  setReasoningEffort(effort: string): void {
    this.reasoningEffort = effort;
  }

  getReasoningEffort(): string {
    return this.reasoningEffort;
  }

  /** Set Claude/Gemini-style thinking effort (none|low|medium|high) */
  setThinkingEffort(effort: string): void {
    this.thinkingEffort = effort;
  }

  getThinkingEffort(): string {
    return this.thinkingEffort;
  }

  /** Track the currently selected model (for per-model thinking behavior) */
  setCurrentModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  private get apiKind(): PiApiKind {
    return getApiKind(this._config.type);
  }

  private buildSystemPrompt(): string {
    const basePrompt =
      this._config.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;
    return basePrompt + FORMATTING_REQUIREMENTS;
  }

  /**
   * Construct a pi-ai Model on the fly from the provider config so any
   * base URL and any model id (fetched or custom) can be used.
   */
  private buildModel():
    | OpenAICompletionsModel
    | AnthropicMessagesModel
    | GoogleGenerativeAIModel {
    const kind = this.apiKind;
    const modelInfo = this._config.models?.find(
      (m) => m.modelId === this.effectiveModelId,
    );
    const base = {
      id: this.effectiveModelId,
      name: modelInfo?.nickname || this.effectiveModelId,
      provider: this._config.id,
      baseUrl: this.normalizeBaseUrl(this._config.baseUrl, kind),
      reasoning: this.supportsThinkingControl(),
      input: ["text", "image"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: modelInfo?.contextWindow || 128000,
      maxTokens: modelInfo?.maxOutput || 8192,
    };

    switch (kind) {
      case "anthropic-messages":
        return {
          ...base,
          api: "anthropic-messages",
          // Claude models use adaptive thinking (effort-based)
          compat:
            this._config.id === "claude"
              ? { forceAdaptiveThinking: true }
              : undefined,
        };
      case "google-generative-ai":
        return { ...base, api: "google-generative-ai" };
      default:
        return {
          ...base,
          api: "openai-completions",
          compat: getOpenAICompat(this._config.type, this._config.isBuiltin),
        };
    }
  }

  private get effectiveModelId(): string {
    return this._config.defaultModel || "";
  }

  /** Whether thinking controls apply for this provider type */
  private supportsThinkingControl(): boolean {
    switch (this._config.type) {
      case "deepseek":
      case "kimi":
      case "glm":
      case "siliconflow":
      case "minimax":
      case "openai-compatible":
      case "anthropic-compatible":
      case "gemini":
        return true;
      default:
        return true;
    }
  }

  /** Normalize base URL: pi-ai SDKs expect the versioned root without trailing slash */
  private normalizeBaseUrl(baseUrl: string, kind: PiApiKind): string {
    const trimmed = baseUrl.replace(/\/+$/, "");
    // OpenAI Responses endpoint variant is handled by the completions API root
    if (kind === "openai-completions") {
      return trimmed.replace(/\/responses$/, "");
    }
    return trimmed;
  }

  /**
   * Build pi-ai request options per API kind, mapping zota's thinking prefs
   * to each API's native thinking parameters.
   */
  private buildStreamOptions(signal?: AbortSignal): Record<string, unknown> {
    const kind = this.apiKind;
    const maxTokens =
      this._config.maxTokens && this._config.maxTokens > 0
        ? this._config.maxTokens
        : undefined;
    const temperature = this._config.temperature;

    const options: Record<string, unknown> = {
      apiKey: this._config.apiKey,
      signal,
      temperature,
      maxTokens,
    };

    if (kind === "anthropic-messages") {
      // Anthropic requires max_tokens
      if (!options.maxTokens) options.maxTokens = 8192;
      if (this._config.type === "minimax") {
        // MiniMax: binary thinking toggle via budget-based thinking
        if (this.thinkingModeEnabled) {
          options.thinkingEnabled = true;
        }
      } else {
        // Claude: effort-based adaptive thinking
        if (this.thinkingEffort !== "none") {
          options.thinkingEnabled = true;
          options.effort = this.thinkingEffort;
        }
      }
    } else if (kind === "google-generative-ai") {
      if (this.thinkingEffort !== "none") {
        options.thinking = {
          enabled: true,
          budgetTokens: geminiThinkingBudget(this.thinkingEffort),
        };
      }
    } else {
      // OpenAI-completions family
      if (
        this._config.type === "openai-compatible" &&
        this._config.id === "openai"
      ) {
        // OpenAI: effort-based reasoning
        if (this.reasoningEffort !== "none") {
          options.reasoningEffort = this.reasoningEffort;
        }
      } else if (this._config.type === "deepseek") {
        // DeepSeek: thinking param only applies to deepseek-chat
        if (this.thinkingModeEnabled && this.currentModel === "deepseek-chat") {
          options.reasoningEffort = "medium";
        }
      } else if (this.thinkingModeEnabled) {
        // SiliconFlow/Kimi/GLM and other vendors: binary toggle
        options.reasoningEffort = "medium";
      }
    }

    return options;
  }

  /**
   * Convert zota ChatMessages to pi-ai messages.
   * Filters out error messages and empty content, keeps image attachments.
   */
  private buildPiMessages(messages: ChatMessage[]): Message[] {
    const nonError = messages.filter((msg) => msg.role !== "error");
    const lastIndex = nonError.length - 1;

    const filtered = nonError.filter((msg, index) => {
      if (index === lastIndex && msg.role === "assistant") {
        return msg.content.trim() !== "";
      }
      return msg.content && msg.content.trim() !== "";
    });

    return filtered.map((msg): Message => {
      const timestamp = msg.timestamp || Date.now();

      if (msg.role === "assistant") {
        return {
          role: "assistant",
          content: [{ type: "text", text: msg.content }],
          api: this.apiKind,
          provider: this._config.id,
          model: this.effectiveModelId,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: "stop",
          timestamp,
        };
      }

      const userMessage: UserMessage = {
        role: "user",
        content: msg.content,
        timestamp,
      };

      if (msg.images && msg.images.length > 0) {
        const content: UserMessage["content"] = [];
        if (msg.content && msg.content.trim()) {
          content.push({ type: "text", text: msg.content });
        }
        for (const image of msg.images) {
          content.push({
            type: "image",
            data: image.base64,
            mimeType: image.mimeType,
          });
        }
        userMessage.content = content;
      }

      return userMessage;
    });
  }

  private buildContext(messages: ChatMessage[]): Context {
    return {
      systemPrompt: this.buildSystemPrompt(),
      messages: this.buildPiMessages(messages),
    };
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
      const model = this.buildModel();
      const context = normalizeContext(this.buildContext(messages));
      const options = this.buildStreamOptions(signal);
      const stream =
        this.apiKind === "anthropic-messages"
          ? anthropicMessagesStream(
              model as AnthropicMessagesModel,
              context,
              options as never,
            )
          : this.apiKind === "google-generative-ai"
            ? googleGenerativeAIStream(
                model as GoogleGenerativeAIModel,
                context,
                options as never,
              )
            : openAICompletionsStream(
                model as OpenAICompletionsModel,
                context,
                options as never,
              );

      let fullContent = "";
      let settled = false;

      const complete = (content: string) => {
        if (settled) return;
        settled = true;
        onComplete(content);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        onError(error);
      };

      for await (const event of stream) {
        if (settled) break;
        switch (event.type) {
          case "text_delta":
            fullContent += event.delta;
            onChunk(event.delta);
            break;
          case "thinking_delta":
            if (onReasoningChunk) {
              onReasoningChunk(event.delta);
            }
            break;
          case "done": {
            // Prefer the authoritative final message content
            const text = event.message.content
              .filter((block) => block.type === "text")
              .map((block) => (block.type === "text" ? block.text : ""))
              .join("");
            complete(text || fullContent);
            break;
          }
          case "error": {
            if (event.reason === "aborted") {
              const abortError = new Error("Request aborted");
              abortError.name = "AbortError";
              fail(abortError);
            } else {
              const message = event.error.errorMessage || "API request failed";
              fail(new Error(message));
            }
            break;
          }
          default:
            break;
        }
      }

      // Stream ended without a terminal event (should not happen, but be safe)
      complete(fullContent);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async chatCompletion(messages: ChatMessage[]): Promise<string> {
    if (!this.isReady()) {
      throw new Error("Provider is not configured");
    }

    let fullContent = "";
    await new Promise<void>((resolve, reject) => {
      void this.streamChatCompletion(messages, {
        onChunk: () => {},
        onComplete: (content) => {
          fullContent = content;
          resolve();
        },
        onError: (error) => reject(error),
      });
    });
    return fullContent;
  }

  async testConnection(): Promise<boolean> {
    if (!this.isReady()) return false;

    try {
      const kind = this.apiKind;
      if (kind === "anthropic-messages") {
        // Anthropic-compatible: a tiny messages request validates the key
        const response = await fetch(
          `${this._config.baseUrl.replace(/\/+$/, "")}/messages`,
          {
            method: "POST",
            headers: {
              "x-api-key": this._config.apiKey,
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.effectiveModelId || "claude-3-haiku-20240307",
              max_tokens: 1,
              messages: [{ role: "user", content: "Hi" }],
            }),
          },
        );
        if (response.ok) return true;
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
        return response.status === 401 || response.status === 403
          ? false
          : true;
      }

      if (kind === "google-generative-ai") {
        const response = await fetch(
          `${this._config.baseUrl.replace(/\/+$/, "")}/models?key=${this._config.apiKey}`,
        );
        return response.ok;
      }

      // OpenAI-compatible: list models
      const baseUrl = this._config.baseUrl
        .replace(/\/+$/, "")
        .replace(/\/responses$/, "");
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
      const kind = this.apiKind;
      if (kind === "google-generative-ai") {
        const response = await fetch(
          `${this._config.baseUrl.replace(/\/+$/, "")}/models?key=${this._config.apiKey}`,
        );
        if (response.ok) {
          const data = (await response.json()) as {
            models?: Array<{
              name: string;
              supportedGenerationMethods?: string[];
            }>;
          };
          return (
            data.models
              ?.filter(
                (m) =>
                  m.supportedGenerationMethods?.includes("generateContent") &&
                  m.name.includes("gemini"),
              )
              .map((m) => m.name.replace("models/", "")) || []
          );
        }
      } else if (kind === "anthropic-messages") {
        const response = await fetch(
          `${this._config.baseUrl.replace(/\/+$/, "")}/models`,
          {
            headers: {
              "x-api-key": this._config.apiKey,
              "anthropic-version": "2023-06-01",
            },
          },
        );
        if (response.ok) {
          const data = (await response.json()) as {
            data?: Array<{ id: string }>;
          };
          return data.data?.map((m) => m.id) || [];
        }
      } else {
        const baseUrl = this._config.baseUrl
          .replace(/\/+$/, "")
          .replace(/\/responses$/, "");
        const response = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${this._config.apiKey}` },
        });
        if (response.ok) {
          const data = (await response.json()) as {
            data?: Array<{ id: string }>;
          };
          return data.data?.map((m) => m.id) || [];
        }
      }
    } catch {
      // Ignore errors
    }
    return this._config.availableModels || [];
  }
}
