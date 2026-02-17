/**
 * PreferencesManager - Main preferences coordination
 */

import { getProviderManager, getModelStateManager } from "../providers";
import { loadCachedRatios } from "./ModelsFetcher";
import {
  bindApiKeyEvents,
  populateApiKeyPanel,
  saveCurrentProviderConfig,
} from "./ApiKeyProviderUI";
import { getString } from "../../utils/locale";
import { prefColors } from "../../utils/colors";
import { clearElement, showTestResult } from "./utils";
import type {
  ApiKeyProviderConfig,
  ProviderConfig,
} from "../../types/provider";

let currentProviderId: string = "openai";
let modelChangeUnsubscribe: (() => void) | null = null;

export function getCurrentProviderId(): string {
  return currentProviderId;
}

export function setCurrentProviderId(id: string): void {
  currentProviderId = id;
}

export async function initializePrefsUI(): Promise<void> {
  if (addon.data.prefs?.window == undefined) return;

  const doc = addon.data.prefs.window.document;
  const providerManager = getProviderManager();

  loadCachedRatios();

  currentProviderId = providerManager.getActiveProviderId();

  populateActiveProviderDropdown(doc);

  const config = providerManager.getProviderConfig(
    currentProviderId,
  ) as ApiKeyProviderConfig;
  if (config) {
    const metadata = providerManager.getProviderMetadata(currentProviderId);
    populateApiKeyPanel(doc, config, metadata);
  }

  setupModelChangeListener(doc);
}

function setupModelChangeListener(doc: Document): void {
  if (modelChangeUnsubscribe) {
    modelChangeUnsubscribe();
    modelChangeUnsubscribe = null;
  }

  const modelStateManager = getModelStateManager();
  modelChangeUnsubscribe = modelStateManager.onModelChange(
    (model: string, providerId: string) => {
      const modelSelect = doc.getElementById(
        "pref-provider-model",
      ) as unknown as XULMenuListElement;

      if (modelSelect && model && providerId === currentProviderId) {
        modelSelect.value = model;
      }

      ztoolkit.log(
        `[PreferencesManager] Model changed to: ${providerId}/${model}`,
      );
    },
  );
}

export function cleanupPrefsUI(): void {
  if (modelChangeUnsubscribe) {
    modelChangeUnsubscribe();
    modelChangeUnsubscribe = null;
  }
}

export function bindPrefEvents(): void {
  if (!addon.data.prefs?.window) return;

  const doc = addon.data.prefs.window.document;

  bindActiveProviderSelect(doc);
  bindApiKeyEvents(doc, getCurrentProviderId);
}

function populateActiveProviderDropdown(doc: Document): void {
  const providerManager = getProviderManager();
  const configs = providerManager.getAllConfigs();
  const popup = doc.getElementById("pref-active-provider-popup");
  const select = doc.getElementById(
    "pref-active-provider-select",
  ) as unknown as XULMenuListElement;

  if (!popup || !select) return;

  clearElement(popup);

  const builtinConfigs = configs.filter((c) => c.isBuiltin);
  const customConfigs = configs.filter((c) => !c.isBuiltin);

  if (builtinConfigs.length > 0) {
    const builtinHeader = doc.createXULElement("menuitem");
    builtinHeader.setAttribute("label", getString("pref-builtin-providers"));
    builtinHeader.setAttribute("disabled", "true");
    builtinHeader.setAttribute(
      "style",
      "font-weight: bold; color: #666; font-size: 11px;",
    );
    popup.appendChild(builtinHeader);

    builtinConfigs.forEach((config) => {
      const menuitem = doc.createXULElement("menuitem");
      menuitem.setAttribute("label", config.name);
      menuitem.setAttribute("value", config.id);
      popup.appendChild(menuitem);
    });
  }

  if (customConfigs.length > 0) {
    const separator1 = doc.createXULElement("menuseparator");
    popup.appendChild(separator1);

    const customHeader = doc.createXULElement("menuitem");
    customHeader.setAttribute("label", getString("pref-custom-providers"));
    customHeader.setAttribute("disabled", "true");
    customHeader.setAttribute(
      "style",
      "font-weight: bold; color: #666; font-size: 11px;",
    );
    popup.appendChild(customHeader);

    const openaiCompatibleConfigs = customConfigs.filter(
      (c) => c.type === "openai-compatible",
    );

    if (openaiCompatibleConfigs.length > 0) {
      openaiCompatibleConfigs.forEach((config) => {
        const menuitem = doc.createXULElement("menuitem");
        const typeLabel = getString("pref-openai-compatible");
        menuitem.setAttribute("label", `${config.name} - ${typeLabel}`);
        menuitem.setAttribute("value", config.id);
        popup.appendChild(menuitem);
      });
    }
  }

  const separator2 = doc.createXULElement("menuseparator");
  popup.appendChild(separator2);

  const addOpenAIItem = doc.createXULElement("menuitem");
  addOpenAIItem.setAttribute(
    "label",
    getString("pref-add-openai-endpoint" as any) || "+ Add OpenAI Compatible",
  );
  addOpenAIItem.setAttribute("value", "__add_openai__");
  addOpenAIItem.setAttribute("style", "font-weight: bold; color: #0066cc;");
  popup.appendChild(addOpenAIItem);

  select.value = currentProviderId;

  const currentConfig = configs.find((c) => c.id === currentProviderId);
  if (currentConfig && !currentConfig.isBuiltin) {
    const typeLabel = getString("pref-openai-compatible");
    select.setAttribute("label", `${currentConfig.name} - ${typeLabel}`);
  } else if (currentConfig) {
    select.setAttribute("label", currentConfig.name);
  }
}

function bindActiveProviderSelect(doc: Document): void {
  const providerManager = getProviderManager();
  const select = doc.getElementById(
    "pref-active-provider-select",
  ) as unknown as XULMenuListElement;

  select?.addEventListener("command", () => {
    const selectedValue = select.value;

    if (selectedValue === "__add_openai__") {
      addCustomProvider(doc, "openai-compatible");
      populateActiveProviderDropdown(doc);
      return;
    }

    saveCurrentProviderConfig(doc, currentProviderId);

    currentProviderId = selectedValue;
    providerManager.setActiveProvider(selectedValue);

    const config = providerManager.getProviderConfig(
      selectedValue,
    ) as ApiKeyProviderConfig;
    if (config) {
      if (!config.isBuiltin) {
        const typeLabel = getString("pref-openai-compatible");
        select.setAttribute("label", `${config.name} - ${typeLabel}`);
      } else {
        select.setAttribute("label", config.name);
      }
      const metadata = providerManager.getProviderMetadata(selectedValue);
      populateApiKeyPanel(doc, config, metadata);
    }
  });

  const deleteBtn = doc.getElementById("pref-delete-provider");
  deleteBtn?.addEventListener("click", () => {
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
        currentProviderId = newProviderId;
      }
      populateActiveProviderDropdown(doc);
      const newConfig = providerManager.getProviderConfig(
        currentProviderId,
      ) as ApiKeyProviderConfig;
      if (newConfig) {
        const metadata = providerManager.getProviderMetadata(currentProviderId);
        populateApiKeyPanel(doc, newConfig, metadata);
      }
    }
  });
}

function addCustomProvider(doc: Document, type: "openai-compatible"): void {
  const providerManager = getProviderManager();

  const name = addon.data.prefs?.window?.prompt(
    getString("pref-enter-provider-name" as any) || "Enter provider name:",
  );

  if (!name || !name.trim()) return;

  const id = providerManager.addCustomProvider(name.trim(), type);

  currentProviderId = id;
  providerManager.setActiveProvider(id);

  const config = providerManager.getProviderConfig(id) as ApiKeyProviderConfig;
  if (config) {
    populateApiKeyPanel(doc, config, null);
  }

  showTestResult(
    doc,
    getString("pref-provider-added" as any) ||
      "Provider added. Please configure API key.",
    false,
  );
}
