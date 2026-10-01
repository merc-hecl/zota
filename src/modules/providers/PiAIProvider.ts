/**
 * PiAIProvider - Unified AI provider.
 *
 * Provider metadata (base URLs, model lists, per-model compat settings and
 * thinking level maps) comes from pi-ai's runtime catalog (see PiAICatalog),
 * but the streaming transport is zota's own: plain fetch + SSE adapters in
 * ./streaming, one per API kind. No third-party SDK code runs inside
 * Zotero's privileged scope (where host globals like `console` are missing).
 *
 * Routing by provider type:
 * - anthropic-compatible vendors (Anthropic, MiniMax) -> anthropic-messages
 * - gemini -> google-generative-ai
 * - mistral -> mistral-conversations
 * - openai/xai/meta -> openai-responses
 * - all other OpenAI-compatible vendors -> openai-completions
 */

import type { ChatMessage, StreamCallbacks } from "../../types/chat";
import type {
  AIProvider,
  ApiKeyProviderConfig,
  ProviderConfig,
} from "../../types/provider";
import { getCatalogModels } from "./PiAICatalog";
import { resolveStreamAdapter } from "./streaming";
import type { AdapterModel, StreamRequest, ThinkingControl } from "./streaming";

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

/** Supported API kinds mapped from zota provider types */
type PiApiKind =
  | "openai-completions"
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"
  | "mistral-conversations";

const API_KIND_BY_TYPE: Record<string, PiApiKind> = {
  "anthropic-compatible": "anthropic-messages",
  gemini: "google-generative-ai",
  "openai-responses": "openai-responses",
  "mistral-conversations": "mistral-conversations",
};

function getApiKind(type: string): PiApiKind {
  return API_KIND_BY_TYPE[type] || "openai-completions";
}

/**
 * Conservative compatibility settings for OpenAI-completions endpoints and
 * models that are not covered by pi-ai's catalog. All vendors disable
 * `store` (zota never persisted server-side sessions).
 */
const CONSERVATIVE_OPENAI_COMPAT: Record<string, unknown> = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  maxTokensField: "max_tokens",
};

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
   * Collect the catalog metadata the adapter needs for the request. When the
   * selected model is known in pi-ai's catalog its entry is used wholesale
   * (carrying pi-ai's tested compat settings and thinking level map).
   * Otherwise the model is built on the fly from the stored config with
   * conservative defaults so any base URL and model id can be used.
   */
  private buildModel(): AdapterModel {
    const kind = this.apiKind;
    const catalogModels = getCatalogModels(this._config.id);
    const exact = catalogModels.find(
      (m) => m.id === this.effectiveModelId && m.api === kind,
    );

    if (exact) {
      return {
        id: this.effectiveModelId,
        provider: this._config.id,
        reasoning: exact.reasoning,
        input: exact.input,
        maxTokens: exact.maxTokens,
        thinkingLevelMap: exact.thinkingLevelMap,
        compat: exact.compat,
      };
    }

    // Vendor-level fallback: a fetched/custom model id on a catalog vendor
    // reuses the compat settings of the vendor's first model with the same
    // API kind.
    const vendorFallback = catalogModels.find((m) => m.api === kind);
    const modelInfo = this._config.models?.find(
      (m) => m.modelId === this.effectiveModelId,
    );

    return {
      id: this.effectiveModelId,
      provider: this._config.id,
      reasoning: true,
      input: ["text", "image"],
      maxTokens: modelInfo?.maxOutput || 8192,
      thinkingLevelMap: vendorFallback?.thinkingLevelMap,
      compat:
        kind === "openai-completions"
          ? vendorFallback?.compat || CONSERVATIVE_OPENAI_COMPAT
          : vendorFallback?.compat,
    };
  }

  private get effectiveModelId(): string {
    return this._config.defaultModel || "";
  }

  /**
   * Normalize base URL: adapters expect the API root without a trailing
   * slash. Anthropic/Mistral endpoints are versioned via /v1 paths, so a
   * legacy /v1 suffix is stripped; OpenAI Responses endpoint variants are
   * folded back onto the API root.
   */
  private normalizeBaseUrl(baseUrl: string, kind: PiApiKind): string {
    const trimmed = baseUrl.replace(/\/+$/, "");
    if (kind === "openai-completions" || kind === "openai-responses") {
      return trimmed.replace(/\/responses$/, "");
    }
    if (kind === "anthropic-messages" || kind === "mistral-conversations") {
      return trimmed.replace(/\/v1$/i, "");
    }
    return trimmed;
  }

  /**
   * Map zota's thinking preferences to each API kind's native thinking
   * control, mirroring the options the previous pi-ai-based stack passed.
   */
  private buildThinkingControl(): ThinkingControl {
    const kind = this.apiKind;

    if (kind === "anthropic-messages") {
      if (this._config.id === "minimax" || this._config.id === "minimax-cn") {
        // MiniMax: binary thinking toggle via budget-based thinking
        return { enabled: this.thinkingModeEnabled };
      }
      // Claude: effort-based adaptive thinking
      const enabled = this.thinkingEffort !== "none";
      return { enabled, effort: enabled ? this.thinkingEffort : undefined };
    }

    if (kind === "google-generative-ai") {
      const enabled = this.thinkingEffort !== "none";
      return {
        enabled,
        budgetTokens: enabled
          ? geminiThinkingBudget(this.thinkingEffort)
          : undefined,
      };
    }

    if (kind === "openai-responses") {
      // OpenAI/xAI/Meta: effort-based reasoning
      const enabled = this.reasoningEffort !== "none";
      return { enabled, effort: enabled ? this.reasoningEffort : undefined };
    }

    if (kind === "mistral-conversations") {
      // Mistral only accepts none|high
      const enabled =
        this.thinkingModeEnabled || this.reasoningEffort !== "none";
      return { enabled, effort: enabled ? "high" : undefined };
    }

    // OpenAI-completions family
    if (this._config.id === "deepseek") {
      // DeepSeek: thinking param only applies to deepseek-chat
      const enabled =
        this.thinkingModeEnabled && this.currentModel === "deepseek-chat";
      return { enabled, effort: enabled ? "medium" : undefined };
    }
    // Kimi/GLM/SiliconFlow and other vendors: binary toggle
    return {
      enabled: this.thinkingModeEnabled,
      effort: this.thinkingModeEnabled ? "medium" : undefined,
    };
  }

  /**
   * Filter the chat history for the request: drop error messages and empty
   * content, and normalize system-role messages to user messages (the
   * system prompt is always sent separately).
   */
  private filterMessages(messages: ChatMessage[]): ChatMessage[] {
    const filtered = messages.filter(
      (msg) => msg.role !== "error" && msg.content && msg.content.trim() !== "",
    );
    return filtered.map((msg) =>
      msg.role === "assistant" || msg.role === "user"
        ? msg
        : { ...msg, role: "user" as const },
    );
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
      const kind = this.apiKind;
      const request: StreamRequest = {
        baseUrl: this.normalizeBaseUrl(this._config.baseUrl, kind),
        apiKey: this._config.apiKey,
        modelId: this.effectiveModelId,
        systemPrompt: this.buildSystemPrompt(),
        messages: this.filterMessages(messages),
        temperature: this._config.temperature,
        maxTokens:
          this._config.maxTokens && this._config.maxTokens > 0
            ? this._config.maxTokens
            : undefined,
        signal,
      };

      const content = await resolveStreamAdapter(kind)(
        request,
        this.buildModel(),
        this.buildThinkingControl(),
        {
          onText: onChunk,
          onThinking: (delta) => onReasoningChunk?.(delta),
        },
      );
      onComplete(content);
    } catch (error) {
      // AbortError reaches onError on purpose: ChatManager relies on it to
      // preserve partial content and settle the request promise.
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
      const base = this.normalizeBaseUrl(this._config.baseUrl, kind);
      if (kind === "anthropic-messages") {
        // Anthropic-compatible: a tiny messages request validates the key
        const response = await fetch(`${base}/v1/messages`, {
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
        });
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
          `${base}/models?key=${this._config.apiKey}`,
        );
        return response.ok;
      }

      if (kind === "mistral-conversations") {
        const response = await fetch(`${base}/v1/models`, {
          headers: { Authorization: `Bearer ${this._config.apiKey}` },
        });
        return response.ok;
      }

      // OpenAI-compatible (completions/responses): list models
      const response = await fetch(`${base}/models`, {
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
      const base = this.normalizeBaseUrl(this._config.baseUrl, kind);
      if (kind === "google-generative-ai") {
        const response = await fetch(
          `${base}/models?key=${this._config.apiKey}`,
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
        const response = await fetch(`${base}/v1/models`, {
          headers: {
            "x-api-key": this._config.apiKey,
            "anthropic-version": "2023-06-01",
          },
        });
        if (response.ok) {
          const data = (await response.json()) as {
            data?: Array<{ id: string }>;
          };
          return data.data?.map((m) => m.id) || [];
        }
      } else if (kind === "mistral-conversations") {
        const response = await fetch(`${base}/v1/models`, {
          headers: { Authorization: `Bearer ${this._config.apiKey}` },
        });
        if (response.ok) {
          const data = (await response.json()) as {
            data?: Array<{ id: string }>;
          };
          return data.data?.map((m) => m.id) || [];
        }
      } else {
        // OpenAI-compatible (completions/responses)
        const response = await fetch(`${base}/models`, {
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
