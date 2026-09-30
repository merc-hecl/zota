/**
 * Provider Types - Multi-provider AI API type definitions
 */

import type { ChatMessage, StreamCallbacks } from "./chat";

/**
 * Model capabilities
 */
export type ModelCapability =
  | "vision"
  | "reasoning"
  | "tool_use"
  | "web_search";

/**
 * Model information with metadata
 */
export interface ModelInfo {
  modelId: string;
  nickname?: string;
  contextWindow?: number;
  maxOutput?: number;
  capabilities?: ModelCapability[];
  isCustom?: boolean;
}

/**
 * Supported provider types, one per routed pi-ai API kind
 */
export type ProviderType =
  | "anthropic-compatible"
  | "gemini"
  | "openai-compatible"
  | "openai-responses"
  | "mistral-conversations";

/**
 * Provider identifier for built-in providers (pi-ai's kebab-case ids).
 */
export type BuiltinProviderId = string;

/**
 * Base provider configuration
 */
export interface BaseProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  enabled: boolean;
  isBuiltin: boolean;
  order: number;
}

/**
 * Configuration for API key-based providers
 */
export interface ApiKeyProviderConfig extends BaseProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  models?: ModelInfo[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  pdfMaxChars?: number;
  maxDocuments?: number;
  streamingOutput?: boolean;
}

/**
 * Union type for all provider configs
 */
export type ProviderConfig = ApiKeyProviderConfig;

/**
 * Provider metadata for display and defaults
 */
export interface ProviderMetadata {
  id: BuiltinProviderId;
  name: string;
  defaultBaseUrl: string;
  website: string;
  type: ProviderType;
  /** Optional static model list (e.g. from pi-ai's catalog) */
  availableModels?: string[];
  models?: ModelInfo[];
}

/**
 * Provider storage format (for Zotero prefs)
 */
export interface ProviderStorageData {
  activeProviderId: string;
  providers: ProviderConfig[];
}

/**
 * AI Provider interface that all providers must implement
 */
export interface AIProvider {
  readonly config: ProviderConfig;
  getName(): string;
  isReady(): boolean;
  updateConfig(config: Partial<ProviderConfig>): void;
  streamChatCompletion(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void>;
  chatCompletion(messages: ChatMessage[]): Promise<string>;
  testConnection(): Promise<boolean>;
  getAvailableModels(): Promise<string[]>;
  /** Enable/disable binary thinking mode (DeepSeek/Kimi/GLM/SiliconFlow/MiniMax) */
  setThinkingMode(enabled: boolean): void;
  /** Set OpenAI-style reasoning effort (none|low|medium|high|xhigh) */
  setReasoningEffort(effort: string): void;
  /** Set Claude/Gemini-style thinking effort (none|low|medium|high) */
  setThinkingEffort(effort: string): void;
  /** Track the currently selected model (for per-model thinking behavior) */
  setCurrentModel(model: string): void;
}

/**
 * Provider factory type
 */
export type ProviderFactory = (config: ProviderConfig) => AIProvider;
