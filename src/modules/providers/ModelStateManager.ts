/**
 * ModelStateManager - Centralized management of model selection state
 * Ensures synchronization between settings UI, floating panel, and sidebar
 */

import { getProviderManager } from "./ProviderManager";
import { getPref, setPref } from "../../utils/prefs";
import type { ApiKeyProviderConfig } from "../../types/provider";

// Callback types
export type ModelChangeCallback = (model: string, providerId: string) => void;
export type ProviderChangeCallback = (providerId: string) => void;

class ModelStateManager {
  private modelChangeCallbacks: Set<ModelChangeCallback> = new Set();
  private providerChangeCallbacks: Set<ProviderChangeCallback> = new Set();
  private lastKnownModel: string = "";
  private lastKnownProviderId: string = "";

  constructor() {
    // Initialize with current values
    this.lastKnownModel = (getPref("model") as string) || "";
    this.lastKnownProviderId = getProviderManager().getActiveProviderId();

    // Start watching for changes
    this.startWatching();
  }

  /**
   * Start watching for preference changes
   */
  private startWatching(): void {
    // Poll for changes (Zotero doesn't have a direct pref change event)
    setInterval(() => {
      this.checkForChanges();
    }, 500);
  }

  /**
   * Check if model or provider has changed
   */
  private checkForChanges(): void {
    const currentModel = (getPref("model") as string) || "";
    const currentProviderId = getProviderManager().getActiveProviderId();

    // Check for model change
    if (currentModel !== this.lastKnownModel) {
      this.lastKnownModel = currentModel;
      this.notifyModelChange(currentModel, currentProviderId);
    }

    // Check for provider change
    if (currentProviderId !== this.lastKnownProviderId) {
      this.lastKnownProviderId = currentProviderId;
      this.notifyProviderChange(currentProviderId);

      // Also notify model change since provider changed
      if (currentModel) {
        this.notifyModelChange(currentModel, currentProviderId);
      }
    }
  }

  /**
   * Set the current model and provider
   * This is the unified way to change model across the entire plugin
   */
  setModel(model: string, providerId: string): void {
    const providerManager = getProviderManager();

    // Switch provider if needed
    if (providerManager.getActiveProviderId() !== providerId) {
      providerManager.setActiveProvider(providerId);
    }

    // Set model in preferences
    setPref("model", model);

    // Update provider config
    providerManager.updateProviderConfig(providerId, {
      defaultModel: model,
    });

    // Update internal state and notify
    this.lastKnownModel = model;
    this.lastKnownProviderId = providerId;
    this.notifyModelChange(model, providerId);

    ztoolkit.log(`[ModelStateManager] Model set to: ${providerId}/${model}`);
  }

  /**
   * Get current model
   */
  getCurrentModel(): string {
    return (getPref("model") as string) || "";
  }

  /**
   * Get current provider ID
   */
  getCurrentProviderId(): string {
    return getProviderManager().getActiveProviderId();
  }

  /**
   * Subscribe to model changes
   */
  onModelChange(callback: ModelChangeCallback): () => void {
    this.modelChangeCallbacks.add(callback);

    // Immediately call with current value
    const currentModel = this.getCurrentModel();
    const currentProviderId = this.getCurrentProviderId();
    if (currentModel) {
      callback(currentModel, currentProviderId);
    }

    // Return unsubscribe function
    return () => {
      this.modelChangeCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to provider changes
   */
  onProviderChange(callback: ProviderChangeCallback): () => void {
    this.providerChangeCallbacks.add(callback);

    // Immediately call with current value
    callback(this.getCurrentProviderId());

    // Return unsubscribe function
    return () => {
      this.providerChangeCallbacks.delete(callback);
    };
  }

  /**
   * Notify all subscribers of model change
   */
  private notifyModelChange(model: string, providerId: string): void {
    this.modelChangeCallbacks.forEach((callback) => {
      try {
        callback(model, providerId);
      } catch (e) {
        ztoolkit.log("[ModelStateManager] Error in model change callback:", e);
      }
    });
  }

  /**
   * Notify all subscribers of provider change
   */
  private notifyProviderChange(providerId: string): void {
    this.providerChangeCallbacks.forEach((callback) => {
      try {
        callback(providerId);
      } catch (e) {
        ztoolkit.log(
          "[ModelStateManager] Error in provider change callback:",
          e,
        );
      }
    });
  }

  /**
   * Get the display name for current model
   */
  getCurrentModelDisplayName(): string {
    const model = this.getCurrentModel();
    if (!model) return "";

    // Truncate if too long
    if (model.length > 25) {
      return model.substring(0, 23) + "...";
    }
    return model;
  }

  /**
   * Check if a model is currently selected
   */
  isCurrentModel(model: string, providerId: string): boolean {
    return (
      this.getCurrentModel() === model &&
      this.getCurrentProviderId() === providerId
    );
  }
}

// Singleton instance
let modelStateManager: ModelStateManager | null = null;

/**
 * Get the ModelStateManager singleton instance
 */
export function getModelStateManager(): ModelStateManager {
  if (!modelStateManager) {
    modelStateManager = new ModelStateManager();
  }
  return modelStateManager;
}

/**
 * Destroy the singleton instance (for cleanup/testing)
 */
export function destroyModelStateManager(): void {
  modelStateManager = null;
}

// Re-export types
export { ModelStateManager };
