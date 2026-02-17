import { getString, initLocale } from "./utils/locale";
import {
  registerPrefsScripts,
  unregisterPrefsScripts,
} from "./modules/preferences";
import { createZToolkit } from "./utils/ztoolkit";
import { registerToolbarButton, unregisterChatPanel } from "./modules/ui";
import { destroyProviderManager } from "./modules/providers";
import {
  registerItemTrashHandler,
  unregisterItemTrashHandler,
} from "./modules/chat";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Register preference pane
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    id: "zota-prefpane",
    src: rootURI + "content/preferences.xhtml",
    label: getString("pref-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.svg`,
  });

  // Register item trash handler to clean up chat history when items are deleted
  registerItemTrashHandler();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );

  // Register stylesheet
  const doc = win.document;
  const styles = ztoolkit.UI.createElement(doc, "link", {
    properties: {
      type: "text/css",
      rel: "stylesheet",
      href: `chrome://${addon.data.config.addonRef}/content/zoteroPane.css`,
    },
  });
  doc.documentElement?.appendChild(styles);

  // Register toolbar button for chat panel
  registerToolbarButton();
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  unregisterChatPanel();
  destroyProviderManager();
  unregisterItemTrashHandler();
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * Preference UI events dispatcher
 */
async function onPrefsEvent(type: string, data: { [key: string]: unknown }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window as Window);
      break;
    case "unload":
      unregisterPrefsScripts();
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
