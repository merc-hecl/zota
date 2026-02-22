/**
 * ProviderManager - Central management of AI providers
 * Supports built-in providers and custom endpoints
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderMetadata,
  ProviderStorageData,
  BuiltinProviderId,
  ApiKeyProviderConfig,
  ModelInfo,
} from "../../types/provider";
import { OpenAIProvider } from "./OpenAIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";
import { DeepSeekProvider } from "./DeepSeekProvider";
import { MistralProvider } from "./MistralProvider";
import { GroqProvider } from "./GroqProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import { SiliconFlowProvider } from "./SiliconFlowProvider";
import { MiniMaxProvider, MINIMAX_DEFAULT_MODELS } from "./MiniMaxProvider";
import { XAIProvider } from "./XAIProvider";
import { config } from "../../../package.json";

export const BUILTIN_PROVIDERS: Record<BuiltinProviderId, ProviderMetadata> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://platform.openai.com",
    type: "openai-compatible",
    endpoints: [
      {
        label: "Chat Completions",
        baseUrl: "https://api.openai.com/v1",
        website: "https://platform.openai.com",
      },
      {
        label: "Responses",
        baseUrl: "https://api.openai.com/v1/responses",
        website: "https://platform.openai.com",
      },
    ],
  },
  claude: {
    id: "claude",
    name: "Claude",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://console.anthropic.com",
    type: "anthropic-compatible",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://ai.google.dev",
    type: "gemini",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://platform.deepseek.com",
    type: "deepseek",
  },
  mistral: {
    id: "mistral",
    name: "Mistral",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://console.mistral.ai",
    type: "mistral",
  },
  groq: {
    id: "groq",
    name: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://console.groq.com",
    type: "groq",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://openrouter.ai",
    type: "openrouter",
  },
  kimi: {
    id: "kimi",
    name: "Kimi",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://platform.moonshot.cn",
    type: "openai-compatible",
    endpoints: [
      {
        label: "国内",
        baseUrl: "https://api.moonshot.cn/v1",
        website: "https://platform.moonshot.cn",
      },
      {
        label: "海外",
        baseUrl: "https://api.moonshot.ai/v1",
        website: "https://platform.moonshot.ai/console",
      },
    ],
  },
  glm: {
    id: "glm",
    name: "GLM",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://bigmodel.cn",
    type: "openai-compatible",
    endpoints: [
      {
        label: "国内",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        website: "https://bigmodel.cn",
      },
      {
        label: "海外",
        baseUrl: "https://api.z.ai/api/paas/v4",
        website: "https://chat.z.ai",
      },
    ],
  },
  siliconflow: {
    id: "siliconflow",
    name: "SiliconFlow",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://docs.siliconflow.cn/cn/userguide/introduction",
    type: "siliconflow",
    endpoints: [
      {
        label: "国内",
        baseUrl: "https://api.siliconflow.cn/v1",
        website: "https://docs.siliconflow.cn/cn/userguide/introduction",
      },
      {
        label: "海外",
        baseUrl: "https://api.siliconflow.com/v1",
        website: "https://docs.siliconflow.com/en/userguide/introduction",
      },
    ],
  },
  minimax: {
    id: "minimax",
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic",
    defaultModels: MINIMAX_DEFAULT_MODELS.map((m) => m.modelId),
    defaultModelInfos: MINIMAX_DEFAULT_MODELS,
    website: "https://platform.minimaxi.com/docs/guides/models-intro",
    type: "minimax",
    endpoints: [
      {
        label: "国内",
        baseUrl: "https://api.minimaxi.com/anthropic",
        website: "https://platform.minimaxi.com/docs/guides/models-intro",
      },
      {
        label: "海外",
        baseUrl: "https://api.minimax.io/anthropic",
        website: "https://platform.minimax.io/docs/guides/models-intro",
      },
    ],
  },
  xai: {
    id: "xai",
    name: "xAI",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModels: [],
    defaultModelInfos: [],
    website: "https://docs.x.ai",
    type: "xai",
  },
};

const PREFS_KEY = `${config.prefsPrefix}.providersConfig`;

export class ProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private activeProviderId: string = "openai";
  private configs: ProviderConfig[] = [];
  private onProviderChangeCallback?: (providerId: string) => void;

  constructor() {
    this.loadFromPrefs();
    this.initializeProviders();
  }

  setOnProviderChange(callback: (providerId: string) => void): void {
    this.onProviderChangeCallback = callback;
  }

  private loadFromPrefs(): void {
    try {
      const stored = Zotero.Prefs.get(PREFS_KEY, true) as string | undefined;
      ztoolkit.log(
        "[ProviderManager] Loading from prefs, stored:",
        stored ? "has data" : "empty",
      );

      if (stored) {
        const data: ProviderStorageData = JSON.parse(stored);
        const providers = data.providers || [];
        ztoolkit.log(
          "[ProviderManager] Parsed providers:",
          providers.map((p) => p.id),
        );

        this.activeProviderId = data.activeProviderId || "openai";
        // Merge with default configs to include new built-in providers
        this.configs = this.mergeWithDefaultConfigs(providers);
        ztoolkit.log(
          "[ProviderManager] Loaded configs:",
          this.configs.map((c) => ({ id: c.id, enabled: c.enabled })),
        );
      } else {
        ztoolkit.log("[ProviderManager] No stored config, using defaults");
        this.configs = this.getDefaultConfigs();
      }
    } catch (e) {
      ztoolkit.log("[ProviderManager] Error loading prefs:", e);
      this.configs = this.getDefaultConfigs();
    }
  }

  /**
   * Merge stored configs with default configs to include new built-in providers
   */
  private mergeWithDefaultConfigs(
    storedConfigs: ProviderConfig[],
  ): ProviderConfig[] {
    const defaultConfigs = this.getDefaultConfigs();
    const storedMap = new Map(storedConfigs.map((c) => [c.id, c]));
    const merged: ProviderConfig[] = [];

    // Add all default built-in providers (already sorted alphabetically)
    for (const defaultConfig of defaultConfigs) {
      const storedConfig = storedMap.get(defaultConfig.id);
      if (storedConfig) {
        // Use stored config but update type and order from default
        merged.push({
          ...storedConfig,
          type: defaultConfig.type,
          name: defaultConfig.name,
          order: defaultConfig.order,
          baseUrl: storedConfig.baseUrl || defaultConfig.baseUrl,
        });
      } else {
        // Add new built-in provider
        merged.push(defaultConfig);
      }
    }

    // Add custom providers from stored configs
    for (const storedConfig of storedConfigs) {
      if (!storedConfig.isBuiltin) {
        merged.push(storedConfig);
      }
    }

    // Reorder: built-in first (by order), then custom (by original order)
    merged.sort((a, b) => {
      if (a.isBuiltin && b.isBuiltin) {
        return (a.order || 0) - (b.order || 0);
      }
      if (a.isBuiltin && !b.isBuiltin) return -1;
      if (!a.isBuiltin && b.isBuiltin) return 1;
      return 0;
    });

    // Update order property
    merged.forEach((config, index) => {
      config.order = index;
    });

    return merged;
  }

  saveToPrefs(): void {
    const data: ProviderStorageData = {
      activeProviderId: this.activeProviderId,
      providers: this.configs,
    };
    Zotero.Prefs.set(PREFS_KEY, JSON.stringify(data), true);
  }

  private getDefaultConfigs(): ProviderConfig[] {
    const configs: ProviderConfig[] = [];

    const apiKeyProviders: BuiltinProviderId[] = [
      "openai",
      "claude",
      "gemini",
      "deepseek",
      "mistral",
      "groq",
      "openrouter",
      "kimi",
      "glm",
      "siliconflow",
      "minimax",
      "xai",
    ];

    const sortedProviders = apiKeyProviders.sort((a, b) =>
      BUILTIN_PROVIDERS[a].name.localeCompare(BUILTIN_PROVIDERS[b].name),
    );

    sortedProviders.forEach((id, index) => {
      const meta = BUILTIN_PROVIDERS[id];
      configs.push({
        id: id,
        name: meta.name,
        type: meta.type,
        enabled: false,
        isBuiltin: true,
        order: index,
        apiKey: "",
        baseUrl: meta.defaultBaseUrl,
        defaultModel: "",
        availableModels: [],
        models: [],
        streamingOutput: true,
      } as ApiKeyProviderConfig);
    });

    return configs;
  }

  private initializeProviders(): void {
    this.providers.clear();

    for (const config of this.configs) {
      if (!config.enabled) continue;

      const provider = this.createProvider(config);
      if (provider) {
        this.providers.set(config.id, provider);
      }
    }
  }

  private createProvider(config: ProviderConfig): AIProvider | null {
    switch (config.type) {
      case "anthropic-compatible":
        return new AnthropicProvider(config as ApiKeyProviderConfig);
      case "gemini":
        return new GeminiProvider(config as ApiKeyProviderConfig);
      case "deepseek":
        return new DeepSeekProvider(config as ApiKeyProviderConfig);
      case "mistral":
        return new MistralProvider(config as ApiKeyProviderConfig);
      case "groq":
        return new GroqProvider(config as ApiKeyProviderConfig);
      case "openrouter":
        return new OpenRouterProvider(config as ApiKeyProviderConfig);
      case "siliconflow":
        return new SiliconFlowProvider(config as ApiKeyProviderConfig);
      case "minimax":
        return new MiniMaxProvider(config as ApiKeyProviderConfig);
      case "xai":
        return new XAIProvider(config as ApiKeyProviderConfig);
      case "openai-compatible":
        return new OpenAIProvider(config as ApiKeyProviderConfig);
      default:
        return null;
    }
  }

  getActiveProvider(): AIProvider | null {
    return this.providers.get(this.activeProviderId) || null;
  }

  getActiveProviderId(): string {
    return this.activeProviderId;
  }

  setActiveProvider(providerId: string): void {
    if (this.configs.some((c) => c.id === providerId)) {
      this.activeProviderId = providerId;
      this.saveToPrefs();
      this.onProviderChangeCallback?.(providerId);
    }
  }

  getProvider(providerId: string): AIProvider | null {
    return this.providers.get(providerId) || null;
  }

  getAllConfigs(): ProviderConfig[] {
    return [...this.configs].sort((a, b) => a.order - b.order);
  }

  getConfiguredProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  getProviderConfig(providerId: string): ProviderConfig | null {
    return this.configs.find((c) => c.id === providerId) || null;
  }

  updateProviderConfig(
    providerId: string,
    updates: Partial<ProviderConfig>,
  ): void {
    const index = this.configs.findIndex((c) => c.id === providerId);
    if (index >= 0) {
      this.configs[index] = {
        ...this.configs[index],
        ...updates,
      } as ProviderConfig;
      this.saveToPrefs();

      const existingProvider = this.providers.get(providerId);
      if (existingProvider) {
        existingProvider.updateConfig(this.configs[index]);
      }

      if (this.configs[index].enabled) {
        if (!existingProvider) {
          const provider = this.createProvider(this.configs[index]);
          if (provider) {
            this.providers.set(providerId, provider);
          }
        }
      } else if (existingProvider) {
        this.providers.delete(providerId);
      }
    }
  }

  addCustomProvider(name: string, type: "openai-compatible"): string {
    const id = `custom-${Date.now()}`;
    const config: ApiKeyProviderConfig = {
      id: id,
      name: name,
      type: type,
      enabled: true,
      isBuiltin: false,
      order: this.configs.length,
      apiKey: "",
      baseUrl: "",
      defaultModel: "",
      availableModels: [],
      streamingOutput: true,
    };
    this.configs.push(config);
    this.saveToPrefs();
    this.initializeProviders();
    return id;
  }

  removeCustomProvider(providerId: string): boolean {
    const index = this.configs.findIndex(
      (c) => c.id === providerId && !c.isBuiltin,
    );
    if (index >= 0) {
      this.configs.splice(index, 1);
      if (this.activeProviderId === providerId) {
        this.activeProviderId = "openai";
      }
      this.saveToPrefs();
      this.initializeProviders();
      return true;
    }
    return false;
  }

  getProviderMetadata(providerId: string): ProviderMetadata | null {
    return BUILTIN_PROVIDERS[providerId as BuiltinProviderId] || null;
  }

  getAllProviderMetadata(): ProviderMetadata[] {
    return Object.values(BUILTIN_PROVIDERS);
  }

  addCustomModel(providerId: string, modelId: string): boolean {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return false;

    if (config.availableModels.includes(modelId)) return false;

    const newModels = [...config.availableModels, modelId];
    const modelInfo: ModelInfo = { modelId, isCustom: true };
    const newModelInfos = [...(config.models || []), modelInfo];

    this.updateProviderConfig(providerId, {
      availableModels: newModels,
      models: newModelInfos,
    });
    return true;
  }

  removeCustomModel(providerId: string, modelId: string): boolean {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return false;

    const modelInfo = config.models?.find((m) => m.modelId === modelId);
    if (!modelInfo?.isCustom) return false;

    const newModels = config.availableModels.filter((m) => m !== modelId);
    const newModelInfos = (config.models || []).filter(
      (m) => m.modelId !== modelId,
    );

    const updates: Partial<ApiKeyProviderConfig> = {
      availableModels: newModels,
      models: newModelInfos,
    };
    if (config.defaultModel === modelId && newModels.length > 0) {
      updates.defaultModel = newModels[0];
    }

    this.updateProviderConfig(providerId, updates);
    return true;
  }

  getModelInfo(providerId: string, modelId: string): ModelInfo | null {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return null;

    const configModel = config.models?.find((m) => m.modelId === modelId);
    if (configModel) return configModel;

    return { modelId };
  }

  isCustomModel(providerId: string, modelId: string): boolean {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return false;

    const modelInfo = config.models?.find((m) => m.modelId === modelId);
    return modelInfo?.isCustom === true;
  }

  refresh(): void {
    this.loadFromPrefs();
    this.initializeProviders();
  }

  destroy(): void {
    this.providers.clear();
  }
}

let providerManager: ProviderManager | null = null;

export function getProviderManager(): ProviderManager {
  if (!providerManager) {
    providerManager = new ProviderManager();
  }
  return providerManager;
}

export function destroyProviderManager(): void {
  if (providerManager) {
    providerManager.destroy();
    providerManager = null;
  }
}
