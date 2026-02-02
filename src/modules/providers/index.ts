/**
 * Providers Module Exports
 */

// Manager
export {
  ProviderManager,
  getProviderManager,
  destroyProviderManager,
} from "./ProviderManager";

// Model State Manager
export {
  ModelStateManager,
  getModelStateManager,
  destroyModelStateManager,
  type ModelChangeCallback,
  type ProviderChangeCallback,
} from "./ModelStateManager";

// Provider implementations
export { BaseProvider } from "./BaseProvider";
export { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";

// Re-export types
export type {
  AIProvider,
  ProviderConfig,
  ProviderStorageData,
  ProviderType,
  BaseProviderConfig,
  ApiKeyProviderConfig,
  ModelInfo,
  ModelCapability,
} from "../../types/provider";
