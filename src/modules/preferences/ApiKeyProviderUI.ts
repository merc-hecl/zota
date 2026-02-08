/**
 * ApiKeyProviderUI - Generic API Key provider settings panel
 */

import { getString } from "../../utils/locale";
import { prefColors } from "../../utils/colors";
import { getProviderManager, getModelStateManager } from "../providers";
import type {
  ApiKeyProviderConfig,
  EndpointConfig,
  ApiKeyEntry,
} from "../../types/provider";
import { clearElement, showTestResult } from "./utils";

// Store endpoints data and current index in the window for persistence
const ENDPOINTS_DATA_KEY = "__zota_endpoints_data__";
const CURRENT_INDEX_KEY = "__zota_current_endpoint_index__";
const CURRENT_API_KEY_INDEX_KEY = "__zota_current_api_key_index__";

/**
 * Get endpoints data from window storage
 */
function getEndpointsData(
  win: Window,
  providerId: string,
): EndpointConfig[] | null {
  const data = (win as any)[ENDPOINTS_DATA_KEY]?.[providerId];
  return data || null;
}

/**
 * Set endpoints data to window storage
 */
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

/**
 * Get current endpoint index from config or window storage
 */
function getCurrentIndex(
  win: Window,
  providerId: string,
  config?: ApiKeyProviderConfig,
): number {
  // First check window storage (for current session)
  const windowIndex = (win as any)[CURRENT_INDEX_KEY]?.[providerId];
  if (windowIndex !== undefined) {
    return windowIndex;
  }
  // Then check config (persisted)
  const cfg =
    config ||
    (getProviderManager().getProviderConfig(
      providerId,
    ) as ApiKeyProviderConfig);
  if (cfg?.currentEndpointIndex !== undefined) {
    return cfg.currentEndpointIndex;
  }
  return 0;
}

/**
 * Set current endpoint index to window storage and config
 */
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

  // Also persist to config
  if (providerManager) {
    providerManager.updateProviderConfig(providerId, {
      currentEndpointIndex: index,
    });
  }
}

/**
 * Get current API key index for an endpoint from config or window storage
 */
function getCurrentApiKeyIndex(
  win: Window,
  providerId: string,
  endpointIndex: number,
  endpoints?: EndpointConfig[],
): number {
  // First check window storage (for current session)
  const key = `${providerId}_${endpointIndex}`;
  const windowIndex = (win as any)[CURRENT_API_KEY_INDEX_KEY]?.[key];
  if (windowIndex !== undefined) {
    return windowIndex;
  }
  // Then check endpoint config (persisted)
  const eps = endpoints || getEndpointsData(win, providerId) || [];
  if (eps && eps[endpointIndex]) {
    return eps[endpointIndex].currentApiKeyIndex ?? 0;
  }
  return 0;
}

/**
 * Set current API key index for an endpoint to window storage and config
 */
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

  // Also persist to config
  if (providerManager && endpoints) {
    const newEndpoints = endpoints.map((ep, idx) =>
      idx === endpointIndex ? { ...ep, currentApiKeyIndex: index } : ep,
    );
    providerManager.updateProviderConfig(providerId, {
      endpoints: newEndpoints,
    });
  }
}

/**
 * Mask API key for display (show only last 4 characters)
 */
function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return key || "";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

/**
 * Populate API key panel with provider data
 */
export function populateApiKeyPanel(
  doc: Document,
  config: ApiKeyProviderConfig,
): void {
  const win = doc.defaultView;
  if (!win) return;

  const titleEl = doc.getElementById("pref-provider-title");
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

  if (titleEl && config.name) {
    titleEl.textContent = config.name;
  }

  // Get or initialize endpoints data
  let endpoints = getEndpointsData(win, config.id);

  if (!endpoints) {
    // First time loading - use config.endpoints or migrate from old format
    if (config.endpoints && config.endpoints.length > 0) {
      endpoints = [...config.endpoints];
    } else if (config.baseUrl) {
      // Migrate from old format - create endpoint with current data
      endpoints = [
        {
          baseUrl: config.baseUrl,
          apiKeys: config.apiKey ? [{ key: config.apiKey, name: "" }] : [],
          currentApiKeyIndex: 0,
          availableModels: config.availableModels || [],
          defaultModel: config.defaultModel || "",
        },
      ];
    } else {
      // No endpoints at all
      endpoints = [];
    }
    setEndpointsData(win, config.id, endpoints);
  }

  // Get current endpoint index (from window storage or config)
  let currentEndpointIndex = getCurrentIndex(win, config.id, config);
  if (currentEndpointIndex >= endpoints.length) {
    currentEndpointIndex = Math.max(0, endpoints.length - 1);
    setCurrentIndex(win, config.id, currentEndpointIndex, getProviderManager());
  }

  // Get current endpoint
  const currentEndpoint = endpoints[currentEndpointIndex];

  // Get current API key index for this endpoint (from window storage or endpoint config)
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

  // Populate endpoint dropdown
  populateEndpointDropdown(doc, endpoints, currentEndpointIndex);

  // Populate API key dropdown
  populateApiKeyDropdown(
    doc,
    currentEndpoint?.apiKeys || [],
    currentApiKeyIndex,
  );

  // Populate model dropdown with endpoint's models
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

    // Set model selection to endpoint's default model
    const defaultModel = currentEndpoint?.defaultModel || models[0] || "";
    modelSelect.value = defaultModel;
  }

  // Populate model list with endpoint's models
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

  // Reset test result
  const testResult = doc.getElementById("pref-test-result");
  if (testResult) testResult.textContent = "";
}

/**
 * Populate endpoint dropdown with saved endpoints
 */
function populateEndpointDropdown(
  doc: Document,
  endpoints: EndpointConfig[],
  selectedIndex: number,
): void {
  const baseurlSelect = doc.getElementById(
    "pref-provider-baseurl",
  ) as unknown as XULMenuListElement;
  const baseurlPopup = doc.getElementById("pref-provider-baseurl-popup");

  if (!baseurlSelect || !baseurlPopup) return;

  // Clear existing items
  clearElement(baseurlPopup);

  // Add endpoint items
  endpoints.forEach((endpoint, index) => {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("label", endpoint.baseUrl);
    menuitem.setAttribute("value", String(index));
    baseurlPopup.appendChild(menuitem);
  });

  // Add separator and action items if there are endpoints
  if (endpoints.length > 0) {
    const separator1 = doc.createXULElement("menuseparator");
    baseurlPopup.appendChild(separator1);

    // Add "Edit Current Endpoint" button item
    const editItem = doc.createXULElement("menuitem");
    editItem.setAttribute(
      "label",
      getString("pref-edit-endpoint" as any) || "✎ 修改当前接口地址",
    );
    editItem.setAttribute("value", "__edit_endpoint__");
    editItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
    baseurlPopup.appendChild(editItem);

    // Add "Delete Current Endpoint" button item
    const deleteItem = doc.createXULElement("menuitem");
    deleteItem.setAttribute(
      "label",
      getString("pref-delete-endpoint" as any) || "- 删除当前接口地址",
    );
    deleteItem.setAttribute("value", "__delete__");
    deleteItem.setAttribute("style", "font-weight: bold; color: #cc0000;");
    baseurlPopup.appendChild(deleteItem);
  }

  // Add separator before "Add New"
  const separator2 = doc.createXULElement("menuseparator");
  baseurlPopup.appendChild(separator2);

  // Add "Add New Endpoint" button item
  const addNewItem = doc.createXULElement("menuitem");
  addNewItem.setAttribute(
    "label",
    getString("pref-add-endpoint" as any) || "+ 新增接口地址",
  );
  addNewItem.setAttribute("value", "__add_new__");
  addNewItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
  baseurlPopup.appendChild(addNewItem);

  // Set current selection
  if (endpoints.length > 0 && selectedIndex < endpoints.length) {
    baseurlSelect.selectedIndex = selectedIndex;
    // Also update value to the endpoint index (not special value)
    baseurlSelect.value = String(selectedIndex);
  } else {
    // No endpoints - clear selection and show empty label
    baseurlSelect.selectedIndex = -1;
    baseurlSelect.setAttribute("label", "");
    baseurlSelect.value = "";
  }
}

/**
 * Populate API key dropdown
 */
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

  // Clear existing items
  clearElement(apikeyPopup);

  // Add API key items (show name if available, otherwise masked key)
  apiKeys.forEach((apiKeyEntry, index) => {
    const menuitem = doc.createXULElement("menuitem");
    const displayLabel = apiKeyEntry.name || maskApiKey(apiKeyEntry.key);
    menuitem.setAttribute("label", displayLabel);
    menuitem.setAttribute("value", String(index));
    apikeyPopup.appendChild(menuitem);
  });

  // Add separator and action items if there are API keys
  if (apiKeys.length > 0) {
    const separator1 = doc.createXULElement("menuseparator");
    apikeyPopup.appendChild(separator1);

    // Add "Edit Current API Key" button item
    const editItem = doc.createXULElement("menuitem");
    editItem.setAttribute(
      "label",
      getString("pref-edit-apikey" as any) || "✎ 修改当前 API 密钥",
    );
    editItem.setAttribute("value", "__edit_apikey__");
    editItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
    apikeyPopup.appendChild(editItem);

    // Add "Delete Current API Key" button item
    const deleteItem = doc.createXULElement("menuitem");
    deleteItem.setAttribute(
      "label",
      getString("pref-delete-apikey" as any) || "- 删除当前 API 密钥",
    );
    deleteItem.setAttribute("value", "__delete_apikey__");
    deleteItem.setAttribute("style", "font-weight: bold; color: #cc0000;");
    apikeyPopup.appendChild(deleteItem);
  }

  // Add separator before "Add New"
  const separator2 = doc.createXULElement("menuseparator");
  apikeyPopup.appendChild(separator2);

  // Add "Add New API Key" button item
  const addNewItem = doc.createXULElement("menuitem");
  addNewItem.setAttribute(
    "label",
    getString("pref-add-apikey" as any) || "+ 新增 API 密钥",
  );
  addNewItem.setAttribute("value", "__add_apikey__");
  addNewItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
  apikeyPopup.appendChild(addNewItem);

  // Set current selection
  if (apiKeys.length > 0 && selectedIndex < apiKeys.length) {
    apikeySelect.selectedIndex = selectedIndex;
    // Also update value to the API key index (not special value)
    apikeySelect.value = String(selectedIndex);
  } else {
    // No API keys - clear selection and show empty label
    apikeySelect.selectedIndex = -1;
    apikeySelect.setAttribute("label", "");
    apikeySelect.value = "";
  }
}

/**
 * Populate model list with delete buttons for custom models
 */
function populateModelList(
  doc: Document,
  config: ApiKeyProviderConfig,
  currentEndpoint?: EndpointConfig,
): void {
  const providerManager = getProviderManager();
  const listContainer = doc.getElementById("pref-model-list");
  if (!listContainer) return;

  // Clear existing items
  clearElement(listContainer);

  // Use endpoint's models if available, otherwise empty
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
          // Update endpoint's availableModels
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

            // Update config
            const providerManager = getProviderManager();
            providerManager.updateProviderConfig(config.id, {
              endpoints,
              availableModels:
                endpoints[currentEndpointIndex]?.availableModels || [],
            });

            // Refresh panel
            const updatedConfig = providerManager.getProviderConfig(
              config.id,
            ) as ApiKeyProviderConfig;
            if (updatedConfig) {
              populateApiKeyPanel(doc, updatedConfig);
            }
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

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  const currentApiKeyIndex = getCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
  );

  // Get endpoints from window storage
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  // Update current endpoint with model selection
  if (endpoints.length > 0 && currentEndpointIndex < endpoints.length) {
    endpoints = endpoints.map((ep, idx) =>
      idx === currentEndpointIndex
        ? {
            ...ep,
            defaultModel: modelSelect?.value || ep.defaultModel,
          }
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
    endpoints,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  // Sync model selection to other UI components
  const model = modelSelect?.value;
  if (model) {
    const modelStateManager = getModelStateManager();
    modelStateManager.setModel(model, currentProviderId);
  }
}

/**
 * Add new endpoint
 */
function addNewEndpoint(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const newBaseUrl = addon.data.prefs?.window?.prompt(
    getString("pref-enter-base-url" as any) || "请输入接口地址:",
  );

  // If user cancelled or entered empty string, refresh panel to restore proper selection
  if (!newBaseUrl || !newBaseUrl.trim()) {
    // Refresh panel to restore dropdown to current selection
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Get current endpoints
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  // Check if endpoint already exists
  const exists = endpoints.some(
    (ep) => ep.baseUrl.toLowerCase() === newBaseUrl.trim().toLowerCase(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-endpoint-exists" as any) || "该接口地址已存在",
      true,
    );
    // Restore dropdown selection without refreshing entire panel
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

  // Add new endpoint with empty API keys and models
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

  // Switch to the new endpoint index
  const newIndex = endpoints.length - 1;
  setEndpointsData(win, currentProviderId, endpoints);
  setCurrentIndex(win, currentProviderId, newIndex, providerManager);

  // Update config with new endpoints
  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    baseUrl: newBaseUrl.trim(),
    apiKey: "",
    availableModels: [],
    defaultModel: "",
    currentEndpointIndex: newIndex,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }

  showTestResult(
    doc,
    getString("pref-endpoint-added" as any) ||
      "接口地址已添加，请输入 API 密钥",
    false,
  );
}

/**
 * Edit current endpoint URL
 */
function editEndpoint(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length) {
    return;
  }

  const currentEndpoint = endpoints[currentEndpointIndex];
  const currentUrl = currentEndpoint.baseUrl;

  const newBaseUrl = addon.data.prefs?.window?.prompt(
    getString("pref-edit-base-url" as any) || "修改接口地址:",
    currentUrl,
  );

  // If user cancelled or entered empty string, refresh panel
  if (!newBaseUrl || !newBaseUrl.trim()) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Check if new URL already exists (and it's not the current one)
  const exists = endpoints.some(
    (ep, idx) =>
      idx !== currentEndpointIndex &&
      ep.baseUrl.toLowerCase() === newBaseUrl.trim().toLowerCase(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-endpoint-exists" as any) || "该接口地址已存在",
      true,
    );
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Update endpoint URL
  endpoints = endpoints.map((ep, idx) =>
    idx === currentEndpointIndex ? { ...ep, baseUrl: newBaseUrl.trim() } : ep,
  );

  setEndpointsData(win, currentProviderId, endpoints);

  // Update config
  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    baseUrl: newBaseUrl.trim(),
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }

  showTestResult(
    doc,
    getString("pref-endpoint-edited" as any) || "接口地址已修改",
    false,
  );
}

/**
 * Delete an endpoint
 */
function deleteEndpoint(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  // Get current endpoints
  let endpoints = getEndpointsData(win, currentProviderId) || [];
  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length)
    return;

  // Confirm deletion
  const endpointToDelete = endpoints[currentEndpointIndex];
  const message =
    getString("pref-delete-endpoint-confirm" as any, {
      args: { endpoint: endpointToDelete.baseUrl },
    }) || `确定要删除接口地址 "${endpointToDelete.baseUrl}" 吗？`;
  const confirmed = addon.data.prefs?.window?.confirm(message);

  if (!confirmed) {
    // Refresh panel to restore dropdown selection
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Remove the endpoint
  endpoints = endpoints.filter((_, idx) => idx !== currentEndpointIndex);
  setEndpointsData(win, currentProviderId, endpoints);

  // Calculate new current index
  const newIndex = Math.max(
    0,
    Math.min(currentEndpointIndex, endpoints.length - 1),
  );
  setCurrentIndex(win, currentProviderId, newIndex, providerManager);

  // Get the new current endpoint (may be undefined if no endpoints left)
  const newEndpoint = endpoints[newIndex];

  // Update config
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

  // Sync model to views via ModelStateManager
  const modelStateManager = getModelStateManager();
  if (newDefaultModel) {
    modelStateManager.setModel(newDefaultModel, currentProviderId);
  } else {
    // Clear model selection in views when no model available
    modelStateManager.setModel("", currentProviderId);
  }

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }

  showTestResult(
    doc,
    getString("pref-endpoint-deleted" as any) || "接口地址已删除",
    false,
  );
}

/**
 * Switch to a different endpoint
 */
function switchEndpoint(
  doc: Document,
  currentProviderId: string,
  endpointIndex: number,
): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  // Save current endpoint config first
  saveCurrentProviderConfig(doc, currentProviderId);

  // Get endpoints
  const endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpointIndex < 0 || endpointIndex >= endpoints.length) return;

  // Switch to new endpoint
  setCurrentIndex(win, currentProviderId, endpointIndex, providerManager);
  const endpoint = endpoints[endpointIndex];
  const currentApiKeyIndex = endpoint.currentApiKeyIndex || 0;
  const currentApiKey = endpoint.apiKeys[currentApiKeyIndex]?.key || "";

  // Update config with new endpoint's data
  providerManager.updateProviderConfig(currentProviderId, {
    baseUrl: endpoint.baseUrl,
    apiKey: currentApiKey,
    availableModels: endpoint.availableModels || [],
    defaultModel: endpoint.defaultModel || "",
    currentEndpointIndex: endpointIndex,
  });

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }
}

/**
 * Add new API key to current endpoint
 */
function addNewApiKey(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length) {
    showTestResult(doc, "请先添加接口地址", true);
    return;
  }

  // Prompt for API key name (optional)
  const keyName = addon.data.prefs?.window?.prompt(
    getString("pref-enter-apikey-name" as any) ||
      "请输入 API 密钥名称（可选，留空则显示掩码）:",
  );

  // If user cancelled, refresh panel and return
  if (keyName === null) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  const newApiKey = addon.data.prefs?.window?.prompt(
    getString("pref-enter-apikey" as any) || "请输入 API 密钥:",
  );

  // If user cancelled or entered empty string, refresh panel
  if (!newApiKey || !newApiKey.trim()) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Check if API key already exists in this endpoint
  const currentEndpoint = endpoints[currentEndpointIndex];
  const exists = currentEndpoint.apiKeys.some(
    (k) => k.key === newApiKey.trim(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-apikey-exists" as any) || "该 API 密钥已存在",
      true,
    );
    // Restore dropdown selection without refreshing entire panel
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

  // Add new API key with name
  const newKeyEntry: ApiKeyEntry = {
    key: newApiKey.trim(),
    name: keyName?.trim() || "",
  };

  endpoints = endpoints.map((ep, idx) =>
    idx === currentEndpointIndex
      ? {
          ...ep,
          apiKeys: [...ep.apiKeys, newKeyEntry],
        }
      : ep,
  );

  // Switch to the new API key index
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

  // Update config - enable provider since we now have an API key
  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    apiKey: newApiKey.trim(),
    enabled: true,
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }

  // Auto-fetch models
  autoFetchModels(doc, currentProviderId);
}

/**
 * Edit current API key
 */
function editApiKey(doc: Document, currentProviderId: string): void {
  const win = doc.defaultView;
  if (!win) return;

  const providerManager = getProviderManager();

  const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
  let endpoints = getEndpointsData(win, currentProviderId) || [];

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length) {
    return;
  }

  const currentEndpoint = endpoints[currentEndpointIndex];
  const currentApiKeyIndex = getCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
  );

  if (
    currentEndpoint.apiKeys.length === 0 ||
    currentApiKeyIndex >= currentEndpoint.apiKeys.length
  ) {
    return;
  }

  const currentKeyEntry = currentEndpoint.apiKeys[currentApiKeyIndex];

  // Prompt for new name (optional)
  const newName = addon.data.prefs?.window?.prompt(
    getString("pref-edit-apikey-name" as any) ||
      "修改 API 密钥名称（可选，留空则显示掩码）:",
    currentKeyEntry.name || "",
  );

  // If user cancelled, refresh panel
  if (newName === null) {
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Prompt for new API key value
  const newApiKey = addon.data.prefs?.window?.prompt(
    getString("pref-edit-apikey" as any) || "修改 API 密钥:",
    currentKeyEntry.key,
  );

  // If user cancelled or entered empty string, refresh panel
  if (!newApiKey || !newApiKey.trim()) {
    // Still update name if provided
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

      const updates: Partial<ApiKeyProviderConfig> = {
        endpoints,
      };
      providerManager.updateProviderConfig(currentProviderId, updates);
    }

    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Check if new key already exists (and it's not the current one)
  const exists = currentEndpoint.apiKeys.some(
    (k, idx) => idx !== currentApiKeyIndex && k.key === newApiKey.trim(),
  );

  if (exists) {
    showTestResult(
      doc,
      getString("pref-apikey-exists" as any) || "该 API 密钥已存在",
      true,
    );
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Update API key and name
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

  // Update config
  const updates: Partial<ApiKeyProviderConfig> = {
    endpoints,
    apiKey: newApiKey.trim(),
  };

  providerManager.updateProviderConfig(currentProviderId, updates);

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }

  showTestResult(
    doc,
    getString("pref-apikey-edited" as any) || "API 密钥已修改",
    false,
  );
}

/**
 * Delete current API key from current endpoint
 */
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
  ) {
    return;
  }

  // Confirm deletion
  const keyToDelete = currentEndpoint.apiKeys[currentApiKeyIndex];
  const displayName = keyToDelete.name || maskApiKey(keyToDelete.key);
  const message =
    getString("pref-delete-apikey-confirm" as any, {
      args: { key: displayName },
    }) || `确定要删除 API 密钥 "${displayName}" 吗？`;
  const confirmed = addon.data.prefs?.window?.confirm(message);

  if (!confirmed) {
    // Refresh panel to restore dropdown selection
    const config = providerManager.getProviderConfig(
      currentProviderId,
    ) as ApiKeyProviderConfig;
    if (config) {
      populateApiKeyPanel(doc, config);
    }
    return;
  }

  // Remove the API key
  const newApiKeys = currentEndpoint.apiKeys.filter(
    (_, idx) => idx !== currentApiKeyIndex,
  );

  // Calculate new current API key index
  const newApiKeyIndex = Math.max(
    0,
    Math.min(currentApiKeyIndex, newApiKeys.length - 1),
  );

  endpoints = endpoints.map((ep, idx) =>
    idx === currentEndpointIndex
      ? {
          ...ep,
          apiKeys: newApiKeys,
          currentApiKeyIndex: newApiKeyIndex,
        }
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

  // Update config
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

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }

  showTestResult(
    doc,
    getString("pref-apikey-deleted" as any) || "API 密钥已删除",
    false,
  );
}

/**
 * Switch to a different API key
 */
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

  if (endpoints.length === 0 || currentEndpointIndex >= endpoints.length) {
    return;
  }

  const currentEndpoint = endpoints[currentEndpointIndex];

  if (apiKeyIndex < 0 || apiKeyIndex >= currentEndpoint.apiKeys.length) {
    return;
  }

  // Save current config first
  saveCurrentProviderConfig(doc, currentProviderId);

  // Switch to new API key
  setCurrentApiKeyIndex(
    win,
    currentProviderId,
    currentEndpointIndex,
    apiKeyIndex,
    endpoints,
    providerManager,
  );
  const newApiKey = currentEndpoint.apiKeys[apiKeyIndex].key;

  // Update config with new API key
  providerManager.updateProviderConfig(currentProviderId, {
    apiKey: newApiKey,
  });

  // Refresh panel
  const updatedConfig = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (updatedConfig) {
    populateApiKeyPanel(doc, updatedConfig);
  }
}

/**
 * Auto-fetch models from provider API after API key is entered
 */
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

  // Get current API key from UI to ensure we fetch with the selected key
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

  // Update provider with current API key before fetching
  provider.updateConfig({
    apiKey: currentApiKey,
    baseUrl: currentEndpoint?.baseUrl,
  });

  try {
    showTestResult(doc, getString("pref-fetching-models"), false);
    const models = await provider.getAvailableModels();

    const currentEndpointIndex = getCurrentIndex(win, currentProviderId);
    let endpoints = getEndpointsData(win, currentProviderId) || [];

    if (endpoints.length > 0 && currentEndpointIndex < endpoints.length) {
      // Update current endpoint with fetched models
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

      // Update config
      providerManager.updateProviderConfig(currentProviderId, {
        endpoints,
        availableModels: models,
        defaultModel:
          endpoints[currentEndpointIndex]?.defaultModel || models[0] || "",
      });

      // Refresh panel
      const updatedConfig = providerManager.getProviderConfig(
        currentProviderId,
      ) as ApiKeyProviderConfig;
      if (updatedConfig) {
        populateApiKeyPanel(doc, updatedConfig);
      }

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

  // Base URL (Endpoint) dropdown
  const baseurlSelect = doc.getElementById(
    "pref-provider-baseurl",
  ) as unknown as XULMenuListElement;
  baseurlSelect?.addEventListener("command", () => {
    const selectedValue = baseurlSelect.value;
    const currentProviderId = getCurrentProviderId();

    if (selectedValue === "__add_new__") {
      // Add new endpoint
      addNewEndpoint(doc, currentProviderId);
    } else if (selectedValue === "__edit_endpoint__") {
      // Edit current endpoint
      editEndpoint(doc, currentProviderId);
    } else if (selectedValue === "__delete__") {
      // Delete current endpoint
      deleteEndpoint(doc, currentProviderId);
    } else {
      // Switch to existing endpoint
      const index = parseInt(selectedValue, 10);
      if (!isNaN(index)) {
        switchEndpoint(doc, currentProviderId, index);
      }
    }
  });

  // API Key dropdown
  const apikeySelect = doc.getElementById(
    "pref-provider-apikey",
  ) as unknown as XULMenuListElement;
  apikeySelect?.addEventListener("command", () => {
    const selectedValue = apikeySelect.value;
    const currentProviderId = getCurrentProviderId();

    if (selectedValue === "__add_apikey__") {
      // Add new API key
      addNewApiKey(doc, currentProviderId);
    } else if (selectedValue === "__edit_apikey__") {
      // Edit current API key
      editApiKey(doc, currentProviderId);
    } else if (selectedValue === "__delete_apikey__") {
      // Delete current API key
      deleteApiKey(doc, currentProviderId);
    } else {
      // Switch to existing API key
      const index = parseInt(selectedValue, 10);
      if (!isNaN(index)) {
        switchApiKey(doc, currentProviderId, index);
      }
    }
  });

  // Toggle API key visibility
  const toggleKeyBtn = doc.getElementById("pref-toggle-apikey");
  toggleKeyBtn?.addEventListener("click", () => {
    // Toggle between masked and unmasked display
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

    // Show the actual key in a prompt/dialog
    addon.data.prefs?.window?.alert(`API Key: ${currentKey.key}`);
  });

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
    const win = doc.defaultView;
    if (!win) return;

    const currentProviderId = getCurrentProviderId();
    const provider = providerManager.getProvider(currentProviderId);
    if (!provider || !provider.isReady()) {
      showTestResult(doc, getString("pref-provider-not-ready"), true);
      return;
    }

    // Get current API key from UI to ensure we test with the selected key
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

    // Update provider with current API key before testing
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
    } catch (e) {
      showTestResult(doc, getString("pref-test-failed"), true);
    }
  });

  // Add custom model button
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
        // Add model to current endpoint
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

          // Update config
          providerManager.updateProviderConfig(currentProviderId, {
            endpoints,
            availableModels:
              endpoints[currentEndpointIndex]?.availableModels || [],
          });
        }

        // Refresh panel
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
