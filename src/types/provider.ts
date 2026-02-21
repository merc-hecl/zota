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
 * Supported provider types
 * Hybrid architecture: some providers have independent implementations,
 * while others reuse openai-compatible base implementation
 */
export type ProviderType =
  | "anthropic-compatible"
  | "gemini"
  | "openai-compatible"
  | "deepseek"
  | "mistral"
  | "groq"
  | "openrouter"
  | "siliconflow";

/**
 * Provider identifier for built-in providers
 */
export type BuiltinProviderId =
  | "openai"
  | "claude"
  | "gemini"
  | "deepseek"
  | "mistral"
  | "groq"
  | "openrouter"
  | "kimi"
  | "glm"
  | "siliconflow";

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
 * API key entry with value and nickname
 */
export interface ApiKeyEntry {
  key: string;
  name?: string;
}

/**
 * Endpoint configuration with multiple API keys and models
 */
export interface EndpointConfig {
  baseUrl: string;
  apiKeys: ApiKeyEntry[];
  currentApiKeyIndex: number;
  availableModels?: string[];
  defaultModel?: string;
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
  endpoints?: EndpointConfig[];
  currentEndpointIndex?: number;
}

/**
 * Union type for all provider configs
 */
export type ProviderConfig = ApiKeyProviderConfig;

/**
 * Endpoint option for providers with multiple endpoints
 */
export interface EndpointOption {
  label: string;
  baseUrl: string;
  website: string;
}

/**
 * Provider metadata for display and defaults
 */
export interface ProviderMetadata {
  id: BuiltinProviderId;
  name: string;
  defaultBaseUrl: string;
  defaultModels: string[];
  defaultModelInfos: ModelInfo[];
  website: string;
  type: ProviderType;
  endpoints?: EndpointOption[];
}

/**
 * Provider storage format (for Zotero prefs)
 */
export interface ProviderStorageData {
  activeProviderId: string;
  providers: ProviderConfig[];
}

/**
 * Message format for Anthropic API
 */
export interface AnthropicMessage {
  role: "user" | "assistant";
  content:
    | string
    | (AnthropicTextBlock | AnthropicImageBlock | AnthropicDocumentBlock)[];
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicImageBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export interface AnthropicDocumentBlock {
  type: "document";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

/**
 * Message format for Gemini API
 */
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
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
}

/**
 * Provider factory type
 */
export type ProviderFactory = (config: ProviderConfig) => AIProvider;
