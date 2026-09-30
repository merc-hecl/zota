/**
 * ApiKeyProviderUI - API Key provider settings panel
 */

import { getString } from "../../utils/locale";
import { prefColors } from "../../utils/colors";
import { getProviderManager, getModelStateManager } from "../providers";
import type {
  ApiKeyProviderConfig,
  ProviderMetadata,
} from "../../types/provider";
import { clearElement, showTestResult } from "./utils";

export function populateApiKeyPanel(
  doc: Document,
  config: ApiKeyProviderConfig,
  metadata?: ProviderMetadata | null,
): void {
  const baseUrlInput = doc.getElementById(
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
  const maxDocumentsEl = doc.getElementById(
    "pref-max-documents",
  ) as HTMLInputElement;
  const systemPromptEl = doc.getElementById(
    "pref-provider-systemprompt",
  ) as HTMLTextAreaElement;
  const streamingOutputEl = doc.getElementById(
    "pref-streaming-output",
  ) as HTMLInputElement;

  if (baseUrlInput) {
    baseUrlInput.value = config.baseUrl || metadata?.defaultBaseUrl || "";
  }
  setApiKeyInputValue(doc, config.apiKey || "");

  const modelPopup = doc.getElementById("pref-provider-model-popup");
  if (modelPopup && modelSelect) {
    clearElement(modelPopup);

    const models = config.availableModels || [];
    models.forEach((model) => {
      const menuitem = doc.createXULElement("menuitem");
      menuitem.setAttribute("label", model);
      menuitem.setAttribute("value", model);
      modelPopup.appendChild(menuitem);
    });

    const defaultModel = config.defaultModel || models[0] || "";
    modelSelect.value = defaultModel;
  }

  populateModelList(doc, config);

  if (maxTokensEl) maxTokensEl.value = String(config.maxTokens ?? -1);
  if (temperatureEl) temperatureEl.value = String(config.temperature ?? 0.7);
  if (pdfMaxCharsEl) pdfMaxCharsEl.value = String(config.pdfMaxChars ?? 50000);
  if (maxDocumentsEl) maxDocumentsEl.value = String(config.maxDocuments ?? 3);
  if (systemPromptEl) {
    systemPromptEl.value = config.systemPrompt || "";
    systemPromptEl.placeholder = getString(
      "pref-system-prompt-placeholder",
      "placeholder",
    );
  }
  if (streamingOutputEl) {
    streamingOutputEl.checked = config.streamingOutput ?? true;
  }

  // Update visit website button state
  const visitWebsiteBtn = doc.getElementById(
    "pref-visit-website",
  ) as HTMLButtonElement;
  if (visitWebsiteBtn) {
    const hasWebsite = !!metadata?.website;
    visitWebsiteBtn.disabled = !hasWebsite;
    if (!hasWebsite) {
      visitWebsiteBtn.setAttribute("disabled", "true");
    } else {
      visitWebsiteBtn.removeAttribute("disabled");
    }
  }

  const testResult = doc.getElementById("pref-test-result");
  if (testResult) testResult.textContent = "";
}

/**
 * Sync the single API key input with the stored key.
 * The input is always re-masked when the panel is repopulated.
 */
function setApiKeyInputValue(doc: Document, apiKey: string): void {
  const apikeyInput = doc.getElementById(
    "pref-provider-apikey",
  ) as HTMLInputElement | null;
  if (!apikeyInput) return;
  apikeyInput.value = apiKey;
  apikeyInput.type = "password";
  updateToggleKeyButton(doc, false);
}

/**
 * Update the show/hide toggle button label.
 */
function updateToggleKeyButton(doc: Document, keyVisible: boolean): void {
  const toggleKeyBtn = doc.getElementById("pref-toggle-apikey");
  if (!toggleKeyBtn) return;
  toggleKeyBtn.setAttribute(
    "label",
    keyVisible ? getString("pref-hide-key") : getString("pref-show-key"),
  );
}

function populateModelList(
  doc: Document,
  config: ApiKeyProviderConfig,
): void {
  const providerManager = getProviderManager();
  const listContainer = doc.getElementById("pref-model-list");
  if (!listContainer) return;

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

    const infoContainer = doc.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLDivElement;
    infoContainer.style.cssText =
      "display: flex; flex-direction: column; flex: 1;";

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
            const metadata = providerManager.getProviderMetadata(config.id);
            populateApiKeyPanel(doc, updatedConfig, metadata);
          }
        }
      });
      item.appendChild(deleteBtn);
    }

    listContainer.appendChild(item);
  });

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

export function saveCurrentProviderConfig(
  doc: Document,
  currentProviderId: string,
): void {
  const providerManager = getProviderManager();

  const baseUrlInput = doc.getElementById(
    "pref-provider-baseurl",
  ) as HTMLInputElement;
  const apikeyInput = doc.getElementById(
    "pref-provider-apikey",
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
  const maxDocumentsEl = doc.getElementById(
    "pref-max-documents",
  ) as HTMLInputElement;
  const systemPromptEl = doc.getElementById(
    "pref-provider-systemprompt",
  ) as HTMLTextAreaElement;
  const streamingOutputEl = doc.getElementById(
    "pref-streaming-output",
  ) as HTMLInputElement;

  const apiKey = (apikeyInput?.value || "").trim();

  const updates: Partial<ApiKeyProviderConfig> = {
    enabled: apiKey !== "",
    apiKey,
    baseUrl: (baseUrlInput?.value || "").trim(),
    defaultModel: modelSelect?.value || "",
    maxTokens: parseInt(maxTokensEl?.value) || -1,
    temperature: parseFloat(temperatureEl?.value) || 0.7,
    pdfMaxChars: parseInt(pdfMaxCharsEl?.value) || 50000,
    maxDocuments: parseInt(maxDocumentsEl?.value) || 3,
    systemPrompt: systemPromptEl?.value || "",
    streamingOutput: streamingOutputEl?.checked ?? true,
  };
  providerManager.updateProviderConfig(currentProviderId, updates);

  const model = modelSelect?.value;
  if (model) {
    const modelStateManager = getModelStateManager();
    modelStateManager.setModel(model, currentProviderId);
  }
}

export async function autoFetchModels(
  doc: Document,
  currentProviderId: string,
): Promise<void> {
  const providerManager = getProviderManager();
  const provider = providerManager.getProvider(currentProviderId);
  const config = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig | null;
  if (!provider || !provider.isReady() || !config) {
    showTestResult(doc, getString("pref-provider-not-ready"), true);
    return;
  }

  provider.updateConfig({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });

  try {
    showTestResult(doc, getString("pref-fetching-models"), false);
    const models = await provider.getAvailableModels();

    providerManager.updateProviderConfig(currentProviderId, {
      availableModels: models,
      defaultModel: config.defaultModel || models[0] || "",
    });

    const updatedConfig = providerManager.getProviderConfig(currentProviderId);
    if (updatedConfig) {
      const metadata = providerManager.getProviderMetadata(currentProviderId);
      populateApiKeyPanel(
        doc,
        updatedConfig as ApiKeyProviderConfig,
        metadata,
      );
    }

    showTestResult(
      doc,
      getString("pref-models-loaded", { args: { count: models.length } }),
      false,
    );
  } catch {
    showTestResult(doc, getString("pref-fetch-models-failed"), true);
  }
}

export function bindApiKeyEvents(
  doc: Document,
  getCurrentProviderId: () => string,
): void {
  const providerManager = getProviderManager();

  // Base URL input: save on blur
  const baseUrlInput = doc.getElementById(
    "pref-provider-baseurl",
  ) as HTMLInputElement;
  baseUrlInput?.addEventListener("blur", () => {
    const currentProviderId = getCurrentProviderId();
    const config = providerManager.getProviderConfig(currentProviderId);
    if ((baseUrlInput.value || "").trim() === (config?.baseUrl || "")) return;
    saveCurrentProviderConfig(doc, currentProviderId);
  });

  // API key input: save the key on blur and refresh the model list
  const apikeyInput = doc.getElementById(
    "pref-provider-apikey",
  ) as HTMLInputElement;
  apikeyInput?.addEventListener("blur", () => {
    const currentProviderId = getCurrentProviderId();
    const config = providerManager.getProviderConfig(currentProviderId);
    const newApiKey = (apikeyInput.value || "").trim();
    if (newApiKey === (config?.apiKey || "")) {
      return;
    }

    saveCurrentProviderConfig(doc, currentProviderId);
    autoFetchModels(doc, currentProviderId);
  });

  // Toggle key visibility between masked and plain text
  const toggleKeyBtn = doc.getElementById("pref-toggle-apikey");
  toggleKeyBtn?.addEventListener("click", () => {
    const keyVisible = apikeyInput?.type === "text";
    if (apikeyInput) {
      apikeyInput.type = keyVisible ? "password" : "text";
    }
    updateToggleKeyButton(doc, !keyVisible);
  });

  const visitWebsiteBtn = doc.getElementById("pref-visit-website");
  visitWebsiteBtn?.addEventListener("click", () => {
    const currentProviderId = getCurrentProviderId();
    const providerMeta = providerManager.getProviderMetadata(currentProviderId);
    if (providerMeta?.website) {
      Zotero.launchURL(providerMeta.website);
    }
  });

  const modelSelect = doc.getElementById(
    "pref-provider-model",
  ) as unknown as XULMenuListElement;
  modelSelect?.addEventListener("command", () => {
    const providerId = getCurrentProviderId();
    const model = modelSelect.value;

    saveCurrentProviderConfig(doc, providerId);

    if (model) {
      const modelStateManager = getModelStateManager();
      modelStateManager.setModel(model, providerId);
    }
  });

  const maxTokensInput = doc.getElementById(
    "pref-provider-maxtokens",
  ) as HTMLInputElement;
  maxTokensInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  const temperatureInput = doc.getElementById(
    "pref-provider-temperature",
  ) as HTMLInputElement;
  temperatureInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  const pdfMaxCharsInput = doc.getElementById(
    "pref-provider-pdfmaxchars",
  ) as HTMLInputElement;
  pdfMaxCharsInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  const maxDocumentsInput = doc.getElementById(
    "pref-max-documents",
  ) as HTMLInputElement;
  maxDocumentsInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  const systemPromptInput = doc.getElementById(
    "pref-provider-systemprompt",
  ) as HTMLTextAreaElement;
  systemPromptInput?.addEventListener("blur", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  const streamingOutputInput = doc.getElementById(
    "pref-streaming-output",
  ) as HTMLInputElement;
  streamingOutputInput?.addEventListener("command", () =>
    saveCurrentProviderConfig(doc, getCurrentProviderId()),
  );

  const refreshModelsBtn = doc.getElementById("pref-refresh-models");
  refreshModelsBtn?.addEventListener("click", () =>
    autoFetchModels(doc, getCurrentProviderId()),
  );

  const testConnectionBtn = doc.getElementById("pref-test-connection");
  testConnectionBtn?.addEventListener("click", async () => {
    const currentProviderId = getCurrentProviderId();
    const provider = providerManager.getProvider(currentProviderId);
    const config = providerManager.getProviderConfig(currentProviderId);
    if (!provider || !provider.isReady() || !config?.apiKey) {
      showTestResult(doc, getString("pref-provider-not-ready"), true);
      return;
    }

    provider.updateConfig({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });

    showTestResult(doc, getString("pref-testing"), false);
    try {
      const success = await provider.testConnection();
      if (success) {
        showTestResult(doc, getString("pref-test-success"), false);
      } else {
        showTestResult(doc, getString("pref-test-failed"), true);
      }
    } catch {
      showTestResult(doc, getString("pref-test-failed"), true);
    }
  });

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
          const metadata = providerManager.getProviderMetadata(config.id);
          populateApiKeyPanel(doc, config, metadata);
        }
      } else {
        showTestResult(doc, getString("pref-model-exists" as any), true);
      }
    }
  });

  const deleteProviderBtn = doc.getElementById("pref-delete-provider");
  deleteProviderBtn?.addEventListener("click", () => {
    const currentProviderId = getCurrentProviderId();
    const config = providerManager.getProviderConfig(currentProviderId);

    if (config?.isBuiltin) {
      showTestResult(
        doc,
        getString("pref-cannot-delete-builtin" as any) ||
          "Cannot delete built-in provider",
        true,
      );
      return;
    }

    const message =
      getString("pref-delete-provider-confirm" as any, {
        args: { name: config?.name },
      }) || `Delete provider "${config?.name}"?`;
    const confirmed = addon.data.prefs?.window?.confirm(message);

    if (confirmed) {
      providerManager.removeCustomProvider(currentProviderId);
      const newConfigs = providerManager.getAllConfigs();
      if (newConfigs.length > 0) {
        const newProviderId = newConfigs[0].id;
        providerManager.setActiveProvider(newProviderId);
      }
      window.location.reload();
    }
  });
}
