/**
 * ProviderManager - Central management of AI providers
 * Built-in providers come from pi-ai's runtime catalog; users may add
 * custom OpenAI-compatible providers.
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderMetadata,
  ProviderStorageData,
  ApiKeyProviderConfig,
  ModelInfo,
} from "../../types/provider";
import { PiAIProvider } from "./PiAIProvider";
import { getCatalogProviders, MIGRATED_ID_BY_OLD_ID } from "./PiAICatalog";
import { config } from "../../../package.json";

const PREFS_KEY = `${config.prefsPrefix}.providersConfig`;

/**
 * Legacy vendor-specific types mapped to the current API-based types.
 */
const TYPE_BY_LEGACY_TYPE: Record<string, ProviderConfig["type"]> = {
  deepseek: "openai-compatible",
  kimi: "openai-compatible",
  glm: "openai-compatible",
  siliconflow: "openai-compatible",
  mistral: "mistral-conversations",
  groq: "openai-compatible",
  openrouter: "openai-compatible",
  xai: "openai-responses",
  minimax: "anthropic-compatible",
};

/**
 * All built-in providers, generated from pi-ai's runtime catalog.
 */
export function getBuiltinProviderList(): ProviderMetadata[] {
  return getCatalogProviders();
}

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

      if (stored) {
        const data: ProviderStorageData = JSON.parse(stored);
        const providers = (data.providers || []).map((p) =>
          this.migrateStoredConfig(p),
        );

        this.activeProviderId = this.migrateProviderId(
          data.activeProviderId || "openai",
        );
        this.configs = this.mergeWithDefaultConfigs(providers);
      } else {
        this.configs = this.getDefaultConfigs();
      }
    } catch (e) {
      ztoolkit.log("[ProviderManager] Error loading prefs:", e);
      this.configs = this.getDefaultConfigs();
    }
  }

  private migrateProviderId(providerId: string): string {
    return MIGRATED_ID_BY_OLD_ID[providerId] || providerId;
  }

  /**
   * Migrate a stored provider config to the current schema:
   * - legacy endpoints that stored rotating API-key arrays -> single key
   * - multi-endpoint configs -> flat single baseUrl/apiKey
   * - pre-catalog provider ids (claude/gemini/glm/kimi) -> pi-ai catalog ids
   * - legacy vendor-specific types -> API-based types
   * - strip /v1 suffixes that the SDK-backed adapters append themselves
   */
  private migrateStoredConfig(raw: ProviderConfig): ProviderConfig {
    let cfg = { ...raw } as ProviderConfig & {
      endpoints?: unknown;
      currentEndpointIndex?: unknown;
    };

    // 1. Legacy multi-endpoint format: pick the active endpoint and flatten.
    if (Array.isArray(cfg.endpoints) && cfg.endpoints.length > 0) {
      const endpoints = cfg.endpoints as {
        baseUrl?: string;
        apiKey?: string;
        apiKeys?: { key?: string }[];
        currentApiKeyIndex?: number;
        availableModels?: string[];
        defaultModel?: string;
      }[];
      const index =
        typeof cfg.currentEndpointIndex === "number"
          ? cfg.currentEndpointIndex
          : 0;
      const active = endpoints[index] || endpoints[0];
      // Older still: rotating apiKeys array on the endpoint.
      const apiKey =
        active.apiKey ??
        (Array.isArray(active.apiKeys)
          ? active.apiKeys[active.currentApiKeyIndex ?? 0]?.key ||
            active.apiKeys[0]?.key ||
            ""
          : "");

      cfg = {
        ...cfg,
        baseUrl: active.baseUrl || cfg.baseUrl,
        apiKey,
        availableModels: active.availableModels?.length
          ? active.availableModels
          : cfg.availableModels,
        defaultModel: active.defaultModel || cfg.defaultModel || "",
      };
    }
    delete cfg.endpoints;
    delete cfg.currentEndpointIndex;

    // 2. Pre-catalog provider ids -> pi-ai catalog ids.
    const migratedId = MIGRATED_ID_BY_OLD_ID[cfg.id];
    if (migratedId) {
      cfg = { ...cfg, id: migratedId };
    }

    // 3. Legacy vendor-specific types -> API-based types.
    const normalizedType = TYPE_BY_LEGACY_TYPE[cfg.type];
    if (normalizedType) {
      cfg = { ...cfg, type: normalizedType };
    }

    // 4. The anthropic/mistral adapters append /v1 themselves; strip a
    // legacy /v1 suffix so stored base URLs keep working.
    if (
      (cfg.type === "anthropic-compatible" ||
        cfg.type === "mistral-conversations") &&
      /\/v1\/?$/i.test(cfg.baseUrl || "")
    ) {
      cfg = { ...cfg, baseUrl: (cfg.baseUrl || "").replace(/\/v1\/?$/i, "") };
    }

    return cfg;
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

    // Add stored configs that are not built-in anymore: user-added custom
    // providers, plus legacy built-ins that left pi-ai's catalog (e.g.
    // siliconflow) which are downgraded to custom providers.
    for (const storedConfig of storedConfigs) {
      if (storedMap.get(storedConfig.id) !== storedConfig) continue;
      if (defaultConfigs.some((d) => d.id === storedConfig.id)) continue;
      merged.push(
        storedConfig.isBuiltin
          ? { ...storedConfig, isBuiltin: false }
          : storedConfig,
      );
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

    const sortedProviders = getBuiltinProviderList().sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    sortedProviders.forEach((meta, index) => {
      configs.push({
        id: meta.id,
        name: meta.name,
        type: meta.type,
        enabled: false,
        isBuiltin: true,
        order: index,
        apiKey: "",
        baseUrl: meta.defaultBaseUrl,
        defaultModel: "",
        availableModels: [...(meta.availableModels || [])],
        models: [...(meta.models || [])],
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
    return new PiAIProvider(config as ApiKeyProviderConfig);
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
    return getBuiltinProviderList().find((p) => p.id === providerId) || null;
  }

  getAllProviderMetadata(): ProviderMetadata[] {
    return getBuiltinProviderList();
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
