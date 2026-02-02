/**
 * ApiKeyProviderUI - Generic API Key provider settings panel
 */

import { getString } from "../../utils/locale";
import { prefColors } from "../../utils/colors";
import { getProviderManager, getModelStateManager } from "../providers";
import type { ApiKeyProviderConfig } from "../../types/provider";
import { clearElement, showTestResult } from "./utils";

/**
 * Populate API key panel with provider data
 */
export function populateApiKeyPanel(
  doc: Document,
  config: ApiKeyProviderConfig,
): void {
  const titleEl = doc.getElementById("pref-provider-title");
  const descEl = doc.getElementById("pref-provider-description");
  const apikeyEl = doc.getElementById(
    "pref-provider-apikey",
  ) as HTMLInputElement;
  const baseurlEl = doc.getElementById(
    "pref-provider-baseurl",
  ) as HTMLInputElement;
  const modelSelect = doc.getElementById(
    "pref-provider-model",
  ) as unknown as XULMenuListElement;
  const maxTokensEl = doc.getElementById(
    "pref-provider-maxtokens",
  ) as HTMLInputElement;
  const temperatureEl = doc.getElementById(
    "pref-provider-temperature",
  ) as HTMLInputElement;
  const pdfMaxCharsEl = doc.getElementById(
    "pref-provider-pdfmaxchars",
  ) as HTMLInputElement;
  const systemPromptEl = doc.getElementById(
    "pref-provider-systemprompt",
  ) as HTMLTextAreaElement;

  if (titleEl && config.name) {
    titleEl.textContent = config.name;
  }
  // Description is set via data-l10n-id in XHTML, no need to set here
  if (apikeyEl) apikeyEl.value = config.apiKey || "";
  if (baseurlEl) baseurlEl.value = config.baseUrl || "";
  if (maxTokensEl) maxTokensEl.value = String(config.maxTokens ?? -1);
  if (temperatureEl) temperatureEl.value = String(config.temperature ?? 0.7);
  if (pdfMaxCharsEl) pdfMaxCharsEl.value = String(config.pdfMaxChars ?? 50000);
  if (systemPromptEl) {
    systemPromptEl.value = config.systemPrompt || "";
    // Set placeholder from localization (get the .placeholder attribute)
    systemPromptEl.placeholder = getString(
      "pref-system-prompt-placeholder",
      "placeholder",
    );
  }

  // Populate model dropdown
  const modelPopup = doc.getElementById("pref-provider-model-popup");
  if (modelPopup && modelSelect) {
    // Clear existing items
    clearElement(modelPopup);

    // Add available models
    const models = config.availableModels || [];
    models.forEach((model) => {
      const menuitem = doc.createXULElement("menuitem");
      menuitem.setAttribute("label", model);
      menuitem.setAttribute("value", model);
      modelPopup.appendChild(menuitem);
    });

    modelSelect.value = config.defaultModel || models[0] || "";
  }

  // Reset test result
  const testResult = doc.getElementById("pref-test-result");
  if (testResult) testResult.textContent = "";

  // Populate model list
  populateModelList(doc, config);
}

/**
 * Populate model list with delete buttons for custom models
 */
export function populateModelList(
  doc: Document,
  config: ApiKeyProviderConfig,
): void {
  const providerManager = getProviderManager();
  const listContainer = doc.getElementById("pref-model-list");
  if (!listContainer) return;

  // Clear existing items
  clearElement(listContainer);

  const models = config.availableModels || [];
  models.forEach((modelId) => {
    const isCustom = providerManager.isCustomModel(config.id, modelId);

    const item = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    item.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 8px;
      border-bottom: 1px solid var(--color-border, #eee);
    `;

    // Model info container
    const infoContainer = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    infoContainer.style.cssText =
      "display: flex; flex-direction: column; flex: 1;";

    // Model ID with custom badge
    const nameRow = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    nameRow.style.cssText = "display: flex; align-items: center; gap: 6px;";

    const nameSpan = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "span",
    ) as HTMLSpanElement;
    nameSpan.textContent = modelId;
    nameSpan.style.cssText = "font-size: 12px;";
    nameRow.appendChild(nameSpan);

    if (isCustom) {
      const badge = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span",
      ) as HTMLSpanElement;
      badge.textContent = getString("pref-model-custom" as any);
      badge.style.cssText = `font-size: 10px; padding: 1px 4px; background: ${prefColors.customBadgeBg}; color: ${prefColors.customBadgeText}; border-radius: 3px;`;
      nameRow.appendChild(badge);
    }

    infoContainer.appendChild(nameRow);
    item.appendChild(infoContainer);

    // Delete button for custom models
    if (isCustom) {
      const deleteBtn = doc.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "button",
      ) as HTMLButtonElement;
      deleteBtn.textContent = "×";
      deleteBtn.style.cssText = `
        border: none;
        background: none;
        color: #c00;
        cursor: pointer;
        font-size: 16px;
        padding: 0 4px;
        line-height: 1;
      `;
      deleteBtn.addEventListener("click", () => {
        if (providerManager.removeCustomModel(config.id, modelId)) {
          const updatedConfig = providerManager.getProviderConfig(
            config.id,
          ) as ApiKeyProviderConfig;
          if (updatedConfig) {
            populateApiKeyPanel(doc, updatedConfig);
          }
        }
      });
      item.appendChild(deleteBtn);
    }

    listContainer.appendChild(item);
  });

  // Show empty state if no models
  if (models.length === 0) {
    const emptyItem = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    emptyItem.textContent = "—";
    emptyItem.style.cssText =
      "padding: 8px; text-align: center; color: #888; font-size: 12px;";
    listContainer.appendChild(emptyItem);
  }
}

/**
 * Save current API key provider config
 */
export function saveCurrentProviderConfig(
  doc: Document,
  currentProviderId: string,
): void {
  const providerManager = getProviderManager();

  const apikeyEl = doc.getElementById(
    "pref-provider-apikey",
  ) as HTMLInputElement;
  const baseurlEl = doc.getElementById(
    "pref-provider-baseurl",
  ) as HTMLInputElement;
  const modelSelect = doc.getElementById(
    "pref-provider-model",
  ) as unknown as XULMenuListElement;
  const maxTokensEl = doc.getElementById(
    "pref-provider-maxtokens",
  ) as HTMLInputElement;
  const temperatureEl = doc.getElementById(
    "pref-provider-temperature",
  ) as HTMLInputElement;
  const pdfMaxCharsEl = doc.getElementById(
    "pref-provider-pdfmaxchars",
  ) as HTMLInputElement;
  const systemPromptEl = doc.getElementById(
    "pref-provider-systemprompt",
  ) as HTMLTextAreaElement;

  const apiKey = apikeyEl?.value || "";
  const wasEnabled = (
    providerManager.getProviderConfig(currentProviderId) as ApiKeyProviderConfig
  )?.enabled;
  const isNowEnabled = !!apiKey.trim();

  const updates: Partial<ApiKeyProviderConfig> = {
    enabled: isNowEnabled,
    apiKey,
    baseUrl: baseurlEl?.value || "",
    defaultModel: modelSelect?.value || "",
    maxTokens: parseInt(maxTokensEl?.value) || -1,
    temperature: parseFloat(temperatureEl?.value) || 0.7,
    pdfMaxChars: parseInt(pdfMaxCharsEl?.value) || 50000,
    systemPrompt: systemPromptEl?.value || "",
  };

  providerManager.updateProviderConfig(currentProviderId, updates);
}

/**
 * Auto-fetch models from provider API after API key is entered
 */
export async function autoFetchModels(
  doc: Document,
  currentProviderId: string,
): Promise<void> {
  const providerManager = getProviderManager();
  const provider = providerManager.getProvider(currentProviderId);
  if (!provider) return;

  try {
    showTestResult(doc, getString("pref-fetching-models"), false);
    const models = await provider.getAvailableModels();
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config && models.length > 0) {
      providerManager.updateProviderConfig(currentProviderId, {
        availableModels: models,
      });
      // Refresh panel
      populateApiKeyPanel(doc, { ...config, availableModels: models });
      showTestResult(
        doc,
        getString("pref-models-loaded", { args: { count: models.length } }),
        false,
      );
    } else {
      showTestResult(doc, "", false);
    }
  } catch {
    showTestResult(doc, getString("pref-fetch-models-failed"), true);
  }
}

/**
 * Bind API key panel events
 */
export function bindApiKeyEvents(
  doc: Document,
  getCurrentProviderId: () => string,
): void {
  const providerManager = getProviderManager();

  // API Key input (save on blur and auto-fetch models)
  const apikeyInput = doc.getElementById(
    "pref-provider-apikey",
  ) as HTMLInputElement;
  apikeyInput?.addEventListener("blur", async () => {
    const currentProviderId = getCurrentProviderId();
    saveCurrentProviderConfig(doc, currentProviderId);

    // Auto-fetch models when API key is entered
    if (apikeyInput.value.trim()) {
      await autoFetchModels(doc, currentProviderId);
    }
  });

  // Toggle API key visibility
  const toggleKeyBtn = doc.getElementById("pref-toggle-apikey");
  toggleKeyBtn?.addEventListener("click", () => {
    if (apikeyInput.type === "password") {
      apikeyInput.type = "text";
      toggleKeyBtn.setAttribute("label", getString("pref-hide-key"));
    } else {
      apikeyInput.type = "password";
      toggleKeyBtn.setAttribute("label", getString("pref-show-key"));
    }
  });

  // Base URL input
  const baseurlInput = doc.getElementById(
    "pref-provider-baseurl",
  ) as HTMLInputElement;
  baseurlInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  // Model selection - use ModelStateManager for synchronization
  const modelSelect = doc.getElementById(
    "pref-provider-model",
  ) as unknown as XULMenuListElement;
  modelSelect?.addEventListener("command", () => {
    const providerId = getCurrentProviderId();
    const model = modelSelect.value;

    // Save to provider config
    saveCurrentProviderConfig(doc, providerId);

    // Use ModelStateManager to sync with other UI components
    if (model) {
      const modelStateManager = getModelStateManager();
      modelStateManager.setModel(model, providerId);
    }
  });

  // Max tokens
  const maxTokensInput = doc.getElementById(
    "pref-provider-maxtokens",
  ) as HTMLInputElement;
  maxTokensInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  // Temperature
  const temperatureInput = doc.getElementById(
    "pref-provider-temperature",
  ) as HTMLInputElement;
  temperatureInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  // PDF Max Chars
  const pdfMaxCharsInput = doc.getElementById(
    "pref-provider-pdfmaxchars",
  ) as HTMLInputElement;
  pdfMaxCharsInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  // System prompt
  const systemPromptInput = doc.getElementById(
    "pref-provider-systemprompt",
  ) as HTMLTextAreaElement;
  systemPromptInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  // Refresh models button
  const refreshModelsBtn = doc.getElementById("pref-refresh-models");
  refreshModelsBtn?.addEventListener("click", () =>
    autoFetchModels(doc, getCurrentProviderId()),
  );

  // Test connection button
  const testConnectionBtn = doc.getElementById("pref-test-connection");
  testConnectionBtn?.addEventListener("click", async () => {
    const currentProviderId = getCurrentProviderId();
    const provider = providerManager.getProvider(currentProviderId);
    if (!provider) {
      showTestResult(doc, getString("pref-provider-not-ready"), true);
      return;
    }

    showTestResult(doc, getString("pref-testing"), false);
    try {
      const success = await provider.testConnection();
      if (success) {
        showTestResult(doc, getString("pref-test-success"), false);
      } else {
        showTestResult(doc, getString("pref-test-failed"), true);
      }
    } catch (e) {
      showTestResult(doc, getString("pref-test-failed"), true);
    }
  });

  // Add custom model button
  const addModelBtn = doc.getElementById("pref-add-model-btn");
  addModelBtn?.addEventListener("click", () => {
    const currentProviderId = getCurrentProviderId();

    const modelId = addon.data.prefs?.window?.prompt(
      getString("pref-enter-model-id"),
    );
    if (modelId && modelId.trim()) {
      const success = providerManager.addCustomModel(
        currentProviderId,
        modelId.trim(),
      );
      if (success) {
        const config = providerManager.getProviderConfig(
          currentProviderId,
        ) as ApiKeyProviderConfig;
        if (config) {
          populateApiKeyPanel(doc, config);
        }
      } else {
        showTestResult(doc, getString("pref-model-exists" as any), true);
      }
    }
  });
}
