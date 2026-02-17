/**
 * ApiKeyProviderUI - API Key provider settings panel
 */

import { getString } from "../../utils/locale";
import { prefColors } from "../../utils/colors";
import { getProviderManager, getModelStateManager } from "../providers";
import type {
  ApiKeyProviderConfig,
  EndpointConfig,
  ApiKeyEntry,
  ProviderMetadata,
} from "../../types/provider";
import { clearElement, showTestResult } from "./utils";

const ENDPOINTS_DATA_KEY = "__zota_endpoints_data__";
const CURRENT_INDEX_KEY = "__zota_current_endpoint_index__";
const CURRENT_API_KEY_INDEX_KEY = "__zota_current_api_key_index__";

function getEndpointsData(
  win: Window,
  providerId: string,
): EndpointConfig[] | null {
  const data = (win as any)[ENDPOINTS_DATA_KEY]?.[providerId];
  return data || null;
}

function setEndpointsData(
  win: Window,
  providerId: string,
  endpoints: EndpointConfig[],
): void {
  if (!(win as any)[ENDPOINTS_DATA_KEY]) {
    (win as any)[ENDPOINTS_DATA_KEY] = {};
  }
  (win as any)[ENDPOINTS_DATA_KEY][providerId] = endpoints;
}

function getCurrentIndex(
  win: Window,
  providerId: string,
  config?: ApiKeyProviderConfig,
): number {
  const windowIndex = (win as any)[CURRENT_INDEX_KEY]?.[providerId];
  if (windowIndex !== undefined) return windowIndex;

  const cfg =
    config ||
    (getProviderManager().getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig);
  if (cfg?.currentEndpointIndex !== undefined) return cfg.currentEndpointIndex;
  return 0;
}

function setCurrentIndex(
  win: Window,
  providerId: string,
  index: number,
  providerManager?: ReturnType<typeof getProviderManager>,
): void {
  if (!(win as any)[CURRENT_INDEX_KEY]) {
    (win as any)[CURRENT_INDEX_KEY] = {};
  }
  (win as any)[CURRENT_INDEX_KEY][providerId] = index;

  if (providerManager) {
    providerManager.updateProviderConfig(providerId, {
      currentEndpointIndex: index,
    });
  }
}

function getCurrentApiKeyIndex(
  win: Window,
  providerId: string,
  endpointIndex: number,
  endpoints?: EndpointConfig[],
): number {
  const key = `${providerId}_${endpointIndex}`;
  const windowIndex = (win as any)[CURRENT_API_KEY_INDEX_KEY]?.[key];
  if (windowIndex !== undefined) return windowIndex;

  const eps = endpoints || getEndpointsData(win, providerId) || [];
  if (eps && eps[endpointIndex]) {
    return eps[endpointIndex].currentApiKeyIndex ?? 0;
  }
  return 0;
}

function setCurrentApiKeyIndex(
  win: Window,
  providerId: string,
  endpointIndex: number,
  index: number,
  endpoints?: EndpointConfig[],
  providerManager?: ReturnType<typeof getProviderManager>,
): void {
  if (!(win as any)[CURRENT_API_KEY_INDEX_KEY]) {
    (win as any)[CURRENT_API_KEY_INDEX_KEY] = {};
  }
  const key = `${providerId}_${endpointIndex}`;
  (win as any)[CURRENT_API_KEY_INDEX_KEY][key] = index;

  if (providerManager && endpoints) {
    const newEndpoints = endpoints.map((ep, idx) =>
      idx === endpointIndex ? { ...ep, currentApiKeyIndex: index } : ep,
    );
    providerManager.updateProviderConfig(providerId, {
      endpoints: newEndpoints,
    });
  }
}

function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return key || "";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

export function populateApiKeyPanel(
  doc: Document,
  config: ApiKeyProviderConfig,
  metadata?: ProviderMetadata | null,
): void {
  const win = doc.defaultView;
  if (!win) return;

  const baseurlSelect = doc.getElementById(
    "pref-provider-baseurl",
  ) as unknown as XULMenuListElement;
  const apikeySelect = doc.getElementById(
    "pref-provider-apikey",
  ) as unknown as XULMenuListElement;
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
  const streamingOutputEl = doc.getElementById(
    "pref-streaming-output",
  ) as HTMLInputElement;

  let endpoints = getEndpointsData(win, config.id);

  if (!endpoints) {
    if (config.endpoints && config.endpoints.length > 0) {
      endpoints = [...config.endpoints];
    } else if (config.baseUrl) {
      // Check if provider has multiple endpoints defined in metadata
      if (metadata?.endpoints && metadata.endpoints.length > 1) {
        endpoints = metadata.endpoints.map((ep) => ({
          baseUrl: ep.baseUrl,
          apiKeys: config.apiKey ? [{ key: config.apiKey, name: "" }] : [],
          currentApiKeyIndex: 0,
          availableModels: config.availableModels || [],
          defaultModel: config.defaultModel || "",
        }));
      } else {
        endpoints = [
          {
            baseUrl: config.baseUrl,
            apiKeys: config.apiKey ? [{ key: config.apiKey, name: "" }] : [],
            currentApiKeyIndex: 0,
            availableModels: config.availableModels || [],
            defaultModel: config.defaultModel || "",
          },
        ];
      }
    } else {
      endpoints = [];
    }
    setEndpointsData(win, config.id, endpoints);
  }

  let currentEndpointIndex = getCurrentIndex(win, config.id, config);
  if (currentEndpointIndex >= endpoints.length) {
    currentEndpointIndex = Math.max(0, endpoints.length - 1);
    setCurrentIndex(win, config.id, currentEndpointIndex, getProviderManager());
  }

  const currentEndpoint = endpoints[currentEndpointIndex];

  let currentApiKeyIndex = currentEndpoint
    ? getCurrentApiKeyIndex(win, config.id, currentEndpointIndex, endpoints)
    : 0;
  if (currentEndpoint && currentApiKeyIndex >= currentEndpoint.apiKeys.length) {
    currentApiKeyIndex = Math.max(0, currentEndpoint.apiKeys.length - 1);
    setCurrentApiKeyIndex(
      win,
      config.id,
      currentEndpointIndex,
      currentApiKeyIndex,
      endpoints,
      getProviderManager(),
    );
  }

  populateEndpointDropdown(
    doc,
    endpoints,
    currentEndpointIndex,
    config.isBuiltin,
    metadata,
  );
  populateApiKeyDropdown(
    doc,
    currentEndpoint?.apiKeys || [],
    currentApiKeyIndex,
  );

  const modelPopup = doc.getElementById("pref-provider-model-popup");
  if (modelPopup && modelSelect) {
    clearElement(modelPopup);

    const models = currentEndpoint?.availableModels || [];
    models.forEach((model) => {
      const menuitem = doc.createXULElement("menuitem");
      menuitem.setAttribute("label", model);
      menuitem.setAttribute("value", model);
      modelPopup.appendChild(menuitem);
    });

    const defaultModel = currentEndpoint?.defaultModel || models[0] || "";
    modelSelect.value = defaultModel;
  }

  populateModelList(doc, config, currentEndpoint);

  if (maxTokensEl) maxTokensEl.value = String(config.maxTokens ?? -1);
  if (temperatureEl) temperatureEl.value = String(config.temperature ?? 0.7);
  if (pdfMaxCharsEl) pdfMaxCharsEl.value = String(config.pdfMaxChars ?? 50000);
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

  // Update visit website button state based on provider type
  const visitWebsiteBtn = doc.getElementById(
    "pref-visit-website",
  ) as HTMLButtonElement;
  if (visitWebsiteBtn) {
    // Check if any endpoint has a website or provider has a default website
    const hasWebsite =
      metadata?.endpoints?.some((ep) => ep.website) ||
      (metadata?.website && metadata.website.length > 0);
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

function populateEndpointDropdown(
  doc: Document,
  endpoints: EndpointConfig[],
  selectedIndex: number,
  isBuiltin: boolean,
  metadata?: ProviderMetadata | null,
): void {
  const baseurlSelect = doc.getElementById(
    "pref-provider-baseurl",
  ) as unknown as XULMenuListElement;
  const baseurlPopup = doc.getElementById("pref-provider-baseurl-popup");

  if (!baseurlSelect || !baseurlPopup) return;

  clearElement(baseurlPopup);

  endpoints.forEach((endpoint, index) => {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("label", endpoint.baseUrl);
    menuitem.setAttribute("value", String(index));
    baseurlPopup.appendChild(menuitem);
  });

  if (!isBuiltin && endpoints.length > 0) {
    const separator1 = doc.createXULElement("menuseparator");
    baseurlPopup.appendChild(separator1);

    const editItem = doc.createXULElement("menuitem");
    editItem.setAttribute(
      "label",
      getString("pref-edit-endpoint" as any) || "Edit Endpoint",
    );
    editItem.setAttribute("value", "__edit_endpoint__");
    editItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
    baseurlPopup.appendChild(editItem);

    const deleteItem = doc.createXULElement("menuitem");
    deleteItem.setAttribute(
      "label",
      getString("pref-delete-endpoint" as any) || "Delete Endpoint",
    );
    deleteItem.setAttribute("value", "__delete__");
    deleteItem.setAttribute("style", "font-weight: bold; color: #cc0000;");
    baseurlPopup.appendChild(deleteItem);
  }

  if (!isBuiltin) {
    const separator2 = doc.createXULElement("menuseparator");
    baseurlPopup.appendChild(separator2);

    const addNewItem = doc.createXULElement("menuitem");
    addNewItem.setAttribute(
      "label",
      getString("pref-add-endpoint" as any) || "+ Add Endpoint",
    );
    addNewItem.setAttribute("value", "__add_new__");
    addNewItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
    baseurlPopup.appendChild(addNewItem);
  }

  if (endpoints.length > 0 && selectedIndex < endpoints.length) {
    baseurlSelect.selectedIndex = selectedIndex;
    baseurlSelect.value = String(selectedIndex);
  } else {
    baseurlSelect.selectedIndex = -1;
    baseurlSelect.setAttribute("label", "");
    baseurlSelect.value = "";
  }
}

function populateApiKeyDropdown(
  doc: Document,
  apiKeys: ApiKeyEntry[],
  selectedIndex: number,
): void {
  const apikeySelect = doc.getElementById(
    "pref-provider-apikey",
  ) as unknown as XULMenuListElement;
  const apikeyPopup = doc.getElementById("pref-provider-apikey-popup");

  if (!apikeySelect || !apikeyPopup) return;

  clearElement(apikeyPopup);

  apiKeys.forEach((apiKeyEntry, index) => {
    const menuitem = doc.createXULElement("menuitem");
    const displayLabel = apiKeyEntry.name || maskApiKey(apiKeyEntry.key);
    menuitem.setAttribute("label", displayLabel);
    menuitem.setAttribute("value", String(index));
    apikeyPopup.appendChild(menuitem);
  });

  if (apiKeys.length > 0) {
    const separator1 = doc.createXULElement("menuseparator");
    apikeyPopup.appendChild(separator1);

    const editItem = doc.createXULElement("menuitem");
    editItem.setAttribute(
      "label",
      getString("pref-edit-apikey" as any) || "Edit API Key",
    );
    editItem.setAttribute("value", "__edit_apikey__");
    editItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
    apikeyPopup.appendChild(editItem);

    const deleteItem = doc.createXULElement("menuitem");
    deleteItem.setAttribute(
      "label",
      getString("pref-delete-apikey" as any) || "Delete API Key",
    );
    deleteItem.setAttribute("value", "__delete_apikey__");
    deleteItem.setAttribute("style", "font-weight: bold; color: #cc0000;");
    apikeyPopup.appendChild(deleteItem);
  }

  const separator2 = doc.createXULElement("menuseparator");
  apikeyPopup.appendChild(separator2);

  const addNewItem = doc.createXULElement("menuitem");
  addNewItem.setAttribute(
    "label",
    getString("pref-add-apikey" as any) || "+ Add API Key",
  );
  addNewItem.setAttribute("value", "__add_apikey__");
  addNewItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
  apikeyPopup.appendChild(addNewItem);

  if (apiKeys.length > 0 && selectedIndex < apiKeys.length) {
    apikeySelect.selectedIndex = selectedIndex;
    apikeySelect.value = String(selectedIndex);
  } else {
    apikeySelect.selectedIndex = -1;
    apikeySelect.setAttribute("label", "");
    apikeySelect.value = "";
  }
}

function populateModelList(
  doc: Document,
  config: ApiKeyProviderConfig,
  currentEndpoint?: EndpointConfig,
): void {
  const providerManager = getProviderManager();
  const listContainer = doc.getElementById("pref-model-list");
  if (!listContainer) return;

  clearElement(listContainer);

  const models = currentEndpoint?.availableModels || [];

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
          const win = doc.defaultView;
          if (win && currentEndpoint) {
            const currentEndpointIndex = getCurrentIndex(win, config.id);
            let endpoints = getEndpointsData(win, config.id) || [];
            endpoints = endpoints.map((ep, idx) =>
              idx === currentEndpointIndex
                ? {
                    ...ep,
                    availableModels: ep.availableModels?.filter(
                      (m) => m !== modelId,
                    ),
                  }
                : ep,
            );
            setEndpointsData(win, config.id, endpoints);

            const providerManager = getProviderManager();
            providerManager.updateProviderConfig(config.id, {
              endpoints,
              availableModels:
                endpoints[currentEndpointIndex]?.availableModels || [],
            });

            const updatedConfig = providerManager.getProviderConfig(
              config.id,
            ) as ApiKeyProviderConfig;
            if (updatedConfig) {
              const metadata = providerManager.getProviderMetadata(config.id);
              populateApiKeyPanel(doc, updatedConfig, metadata);
            }
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
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

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
  const streamingOutputEl = doc.getElementById(
    "pref-streaming-output",
  ) as HTMLInputElement;

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  const currentApiKeyIndex = getCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
  );

  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length > 0 && currentEndpointIndex < endpoints.length) {
    endpoints = endpoints.map((ep, idx) =>
      idx === currentEndpointIndex
        ? { ...ep, defaultModel: modelSelect?.value || ep.defaultModel }
        : ep,
    );
    setEndpointsData(win, currentProviderId, endpoints);
  }

  const currentEndpoint = endpoints[currentEndpointIndex];
  const currentApiKey = currentEndpoint?.apiKeys[currentApiKeyIndex]?.key || "";
  const isNowEnabled = endpoints.some((ep) =>
    ep.apiKeys.some((k) => k.key.trim() !== ""),
  );

  const updates: Partial<ApiKeyProviderConfig> = {
    enabled: isNowEnabled,
    apiKey: currentApiKey,
    baseUrl: currentEndpoint?.baseUrl || "",
    defaultModel: modelSelect?.value || "",
    availableModels: currentEndpoint?.availableModels || [],
    maxTokens: parseInt(maxTokensEl?.value) || -1,
    temperature: parseFloat(temperatureEl?.value) || 0.7,
    pdfMaxChars: parseInt(pdfMaxCharsEl?.value) || 50000,
    systemPrompt: systemPromptEl?.value || "",
    streamingOutput: streamingOutputEl?.checked ?? true,
    endpoints,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  const model = modelSelect?.value;
  if (model) {
    const modelStateManager = getModelStateManager();
    modelStateManager.setModel(model, currentProviderId);
  }
}

function addNewEndpoint(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();
  const config = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;

  if (config.isBuiltin) {
    showTestResult(
      doc,
      getString("pref-cannot-add-endpoint-builtin" as any) ||
        "Cannot add endpoint to built-in provider",
      true,
    );
    return;
  }

  const newBaseUrl = addon.data.prefs?.window?.prompt(
    getString("pref-enter-base-url" as any) || "Enter endpoint URL:",
  );

  if (!newBaseUrl || !newBaseUrl.trim()) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  let endpoints = getEndpointsData(win, currentProviderId) || [];

  const exists = endpoints.some(
    (ep) => ep.baseUrl.toLowerCase() === newBaseUrl.trim().toLowerCase(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-endpoint-exists" as any) || "Endpoint already exists",
      true,
    );
    const baseurlSelect = doc.getElementById(
      "pref-provider-baseurl",
    ) as unknown as XULMenuListElement;
    if (baseurlSelect) {
      const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
      baseurlSelect.selectedIndex = currentEndpointIndex;
      baseurlSelect.value = String(currentEndpointIndex);
    }
    return;
  }

  endpoints = [
    ...endpoints,
    {
      baseUrl: newBaseUrl.trim(),
      apiKeys: [],
      currentApiKeyIndex: 0,
      availableModels: [],
      defaultModel: "",
    },
  ];

  const newIndex = endpoints.length - 1;
  setEndpointsData(win, currentProviderId, endpoints);
  setCurrentIndex(win, currentProviderId, newIndex, providerManager);

  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    baseUrl: newBaseUrl.trim(),
    apiKey: "",
    availableModels: [],
    defaultModel: "",
    currentEndpointIndex: newIndex,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);

  showTestResult(
    doc,
    getString("pref-endpoint-added" as any) || "Endpoint added",
    false,
  );
}

function editEndpoint(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();
  const config = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;

  if (config.isBuiltin) {
    showTestResult(
      doc,
      getString("pref-cannot-edit-endpoint-builtin" as any) ||
        "Cannot edit built-in provider endpoint",
      true,
    );
    return;
  }

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length)
    return;

  const currentEndpoint = endpoints[currentEndpointIndex];
  const currentUrl = currentEndpoint.baseUrl;

  const newBaseUrl = addon.data.prefs?.window?.prompt(
    getString("pref-edit-base-url" as any) || "Edit endpoint URL:",
    currentUrl,
  );

  if (!newBaseUrl || !newBaseUrl.trim()) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  const exists = endpoints.some(
    (ep, idx) =>
      idx !== currentEndpointIndex &&
      ep.baseUrl.toLowerCase() === newBaseUrl.trim().toLowerCase(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-endpoint-exists" as any) || "Endpoint already exists",
      true,
    );
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  endpoints = endpoints.map((ep, idx) =>
    idx === currentEndpointIndex ? { ...ep, baseUrl: newBaseUrl.trim() } : ep,
  );

  setEndpointsData(win, currentProviderId, endpoints);

  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    baseUrl: newBaseUrl.trim(),
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);

  showTestResult(
    doc,
    getString("pref-endpoint-edited" as any) || "Endpoint edited",
    false,
  );
}

function deleteEndpoint(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();
  const config = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;

  if (config.isBuiltin) {
    showTestResult(
      doc,
      getString("pref-cannot-delete-endpoint-builtin" as any) ||
        "Cannot delete built-in provider endpoint",
      true,
    );
    return;
  }

  let endpoints = getEndpointsData(win, currentProviderId) || [];
  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length)
    return;

  const endpointToDelete = endpoints[currentEndpointIndex];
  const message =
    getString("pref-delete-endpoint-confirm" as any, {
      args: { endpoint: endpointToDelete.baseUrl },
    }) || `Delete endpoint "${endpointToDelete.baseUrl}"?`;
  const confirmed = addon.data.prefs?.window?.confirm(message);

  if (!confirmed) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  endpoints = endpoints.filter((_, idx) => idx !== currentEndpointIndex);
  setEndpointsData(win, currentProviderId, endpoints);

  const newIndex = Math.max(
    0,
    Math.min(currentEndpointIndex, endpoints.length - 1),
  );
  setCurrentIndex(win, currentProviderId, newIndex, providerManager);

  const newEndpoint = endpoints[newIndex];

  const hasAnyKey = endpoints.some((ep) =>
    ep.apiKeys.some((k) => k.key.trim() !== ""),
  );
  const newDefaultModel = newEndpoint?.defaultModel || "";
  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    baseUrl: newEndpoint?.baseUrl || "",
    apiKey:
      newEndpoint?.apiKeys[newEndpoint?.currentApiKeyIndex || 0]?.key || "",
    availableModels: newEndpoint?.availableModels || [],
    currentEndpointIndex: newIndex,
    defaultModel: newDefaultModel,
    enabled: hasAnyKey,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  const modelStateManager = getModelStateManager();
  if (newDefaultModel) {
    modelStateManager.setModel(newDefaultModel, currentProviderId);
  } else {
    modelStateManager.setModel("", currentProviderId);
  }

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);

  showTestResult(
    doc,
    getString("pref-endpoint-deleted" as any) || "Endpoint deleted",
    false,
  );
}

function switchEndpoint(
  doc: Document,
  currentProviderId: string,
  endpointIndex: number,
): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  saveCurrentProviderConfig(doc, currentProviderId);

  const endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpointIndex < 0 || endpointIndex >= endpoints.length) return;

  setCurrentIndex(win, currentProviderId, endpointIndex, providerManager);
  const endpoint = endpoints[endpointIndex];
  const currentApiKeyIndex = endpoint.currentApiKeyIndex || 0;
  const currentApiKey = endpoint.apiKeys[currentApiKeyIndex]?.key || "";

  providerManager.updateProviderConfig(currentProviderId, {
    baseUrl: endpoint.baseUrl,
    apiKey: currentApiKey,
    availableModels: endpoint.availableModels || [],
    defaultModel: endpoint.defaultModel || "",
    currentEndpointIndex: endpointIndex,
  });

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    const metadata = providerManager.getProviderMetadata(currentProviderId);
    populateApiKeyPanel(doc, updatedConfig, metadata);
  }
}

function addNewApiKey(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length) {
    showTestResult(
      doc,
      getString("pref-add-endpoint-first" as any) ||
        "Please add an endpoint first",
      true,
    );
    return;
  }

  const keyName = addon.data.prefs?.window?.prompt(
    getString("pref-enter-apikey-name" as any) || "API Key name (optional):",
  );

  if (keyName === null) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  const newApiKey = addon.data.prefs?.window?.prompt(
    getString("pref-enter-apikey" as any) || "Enter API Key:",
  );

  if (!newApiKey || !newApiKey.trim()) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  const currentEndpoint = endpoints[currentEndpointIndex];
  const exists = currentEndpoint.apiKeys.some(
    (k) => k.key === newApiKey.trim(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-apikey-exists" as any) || "API Key already exists",
      true,
    );
    const apikeySelect = doc.getElementById(
      "pref-provider-apikey",
    ) as unknown as XULMenuListElement;
    if (apikeySelect) {
      const currentApiKeyIndex = getCurrentApiKeyIndex(
        win,
        currentProviderId,
        currentEndpointIndex,
      );
      apikeySelect.selectedIndex = currentApiKeyIndex;
      apikeySelect.value = String(currentApiKeyIndex);
    }
    return;
  }

  const newKeyEntry: ApiKeyEntry = {
    key: newApiKey.trim(),
    name: keyName?.trim() || "",
  };

  endpoints = endpoints.map((ep, idx) =>
    idx === currentEndpointIndex
      ? { ...ep, apiKeys: [...ep.apiKeys, newKeyEntry] }
      : ep,
  );

  const newApiKeyIndex = currentEndpoint.apiKeys.length;
  setEndpointsData(win, currentProviderId, endpoints);
  setCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
    newApiKeyIndex,
    endpoints,
    providerManager,
  );

  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    apiKey: newApiKey.trim(),
    enabled: true,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);

  autoFetchModels(doc, currentProviderId);
}

function editApiKey(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length)
    return;

  const currentEndpoint = endpoints[currentEndpointIndex];
  const currentApiKeyIndex = getCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
  );

  if (
    currentEndpoint.apiKeys.length === 0 ||
    currentApiKeyIndex >= currentEndpoint.apiKeys.length
  )
    return;

  const currentKeyEntry = currentEndpoint.apiKeys[currentApiKeyIndex];

  const newName = addon.data.prefs?.window?.prompt(
    getString("pref-edit-apikey-name" as any) ||
      "Edit API Key name (optional):",
    currentKeyEntry.name || "",
  );

  if (newName === null) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  const newApiKey = addon.data.prefs?.window?.prompt(
    getString("pref-edit-apikey" as any) || "Edit API Key:",
    currentKeyEntry.key,
  );

  if (!newApiKey || !newApiKey.trim()) {
    if (newName !== null && newName !== undefined) {
      endpoints = endpoints.map((ep, idx) =>
        idx === currentEndpointIndex
          ? {
              ...ep,
              apiKeys: ep.apiKeys.map((k, kidx) =>
                kidx === currentApiKeyIndex
                  ? { ...k, name: newName.trim() }
                  : k,
              ),
            }
          : ep,
      );
      setEndpointsData(win, currentProviderId, endpoints);

      providerManager.updateProviderConfig(currentProviderId, { endpoints });
    }

    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  const exists = currentEndpoint.apiKeys.some(
    (k, idx) => idx !== currentApiKeyIndex && k.key === newApiKey.trim(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-apikey-exists" as any) || "API Key already exists",
      true,
    );
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) populateApiKeyPanel(doc, config);
    return;
  }

  endpoints = endpoints.map((ep, idx) =>
    idx === currentEndpointIndex
      ? {
          ...ep,
          apiKeys: ep.apiKeys.map((k, kidx) =>
            kidx === currentApiKeyIndex
              ? { key: newApiKey.trim(), name: newName?.trim() || "" }
              : k,
          ),
        }
      : ep,
  );

  setEndpointsData(win, currentProviderId, endpoints);

  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    apiKey: newApiKey.trim(),
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);

  showTestResult(
    doc,
    getString("pref-apikey-edited" as any) || "API Key edited",
    false,
  );
}

function deleteApiKey(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length)
    return;

  const currentEndpoint = endpoints[currentEndpointIndex];
  const currentApiKeyIndex = getCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
  );

  if (
    currentEndpoint.apiKeys.length === 0 ||
    currentApiKeyIndex >= currentEndpoint.apiKeys.length
  )
    return;

  const keyToDelete = currentEndpoint.apiKeys[currentApiKeyIndex];
  const displayName = keyToDelete.name || maskApiKey(keyToDelete.key);
  const message =
    getString("pref-delete-apikey-confirm" as any, {
      args: { key: displayName },
    }) || `Delete API Key "${displayName}"?`;
  const confirmed = addon.data.prefs?.window?.confirm(message);

  if (!confirmed) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      const metadata = providerManager.getProviderMetadata(config.id);
      populateApiKeyPanel(doc, config, metadata);
    }
    return;
  }

  const newApiKeys = currentEndpoint.apiKeys.filter(
    (_, idx) => idx !== currentApiKeyIndex,
  );

  const newApiKeyIndex = Math.max(
    0,
    Math.min(currentApiKeyIndex, newApiKeys.length - 1),
  );

  endpoints = endpoints.map((ep, idx) =>
    idx === currentEndpointIndex
      ? { ...ep, apiKeys: newApiKeys, currentApiKeyIndex: newApiKeyIndex }
      : ep,
  );

  setEndpointsData(win, currentProviderId, endpoints);
  setCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
    newApiKeyIndex,
    endpoints,
    providerManager,
  );

  const newCurrentKey = newApiKeys[newApiKeyIndex]?.key || "";
  const hasAnyKey = endpoints.some((ep) =>
    ep.apiKeys.some((k) => k.key.trim() !== ""),
  );
  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    apiKey: newCurrentKey,
    enabled: hasAnyKey,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);

  showTestResult(
    doc,
    getString("pref-apikey-deleted" as any) || "API Key deleted",
    false,
  );
}

function switchApiKey(
  doc: Document,
  currentProviderId: string,
  apiKeyIndex: number,
): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  const endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length)
    return;

  const currentEndpoint = endpoints[currentEndpointIndex];

  if (apiKeyIndex < 0 || apiKeyIndex >= currentEndpoint.apiKeys.length) return;

  saveCurrentProviderConfig(doc, currentProviderId);

  setCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
    apiKeyIndex,
    endpoints,
    providerManager,
  );
  const newApiKey = currentEndpoint.apiKeys[apiKeyIndex].key;

  providerManager.updateProviderConfig(currentProviderId, {
    apiKey: newApiKey,
  });

  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);
}

export async function autoFetchModels(
  doc: Document,
  currentProviderId: string,
): Promise<void> {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();
  const provider = providerManager.getProvider(currentProviderId);
  if (!provider || !provider.isReady()) {
    showTestResult(doc, getString("pref-provider-not-ready"), true);
    return;
  }

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  const currentApiKeyIndex = getCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
  );
  const endpoints = getEndpointsData(win, currentProviderId) || [];
  const currentEndpoint = endpoints[currentEndpointIndex];
  const currentApiKey = currentEndpoint?.apiKeys[currentApiKeyIndex]?.key;

  if (!currentApiKey) {
    showTestResult(doc, getString("pref-provider-not-ready"), true);
    return;
  }

  provider.updateConfig({
    apiKey: currentApiKey,
    baseUrl: currentEndpoint?.baseUrl,
  });

  try {
    showTestResult(doc, getString("pref-fetching-models"), false);
    const models = await provider.getAvailableModels();

    let endpoints = getEndpointsData(win, currentProviderId) || [];

    if (endpoints.length > 0 && currentEndpointIndex < endpoints.length) {
      endpoints = endpoints.map((ep, idx) =>
        idx === currentEndpointIndex
          ? {
              ...ep,
              availableModels: models,
              defaultModel: ep.defaultModel || models[0] || "",
            }
          : ep,
      );
      setEndpointsData(win, currentProviderId, endpoints);

      providerManager.updateProviderConfig(currentProviderId, {
        endpoints,
        availableModels: models,
        defaultModel:
          endpoints[currentEndpointIndex]?.defaultModel || models[0] || "",
      });

      const updatedConfig = providerManager.getProviderConfig(
        currentProviderId,
      ) as ApiKeyProviderConfig;
      if (updatedConfig) populateApiKeyPanel(doc, updatedConfig);

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

export function bindApiKeyEvents(
  doc: Document,
  getCurrentProviderId: () => string,
): void {
  const providerManager = getProviderManager();

  const baseurlSelect = doc.getElementById(
    "pref-provider-baseurl",
  ) as unknown as XULMenuListElement;
  baseurlSelect?.addEventListener("command", () => {
    const selectedValue = baseurlSelect.value;
    const currentProviderId = getCurrentProviderId();

    if (selectedValue === "__add_new__") {
      addNewEndpoint(doc, currentProviderId);
    } else if (selectedValue === "__edit_endpoint__") {
      editEndpoint(doc, currentProviderId);
    } else if (selectedValue === "__delete__") {
      deleteEndpoint(doc, currentProviderId);
    } else {
      const index = parseInt(selectedValue, 10);
      if (!isNaN(index)) {
        switchEndpoint(doc, currentProviderId, index);
      }
    }
  });

  const apikeySelect = doc.getElementById(
    "pref-provider-apikey",
  ) as unknown as XULMenuListElement;
  apikeySelect?.addEventListener("command", () => {
    const selectedValue = apikeySelect.value;
    const currentProviderId = getCurrentProviderId();

    if (selectedValue === "__add_apikey__") {
      addNewApiKey(doc, currentProviderId);
    } else if (selectedValue === "__edit_apikey__") {
      editApiKey(doc, currentProviderId);
    } else if (selectedValue === "__delete_apikey__") {
      deleteApiKey(doc, currentProviderId);
    } else {
      const index = parseInt(selectedValue, 10);
      if (!isNaN(index)) {
        switchApiKey(doc, currentProviderId, index);
      }
    }
  });

  const toggleKeyBtn = doc.getElementById("pref-toggle-apikey");
  toggleKeyBtn?.addEventListener("click", () => {
    const win = doc.defaultView;
    if (!win) return;

    const currentProviderId = getCurrentProviderId();
    const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
    const currentApiKeyIndex = getCurrentApiKeyIndex(
      win,
      currentProviderId,
      currentEndpointIndex,
    );
    const endpoints = getEndpointsData(win, currentProviderId) || [];
    const currentEndpoint = endpoints[currentEndpointIndex];
    const currentKey = currentEndpoint?.apiKeys[currentApiKeyIndex];

    if (!currentKey) return;

    addon.data.prefs?.window?.alert(`API Key: ${currentKey.key}`);
  });

  const visitWebsiteBtn = doc.getElementById("pref-visit-website");
  visitWebsiteBtn?.addEventListener("click", () => {
    const win = doc.defaultView;
    if (!win) return;

    const currentProviderId = getCurrentProviderId();
    const providerMeta = providerManager.getProviderMetadata(currentProviderId);

    // Get current endpoint index to find the corresponding website
    const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
    const endpointMeta = providerMeta?.endpoints?.[currentEndpointIndex];

    // Use endpoint-specific website if available, otherwise use provider's default
    const website = endpointMeta?.website || providerMeta?.website;

    if (website) {
      // Open website in default browser using Zotero's launchURL
      Zotero.launchURL(website);
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
    const win = doc.defaultView;
    if (!win) return;

    const currentProviderId = getCurrentProviderId();
    const provider = providerManager.getProvider(currentProviderId);
    if (!provider || !provider.isReady()) {
      showTestResult(doc, getString("pref-provider-not-ready"), true);
      return;
    }

    const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
    const currentApiKeyIndex = getCurrentApiKeyIndex(
      win,
      currentProviderId,
      currentEndpointIndex,
    );
    const endpoints = getEndpointsData(win, currentProviderId) || [];
    const currentEndpoint = endpoints[currentEndpointIndex];
    const currentApiKey = currentEndpoint?.apiKeys[currentApiKeyIndex]?.key;

    if (!currentApiKey) {
      showTestResult(doc, getString("pref-provider-not-ready"), true);
      return;
    }

    provider.updateConfig({
      apiKey: currentApiKey,
      baseUrl: currentEndpoint?.baseUrl,
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
    const win = doc.defaultView;
    if (!win) return;

    const currentProviderId = getCurrentProviderId();
    const currentEndpointIndex = getCurrentIndex(win, currentProviderId);

    const modelId = addon.data.prefs?.window?.prompt(
      getString("pref-enter-model-id"),
    );
    if (modelId && modelId.trim()) {
      const success = providerManager.addCustomModel(
        currentProviderId,
        modelId.trim(),
      );
      if (success) {
        let endpoints = getEndpointsData(win, currentProviderId) || [];
        if (endpoints.length > 0 && currentEndpointIndex < endpoints.length) {
          endpoints = endpoints.map((ep, idx) =>
            idx === currentEndpointIndex
              ? {
                  ...ep,
                  availableModels: [
                    ...(ep.availableModels || []),
                    modelId.trim(),
                  ],
                }
              : ep,
          );
          setEndpointsData(win, currentProviderId, endpoints);

          providerManager.updateProviderConfig(currentProviderId, {
            endpoints,
            availableModels:
              endpoints[currentEndpointIndex]?.availableModels || [],
          });
        }

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
