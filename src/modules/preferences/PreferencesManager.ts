/**
 * PreferencesManager - Main preferences coordination
 * Simplified for generic API configuration
 */

import { getProviderManager, getModelStateManager } from "../providers";
import { loadCachedRatios } from "./ModelsFetcher";
import { bindApiKeyEvents, populateApiKeyPanel } from "./ApiKeyProviderUI";
import { getPref } from "../../utils/prefs";
import type { ApiKeyProviderConfig } from "../../types/provider";

// Current selected provider ID
let currentProviderId: string = "custom";

// Store unsubscribe function for model changes
let modelChangeUnsubscribe: (() => void) | null = null;

/**
 * Get current provider ID
 */
export function getCurrentProviderId(): string {
  return currentProviderId;
}

/**
 * Set current provider ID
 */
export function setCurrentProviderId(id: string): void {
  currentProviderId = id;
}

/**
 * Initialize preferences UI
 */
export async function initializePrefsUI(): Promise<void> {
  if (addon.data.prefs?.window == undefined) return;

  const doc = addon.data.prefs.window.document;
  const providerManager = getProviderManager();

  // Load cached model ratios
  loadCachedRatios();

  // Get current active provider
  currentProviderId = providerManager.getActiveProviderId();

  // Get the config and populate the panel
  const config = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;

  if (config) {
    populateApiKeyPanel(doc, config);
  }

  // Subscribe to model changes for synchronization
  setupModelChangeListener(doc);
}

/**
 * Setup listener for model changes from other UI components
 */
function setupModelChangeListener(doc: Document): void {
  // Unsubscribe from previous listener if exists
  if (modelChangeUnsubscribe) {
    modelChangeUnsubscribe();
    modelChangeUnsubscribe = null;
  }

  const modelStateManager = getModelStateManager();
  modelChangeUnsubscribe = modelStateManager.onModelChange(
    (model: string, providerId: string) => {
      // Update the model dropdown if it exists and is visible
      const modelSelect = doc.getElementById(
        "pref-provider-model",
      ) as unknown as XULMenuListElement;

      if (modelSelect && model) {
        // Check if the model is in the dropdown
        const modelPopup = doc.getElementById("pref-provider-model-popup");
        if (modelPopup) {
          const items = modelPopup.querySelectorAll("menuitem");
          let modelExists = false;
          items.forEach((item) => {
            if ((item as unknown as XULMenuItemElement).value === model) {
              modelExists = true;
            }
          });

          // If model doesn't exist in dropdown, refresh the panel
          if (!modelExists) {
            const providerManager = getProviderManager();
            const config = providerManager.getProviderConfig(
              providerId,
            ) as ApiKeyProviderConfig;
            if (config) {
              populateApiKeyPanel(doc, config);
            }
          } else {
            // Model exists, just update the selection
            modelSelect.value = model;
          }
        }
      }

      ztoolkit.log(
        `[PreferencesManager] Model changed to: ${providerId}/${model}`,
      );
    },
  );
}

/**
 * Cleanup preferences UI (call when preferences window closes)
 */
export function cleanupPrefsUI(): void {
  if (modelChangeUnsubscribe) {
    modelChangeUnsubscribe();
    modelChangeUnsubscribe = null;
  }
}

/**
 * Bind all preference events
 */
export function bindPrefEvents(): void {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  // Bind API key events
  bindApiKeyEvents(doc, getCurrentProviderId);
}
