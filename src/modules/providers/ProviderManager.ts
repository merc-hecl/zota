/**
 * ProviderManager - Central management of AI providers
 * Generic implementation without built-in providers
 */

import type {
  AIProvider,
  ProviderConfig,
  ProviderStorageData,
  ApiKeyProviderConfig,
  ModelInfo,
} from "../../types/provider";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";
import { getString } from "../../utils/locale";

import { config } from "../../../package.json";

const PREFS_KEY = `${config.prefsPrefix}.providersConfig`;

export class ProviderManager {
  private providers: Map<string, AIProvider> = new Map();
  private activeProviderId: string = "custom";
  private configs: ProviderConfig[] = [];
  private onProviderChangeCallback?: (providerId: string) => void;

  constructor() {
    this.loadFromPrefs();
    this.initializeProviders();
  }

  /**
   * Set callback for when active provider changes
   */
  setOnProviderChange(callback: (providerId: string) => void): void {
    this.onProviderChangeCallback = callback;
  }

  /**
   * Load configuration from Zotero preferences
   */
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
        ztoolkit.log(
          "[ProviderManager] Active provider ID:",
          data.activeProviderId,
        );

        this.activeProviderId = data.activeProviderId || "custom";
        this.configs = providers;
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
   * Save configuration to Zotero preferences
   */
  saveToPrefs(): void {
    const data: ProviderStorageData = {
      activeProviderId: this.activeProviderId,
      providers: this.configs,
    };
    Zotero.Prefs.set(PREFS_KEY, JSON.stringify(data), true);
  }

  /**
   * Get default provider configurations (generic only)
   */
  private getDefaultConfigs(): ProviderConfig[] {
    // Use localized name if available, fallback to English
    const defaultName = getString
      ? getString("pref-generic-provider-title" as any) || "AI Provider"
      : "AI Provider";

    return [
      {
        id: "custom",
        name: defaultName,
        type: "openai-compatible",
        enabled: false,
        isBuiltin: false,
        order: 0,
        apiKey: "",
        baseUrl: "",
        defaultModel: "",
        availableModels: [],
        models: [],
      } as ApiKeyProviderConfig,
    ];
  }

  /**
   * Initialize provider instances
   */
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

  /**
   * Create provider instance from config
   */
  private createProvider(config: ProviderConfig): AIProvider | null {
    switch (config.type) {
      case "openai":
      case "openai-compatible":
        return new OpenAICompatibleProvider(config as ApiKeyProviderConfig);
      default:
        return null;
    }
  }

  /**
   * Get active provider
   */
  getActiveProvider(): AIProvider | null {
    return this.providers.get(this.activeProviderId) || null;
  }

  /**
   * Get active provider ID
   */
  getActiveProviderId(): string {
    return this.activeProviderId;
  }

  /**
   * Set active provider
   */
  setActiveProvider(providerId: string): void {
    if (this.configs.some((c) => c.id === providerId)) {
      this.activeProviderId = providerId;
      this.saveToPrefs();
      // Notify listeners about the provider change
      this.onProviderChangeCallback?.(providerId);
    }
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): AIProvider | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * Get all provider configs
   */
  getAllConfigs(): ProviderConfig[] {
    return [...this.configs].sort((a, b) => a.order - b.order);
  }

  /**
   * Get all configured (enabled) provider instances
   */
  getConfiguredProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider config by ID
   */
  getProviderConfig(providerId: string): ProviderConfig | null {
    return this.configs.find((c) => c.id === providerId) || null;
  }

  /**
   * Update provider config
   */
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
      this.initializeProviders();
    }
  }

  /**
   * Add custom provider
   */
  addCustomProvider(name: string): string {
    const id = `custom-${Date.now()}`;
    const config: ApiKeyProviderConfig = {
      id,
      name,
      type: "openai-compatible",
      enabled: true,
      isBuiltin: false,
      order: this.configs.length,
      apiKey: "",
      baseUrl: "",
      defaultModel: "",
      availableModels: [],
    };
    this.configs.push(config);
    this.saveToPrefs();
    this.initializeProviders();
    return id;
  }

  /**
   * Remove custom provider
   */
  removeCustomProvider(providerId: string): boolean {
    const index = this.configs.findIndex(
      (c) => c.id === providerId && !c.isBuiltin,
    );
    if (index >= 0) {
      this.configs.splice(index, 1);
      if (this.activeProviderId === providerId) {
        this.activeProviderId = "custom";
      }
      this.saveToPrefs();
      this.initializeProviders();
      return true;
    }
    return false;
  }

  /**
   * Add custom model to a provider
   */
  addCustomModel(providerId: string, modelId: string): boolean {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return false;

    // Check if model already exists
    if (config.availableModels.includes(modelId)) return false;

    // Add to availableModels
    const newModels = [...config.availableModels, modelId];

    // Add to models array with isCustom flag
    const modelInfo: ModelInfo = { modelId, isCustom: true };
    const newModelInfos = [...(config.models || []), modelInfo];

    this.updateProviderConfig(providerId, {
      availableModels: newModels,
      models: newModelInfos,
    });
    return true;
  }

  /**
   * Remove custom model from a provider
   */
  removeCustomModel(providerId: string, modelId: string): boolean {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return false;

    // Check if model exists and is custom
    const modelInfo = config.models?.find((m) => m.modelId === modelId);
    if (!modelInfo?.isCustom) return false;

    // Remove from availableModels
    const newModels = config.availableModels.filter((m) => m !== modelId);

    // Remove from models array
    const newModelInfos = (config.models || []).filter(
      (m) => m.modelId !== modelId,
    );

    // Update default model if it was removed
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

  /**
   * Get model info for a provider
   */
  getModelInfo(providerId: string, modelId: string): ModelInfo | null {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return null;

    // First check provider config models
    const configModel = config.models?.find((m) => m.modelId === modelId);
    if (configModel) return configModel;

    // Return basic info if not found
    return { modelId };
  }

  /**
   * Check if a model is custom (user-added)
   */
  isCustomModel(providerId: string, modelId: string): boolean {
    const config = this.getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig | null;
    if (!config) return false;

    const modelInfo = config.models?.find((m) => m.modelId === modelId);
    return modelInfo?.isCustom === true;
  }

  /**
   * Refresh providers (reload from prefs)
   */
  refresh(): void {
    this.loadFromPrefs();
    this.initializeProviders();
  }

  /**
   * Destroy all providers
   */
  destroy(): void {
    this.providers.clear();
  }
}

// Singleton instance
let providerManager: ProviderManager | null = null;

/**
 * Get the singleton ProviderManager instance
 */
export function getProviderManager(): ProviderManager {
  if (!providerManager) {
    providerManager = new ProviderManager();
  }
  return providerManager;
}

/**
 * Destroy the singleton ProviderManager instance
 */
export function destroyProviderManager(): void {
  if (providerManager) {
    providerManager.destroy();
    providerManager = null;
  }
}
