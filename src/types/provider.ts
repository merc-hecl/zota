/**
 * Provider Types - AI API type definitions (generic only)
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
 * Supported provider types (generic only)
 */
export type ProviderType =
  | "openai" // Native OpenAI API
  | "openai-compatible"; // Generic OpenAI-compatible API

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
  type: "openai" | "openai-compatible";
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  availableModels: string[];
  models?: ModelInfo[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  pdfMaxChars?: number;
}

/**
 * Union type for all provider configs
 */
export type ProviderConfig = ApiKeyProviderConfig;

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
  /** Provider configuration */
  readonly config: ProviderConfig;

  /** Get display name */
  getName(): string;

  /** Check if provider is configured and ready */
  isReady(): boolean;

  /** Update configuration */
  updateConfig(config: Partial<ProviderConfig>): void;

  /** Stream chat completion */
  streamChatCompletion(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
  ): Promise<void>;

  /** Non-streaming chat completion */
  chatCompletion(messages: ChatMessage[]): Promise<string>;

  /** Test connection to the API */
  testConnection(): Promise<boolean>;

  /** Get available models */
  getAvailableModels(): Promise<string[]>;
}
