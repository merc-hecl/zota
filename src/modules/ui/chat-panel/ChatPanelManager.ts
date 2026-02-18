/**
 * ChatPanelManager - Main panel lifecycle and coordination
 */

import { config } from "../../../../package.json";
import { getString } from "../../../utils/locale";
import { ChatManager, type ChatMessage, onSessionsDeleted } from "../../chat";

import { getProviderManager, getModelStateManager } from "../../providers";
import { getPref, setPref } from "../../../utils/prefs";

import type { ChatPanelContext } from "./types";
import { chatColors } from "../../../utils/colors";
import {
  getCurrentTheme,
  updateCurrentTheme,
  applyThemeToContainer,
  setupThemeListener,
} from "./ChatPanelTheme";
import { createChatContainer } from "./ChatPanelBuilder";
import { renderMessages as renderMessageElements } from "./MessageRenderer";
import { renderMarkdownToElement } from "./MarkdownRenderer";
import {
  setupEventHandlers,
  updateAttachmentsPreviewDisplay,
  updatePdfCheckboxVisibilityForItem,
  updateQuoteBoxDisplay,
  focusInput,
  setActiveReaderItemFn,
  setTogglePanelModeFn,
  updatePanelModeButtonIcon,
  updateModelSelectorDisplay,
  setCurrentContext,
  triggerHistoryRefresh,
} from "./ChatPanelEvents";
import { getGlobalInputText } from "./InputStateManager";
import {
  getScrollManager,
  removeScrollManager,
  startStreamingScroll,
  stopStreamingScroll,
  scrollToBottom,
} from "./AutoScrollManager";
import {
  getImages,
  addImage,
  removeImage,
  clearImages,
  onImagesChange,
  type ImageData,
} from "./ImageStateManager";
import { updateUnifiedReferenceDisplay } from "./ChatPanelBuilder";
import {
  getDocuments,
  setDocuments,
  removeDocument,
  clearDocuments,
  hasDocuments,
  onDocumentsChange,
} from "./DocumentStateManager";
import {
  setSessionStreamingState,
  setSessionSendingState,
  resetSessionState,
  setActiveSessionId,
  getSessionStreamingState,
  registerView,
  unregisterView,
  setViewSession,
  getViewState,
} from "./StreamingStateManager";

// Track scroll managers for cleanup
const activeScrollManagers = new Set<HTMLElement>();

// View IDs for sidebar and floating
const SIDEBAR_VIEW_ID = "sidebar";
const FLOATING_VIEW_ID = "floating";

/**
 * Get view ID for a container
 */
function getViewIdForContainer(container: HTMLElement): string | null {
  const containerId = container.id;
  const sidebarContainerId = `${config.addonRef}-chat-container`;

  // Check if it's the sidebar container
  const isSidebar =
    containerId === sidebarContainerId || container === chatContainer;
  if (isSidebar) {
    return SIDEBAR_VIEW_ID;
  }

  // Floating container check: either by reference or by window URL
  const isFloatingWindow =
    container.ownerDocument?.defaultView?.location.href.includes(
      "chatWindow.xhtml",
    );
  const isFloatingRef = container === floatingContainer;

  const isFloating = isFloatingWindow || isFloatingRef;
  if (isFloating) {
    return FLOATING_VIEW_ID;
  }

  // Fallback: try to match by checking if container is in main window
  const mainWindow = Zotero.getMainWindow();
  if (mainWindow && mainWindow.document.contains(container)) {
    return SIDEBAR_VIEW_ID;
  }

  return null;
}

/**
 * Get the current active session info for a container
 */
function getContainerSessionInfo(
  container: HTMLElement,
): { itemId: number; sessionId: string } | null {
  const viewId = getViewIdForContainer(container);
  if (!viewId) return null;

  const view = getViewState(viewId);
  if (!view) return null;

  return {
    itemId: view.currentItemId,
    sessionId: view.currentSessionId,
  };
}

/**
 * Set the active session for a container (used when switching sessions)
 */
export function setContainerActiveSession(
  container: HTMLElement,
  itemId: number,
  sessionId: string,
): void {
  const viewId = getViewIdForContainer(container);
  if (!viewId) {
    ztoolkit.log(
      "[setContainerActiveSession] Could not identify container type",
      "containerId:",
      container.id,
    );
    return;
  }

  setViewSession(viewId, itemId, sessionId);
  ztoolkit.log(
    "[setContainerActiveSession] Updated view",
    viewId,
    "to session:",
    sessionId,
  );
}

/**
 * Update send button state for a specific container based on its active session
 */
export function updateSendButtonStateForContainer(
  container: HTMLElement,
): void {
  const sessionInfo = getContainerSessionInfo(container);
  const sendButton = container.querySelector(
    "#chat-send-button",
  ) as HTMLButtonElement;

  if (!sendButton) {
    ztoolkit.log("[updateSendButtonStateForContainer] Send button not found");
    return;
  }

  if (!sessionInfo || !sessionInfo.sessionId) {
    // No active session, button should be enabled
    sendButton.disabled = false;
    sendButton.style.opacity = "1";
    sendButton.style.cursor = "pointer";
    ztoolkit.log(
      "[updateSendButtonStateForContainer] No session, enabling button",
    );
    return;
  }

  const { itemId, sessionId } = sessionInfo;
  const state = getSessionStreamingState(itemId, sessionId);
  const shouldDisable = state.isStreaming || state.isSending;

  sendButton.disabled = shouldDisable;
  sendButton.style.opacity = shouldDisable ? "0.5" : "1";
  sendButton.style.cursor = shouldDisable ? "not-allowed" : "pointer";

  ztoolkit.log(
    "[updateSendButtonStateForContainer] itemId:",
    itemId,
    "sessionId:",
    sessionId,
    "isStreaming:",
    state.isStreaming,
    "isSending:",
    state.isSending,
    "disabled:",
    shouldDisable,
  );
}

/**
 * Update send button state in all active containers
 */
function updateSendButtonStateInAllContainers(): void {
  if (chatContainer?.isConnected) {
    updateSendButtonStateForContainer(chatContainer);
  }
  if (floatingContainer?.isConnected) {
    updateSendButtonStateForContainer(floatingContainer);
  }
}

/**
 * Set the sending state for a container's active session
 */
export function setIsSendingMessageForContainer(
  container: HTMLElement,
  isSending: boolean,
): void {
  const sessionInfo = getContainerSessionInfo(container);
  if (sessionInfo) {
    setSessionSendingState(
      sessionInfo.itemId,
      sessionInfo.sessionId,
      isSending,
    );
  }
}

/**
 * Legacy function - deprecated, use setIsSendingMessageForContainer instead
 */
export function setIsSendingMessage(value: boolean): void {
  // This is a legacy function that updates all containers
  // For backward compatibility, we update the current active container
  if (chatContainer?.isConnected) {
    setIsSendingMessageForContainer(chatContainer, value);
  }
  if (floatingContainer?.isConnected) {
    setIsSendingMessageForContainer(floatingContainer, value);
  }
}

/**
 * Legacy function - check if any session is streaming (for backward compatibility)
 */
export function getIsGloballyStreaming(): boolean {
  // Check sidebar view
  const sidebarView = getViewState(SIDEBAR_VIEW_ID);
  if (sidebarView?.currentSessionId) {
    const state = getSessionStreamingState(
      sidebarView.currentItemId,
      sidebarView.currentSessionId,
    );
    if (state.isStreaming) return true;
  }
  // Check floating view
  const floatingView = getViewState(FLOATING_VIEW_ID);
  if (floatingView?.currentSessionId) {
    const state = getSessionStreamingState(
      floatingView.currentItemId,
      floatingView.currentSessionId,
    );
    if (state.isStreaming) return true;
  }
  return false;
}

/**
 * Legacy function - check if any session is sending (for backward compatibility)
 */
export function getIsSendingMessage(): boolean {
  // Check sidebar view
  const sidebarView = getViewState(SIDEBAR_VIEW_ID);
  if (sidebarView?.currentSessionId) {
    const state = getSessionStreamingState(
      sidebarView.currentItemId,
      sidebarView.currentSessionId,
    );
    if (state.isSending) return true;
  }
  // Check floating view
  const floatingView = getViewState(FLOATING_VIEW_ID);
  if (floatingView?.currentSessionId) {
    const state = getSessionStreamingState(
      floatingView.currentItemId,
      floatingView.currentSessionId,
    );
    if (state.isSending) return true;
  }
  return false;
}

// Panel display mode: 'sidebar' or 'floating'
export type PanelMode = "sidebar" | "floating";

// Floating window default size
const FLOATING_DEFAULT_WIDTH = 420;
const FLOATING_DEFAULT_HEIGHT = 600;

// Initialize the events module with the getActiveReaderItem function reference
// This is done immediately to avoid issues with early calls
let eventsInitialized = false;

/**
 * Get current active Zotero item from reader
 */
export function getActiveReaderItem(): Zotero.Item | null {
  const mainWindow = Zotero.getMainWindow() as Window & {
    Zotero_Tabs?: { selectedID: string };
  };
  const tabs = mainWindow.Zotero_Tabs;
  if (!tabs) return null;

  const reader = Zotero.Reader.getByTabID(tabs.selectedID);
  if (reader) {
    const itemID = reader.itemID;
    if (itemID) {
      return Zotero.Items.get(itemID) as Zotero.Item;
    }
  }
  return null;
}

// Singleton state
let chatManager: ChatManager | null = null;
let chatContainer: HTMLElement | null = null;
let resizeHandler: (() => void) | null = null;
let sidebarObserver: MutationObserver | null = null;
let tabNotifierID: string | null = null;
let globalTabNotifierID: string | null = null; // Persistent notifier for sidebar sync
let contentInitialized = false;
let moduleCurrentItem: Zotero.Item | null = null;
let themeCleanup: (() => void) | null = null;

// Panel mode state
let currentPanelMode: PanelMode = "sidebar";

// Floating window reference
let floatingWindow: Window | null = null;
let floatingContainer: HTMLElement | null = null;
let floatingContentInitialized = false;
let floatingTabNotifierID: string | null = null;

// Attachment state
let pendingSelectedText: string | null = null;
let pendingSelectedTextDocumentId: number | null = null;
// Flag to track if user manually cancelled the quote
let isQuoteCancelled: boolean = false;

/**
 * Get current panel mode
 */
export function getPanelMode(): PanelMode {
  return currentPanelMode;
}

/**
 * Set panel mode and update display
 */
export function setPanelMode(mode: PanelMode): void {
  if (currentPanelMode === mode) return;

  const wasShown = isPanelShown();
  const previousMode = currentPanelMode;

  currentPanelMode = mode;
  setPref("panelMode", mode);

  if (wasShown) {
    // Close the previous mode's panel
    if (previousMode === "sidebar") {
      hideSidebarPanel();
    } else {
      closeFloatingWindow();
    }

    // Open the new mode's panel
    if (mode === "sidebar") {
      showSidebarPanel();
    } else {
      openFloatingWindow();
    }
  }

  ztoolkit.log(`Panel mode changed to: ${mode}`);
}

/**
 * Toggle panel mode between sidebar and floating
 */
export function togglePanelMode(): void {
  const newMode = currentPanelMode === "sidebar" ? "floating" : "sidebar";
  setPanelMode(newMode);
}

/**
 * Load panel mode from preferences
 */
function loadPanelMode(): void {
  const savedMode = getPref("panelMode") as PanelMode | undefined;
  if (savedMode === "sidebar" || savedMode === "floating") {
    currentPanelMode = savedMode;
  }
}

/**
 * Initialize the events module with function references
 */
function initializeEventsModule(): void {
  if (!eventsInitialized) {
    setActiveReaderItemFn(getActiveReaderItem);
    setTogglePanelModeFn(togglePanelMode);
    eventsInitialized = true;
  }
}

/**
 * Get or create the ChatManager instance
 */
export function getChatManager(): ChatManager {
  if (!chatManager) {
    chatManager = new ChatManager();
    // Set up text selection callback
    const pdfExtractor = chatManager.getPdfExtractor();
    pdfExtractor.setOnTextSelectedCallback((text, documentId) => {
      handleTextSelected(text, documentId);
    });
  }
  initializeEventsModule();
  return chatManager;
}

/**
 * Handle text selection from PDF
 * Shows unified reference container in all active containers
 */
function handleTextSelected(text: string, documentId: number): void {
  // Store selected text and document ID
  pendingSelectedText = text;
  pendingSelectedTextDocumentId = documentId;
  // Reset cancelled flag when new text is selected
  isQuoteCancelled = false;

  ztoolkit.log(
    "[TextSelection] Text selected from document:",
    documentId,
    "Text length:",
    text.length,
  );

  // Get current images for the document
  const currentImages = getImages(documentId);
  const theme = getCurrentTheme();

  // Create handlers for the unified display
  const handleRemoveImage = (imageId: string) => {
    removeImage(documentId, imageId);
    const newImages = getImages(documentId);
    // Update unified reference display after removal
    const currentChatContainer = chatContainer;
    const currentFloatingContainer = floatingContainer;
    if (currentChatContainer) {
      updateUnifiedReferenceDisplay(
        currentChatContainer,
        {
          textQuote: pendingSelectedText,
          images: newImages,
          onRemoveImage: handleRemoveImage,
          onCloseTextQuote: () => {
            pendingSelectedText = null;
            // Only close entire container if both text and images are empty
            if (newImages.length === 0) {
              updateUnifiedReferenceDisplay(
                currentChatContainer,
                {
                  textQuote: null,
                  images: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                },
                theme,
              );
            }
          },
          onCloseAll: () => {
            pendingSelectedText = null;
            clearImages(documentId);
            updateUnifiedReferenceDisplay(
              currentChatContainer,
              {
                textQuote: null,
                images: [],
                onRemoveImage: () => {},
                onCloseTextQuote: () => {},
                onCloseAll: () => {},
              },
              theme,
            );
          },
        },
        theme,
      );
    }
    if (currentFloatingContainer) {
      updateUnifiedReferenceDisplay(
        currentFloatingContainer,
        {
          textQuote: pendingSelectedText,
          images: newImages,
          onRemoveImage: handleRemoveImage,
          onCloseTextQuote: () => {
            pendingSelectedText = null;
            if (newImages.length === 0) {
              updateUnifiedReferenceDisplay(
                currentFloatingContainer,
                {
                  textQuote: null,
                  images: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                },
                theme,
              );
            }
          },
          onCloseAll: () => {
            pendingSelectedText = null;
            clearImages(documentId);
            updateUnifiedReferenceDisplay(
              currentFloatingContainer,
              {
                textQuote: null,
                images: [],
                onRemoveImage: () => {},
                onCloseTextQuote: () => {},
                onCloseAll: () => {},
              },
              theme,
            );
          },
        },
        theme,
      );
    }
  };

  // Update unified reference container in sidebar container
  const currentChatContainer = chatContainer;
  if (currentChatContainer) {
    updateUnifiedReferenceDisplay(
      currentChatContainer,
      {
        textQuote: text,
        images: currentImages,
        onRemoveImage: handleRemoveImage,
        onCloseTextQuote: () => {
          pendingSelectedText = null;
          // Always refresh display to hide text quote section
          // Get current images (may have changed since text was selected)
          const newImages = getImages(documentId);
          updateUnifiedReferenceDisplay(
            currentChatContainer,
            {
              textQuote: null,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => {},
              onCloseAll: () => {
                pendingSelectedText = null;
                clearImages(documentId);
                updateUnifiedReferenceDisplay(
                  currentChatContainer,
                  {
                    textQuote: null,
                    images: [],
                    onRemoveImage: () => {},
                    onCloseTextQuote: () => {},
                    onCloseAll: () => {},
                  },
                  theme,
                );
              },
            },
            theme,
          );
        },
        onCloseAll: () => {
          pendingSelectedText = null;
          clearImages(documentId);
          updateUnifiedReferenceDisplay(
            currentChatContainer,
            {
              textQuote: null,
              images: [],
              onRemoveImage: () => {},
              onCloseTextQuote: () => {},
              onCloseAll: () => {},
            },
            theme,
          );
        },
      },
      theme,
    );
  }

  // Update unified reference container in floating container
  const currentFloatingContainer = floatingContainer;
  if (currentFloatingContainer) {
    updateUnifiedReferenceDisplay(
      currentFloatingContainer,
      {
        textQuote: text,
        images: currentImages,
        onRemoveImage: handleRemoveImage,
        onCloseTextQuote: () => {
          pendingSelectedText = null;
          // Always refresh display to hide text quote section
          // Get current images (may have changed since text was selected)
          const newImages = getImages(documentId);
          updateUnifiedReferenceDisplay(
            currentFloatingContainer,
            {
              textQuote: null,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => {},
              onCloseAll: () => {
                pendingSelectedText = null;
                clearImages(documentId);
                updateUnifiedReferenceDisplay(
                  currentFloatingContainer,
                  {
                    textQuote: null,
                    images: [],
                    onRemoveImage: () => {},
                    onCloseTextQuote: () => {},
                    onCloseAll: () => {},
                  },
                  theme,
                );
              },
            },
            theme,
          );
        },
        onCloseAll: () => {
          pendingSelectedText = null;
          clearImages(documentId);
          updateUnifiedReferenceDisplay(
            currentFloatingContainer,
            {
              textQuote: null,
              images: [],
              onRemoveImage: () => {},
              onCloseTextQuote: () => {},
              onCloseAll: () => {},
            },
            theme,
          );
        },
      },
      theme,
    );
  }
}

/**
 * Get the current sidebar element based on active tab
 */
function getSidebar(): HTMLElement | null {
  const mainWindow = Zotero.getMainWindow() as Window & {
    Zotero_Tabs?: { selectedType: string };
  };
  const currentTab = mainWindow.Zotero_Tabs?.selectedType;
  const paneName =
    currentTab === "reader" ? "#zotero-context-pane" : "#zotero-item-pane";
  return mainWindow.document.querySelector(paneName) as HTMLElement | null;
}

/**
 * Get the splitter element
 */
function getSplitter(): HTMLElement | null {
  const mainWindow = Zotero.getMainWindow() as Window & {
    Zotero_Tabs?: { selectedType: string };
  };
  const currentTab = mainWindow.Zotero_Tabs?.selectedType;
  const splitterName =
    currentTab === "reader"
      ? "#zotero-context-splitter"
      : "#zotero-items-splitter";
  return mainWindow.document.querySelector(splitterName) as HTMLElement | null;
}

/**
 * Expand the sidebar (set collapsed to false)
 */
function expandSidebar(): void {
  const sidebar = getSidebar();
  if (sidebar?.getAttribute("collapsed") === "true") {
    sidebar.setAttribute("collapsed", "false");
    const splitter = getSplitter();
    if (splitter) {
      splitter.setAttribute("state", "");
    }
  }
}

/**
 * Collapse the sidebar (set collapsed to true)
 */
function collapseSidebar(): void {
  const sidebar = getSidebar();
  if (sidebar && sidebar.getAttribute("collapsed") !== "true") {
    sidebar.setAttribute("collapsed", "true");
    const splitter = getSplitter();
    if (splitter) {
      splitter.setAttribute("state", "collapsed");
    }
  }
}

/**
 * Update sidebar container position
 */
function updateSidebarContainerPosition(): void {
  if (!chatContainer) return;

  const sidebar = getSidebar();
  if (!sidebar) return;

  // Ensure sidebar is visible FIRST before getting dimensions
  expandSidebar();

  // Hide drag bar in sidebar mode
  const dragBar = chatContainer.querySelector("#chat-drag-bar") as HTMLElement;
  if (dragBar) {
    dragBar.style.display = "none";
  }

  // Use requestAnimationFrame to ensure layout is updated after expanding
  const win = Zotero.getMainWindow();
  win.requestAnimationFrame(() => {
    if (!chatContainer || !sidebar) return;

    const rect = sidebar.getBoundingClientRect();
    chatContainer.style.width = `${rect.width}px`;
    chatContainer.style.height = `${rect.height}px`;
    chatContainer.style.left = `${rect.x}px`;
    chatContainer.style.top = `${rect.y}px`;
    chatContainer.style.right = "auto";
    chatContainer.style.bottom = "auto";
    chatContainer.style.borderRadius = "0";
    chatContainer.style.boxShadow = "none";
    chatContainer.style.border = "none";
    chatContainer.style.borderLeft = "1px solid var(--fill-quinary)";
  });
}

/**
 * Update container size based on current panel mode
 */
function updateContainerSize(): void {
  if (currentPanelMode === "sidebar") {
    updateSidebarContainerPosition();
  }
}

/**
 * Load saved floating window bounds from preferences
 */
function loadFloatingWindowBounds(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const mainWindow = Zotero.getMainWindow();

  // Get saved values or use defaults (use Zotero.Prefs directly for new prefs)
  const prefsPrefix = config.prefsPrefix;
  let x = Zotero.Prefs.get(`${prefsPrefix}.floatingWindowX`, true) as
    | number
    | undefined;
  let y = Zotero.Prefs.get(`${prefsPrefix}.floatingWindowY`, true) as
    | number
    | undefined;
  let width = Zotero.Prefs.get(`${prefsPrefix}.floatingWindowWidth`, true) as
    | number
    | undefined;
  let height = Zotero.Prefs.get(`${prefsPrefix}.floatingWindowHeight`, true) as
    | number
    | undefined;

  // Use defaults if not saved
  if (x === undefined || y === undefined) {
    x =
      mainWindow.screenX + (mainWindow.outerWidth - FLOATING_DEFAULT_WIDTH) / 2;
    y =
      mainWindow.screenY +
      (mainWindow.outerHeight - FLOATING_DEFAULT_HEIGHT) / 2;
  }

  // Use default size if not saved
  if (width === undefined || height === undefined) {
    width = FLOATING_DEFAULT_WIDTH;
    height = FLOATING_DEFAULT_HEIGHT;
  }

  return { x, y, width, height };
}

/**
 * Save floating window bounds to preferences
 */
function saveFloatingWindowBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const prefsPrefix = config.prefsPrefix;
  Zotero.Prefs.set(`${prefsPrefix}.floatingWindowX`, x, true);
  Zotero.Prefs.set(`${prefsPrefix}.floatingWindowY`, y, true);
  Zotero.Prefs.set(`${prefsPrefix}.floatingWindowWidth`, width, true);
  Zotero.Prefs.set(`${prefsPrefix}.floatingWindowHeight`, height, true);
}

/**
 * Open floating window
 */
function openFloatingWindow(): void {
  // Close existing floating window if any
  if (floatingWindow && !floatingWindow.closed) {
    floatingWindow.focus();
    return;
  }

  // Save current panel state
  const wasPanelShown = isPanelShown();

  // Reset state before opening new window
  floatingWindow = null;
  floatingContainer = null;
  floatingContentInitialized = false;

  const mainWindow = Zotero.getMainWindow();

  // Load saved window bounds
  const bounds = loadFloatingWindowBounds();

  // Check if window should be always on top
  const isAlwaysOnTop = getPref("keepWindowTop") as boolean;

  // Open new window using openDialog for better control
  floatingWindow = (
    mainWindow as Window & { openDialog: (...args: unknown[]) => Window }
  ).openDialog(
    `chrome://${config.addonRef}/content/chatWindow.xhtml`,
    "zota-chat-window",
    `chrome,dialog=no,resizable=yes,${isAlwaysOnTop ? "alwaysRaised=yes," : ""}width=${bounds.width},height=${bounds.height},left=${bounds.x},top=${bounds.y}`,
  );

  if (!floatingWindow) {
    ztoolkit.log("Failed to open floating window");
    return;
  }

  // Wait for window to load, then initialize content
  floatingWindow.addEventListener("load", () => {
    ztoolkit.log("Floating window load event fired");
    initializeFloatingWindowContent();

    // Setup window resize/move listeners to save bounds
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const saveBounds = () => {
      if (floatingWindow && !floatingWindow.closed) {
        saveFloatingWindowBounds(
          floatingWindow.screenX,
          floatingWindow.screenY,
          floatingWindow.outerWidth,
          floatingWindow.outerHeight,
        );
      }
    };

    // Debounced save to avoid excessive writes
    const debouncedSaveBounds = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(saveBounds, 500);
    };

    floatingWindow?.addEventListener("resize", debouncedSaveBounds);
    floatingWindow?.addEventListener("move", debouncedSaveBounds);

    // Handle window close - only after content is loaded
    floatingWindow?.addEventListener("unload", () => {
      ztoolkit.log("Floating window unload event");

      // Save final bounds before closing
      saveBounds();

      // Check if window is being reopened (for pin toggle)
      // If showPanel will be called soon, don't reset toolbar button state
      const wasPinnedToggle = (floatingWindow as any)?._isPinToggle;

      // Immediately reset state
      floatingWindow = null;
      floatingContainer = null;
      floatingContentInitialized = false;

      // Only update toolbar button if this wasn't a pin toggle
      if (!wasPinnedToggle) {
        updateToolbarButtonState(false);
      }
    });
  });

  ztoolkit.log("Floating window opened");
}

/**
 * Initialize floating window content
 */
function initializeFloatingWindowContent(): void {
  if (!floatingWindow || floatingContentInitialized) {
    return;
  }

  const doc = floatingWindow.document;
  const root = doc.getElementById("chat-window-root");

  if (!root) {
    ztoolkit.log("Chat window root not found");
    return;
  }

  // Initialize theme
  updateCurrentTheme();

  // Create chat container in floating window
  floatingContainer = createChatContainer(doc, getCurrentTheme());

  // Move container into the root (it was appended to documentElement by createChatContainer)
  if (floatingContainer.parentElement) {
    floatingContainer.parentElement.removeChild(floatingContainer);
  }
  root.appendChild(floatingContainer);

  // Style adjustments for floating window
  floatingContainer.style.display = "block";
  floatingContainer.style.position = "relative";
  floatingContainer.style.width = "100%";
  floatingContainer.style.height = "100%";
  floatingContainer.style.borderLeft = "none";
  floatingContainer.style.border = "none";

  // Hide drag bar in floating mode (use window's own title bar)
  const dragBar = floatingContainer.querySelector(
    "#chat-drag-bar",
  ) as HTMLElement;
  if (dragBar) {
    dragBar.style.display = "none";
  }

  // Update mode button icon for floating mode
  updatePanelModeButtonIcon(floatingContainer, currentPanelMode);

  // Initialize chat content
  initializeFloatingChatContent();
  floatingContentInitialized = true;
}

/**
 * Common initialization logic for chat content (shared between sidebar and floating)
 */
async function initializeChatContentCommon(
  container: HTMLElement,
  viewId: string,
): Promise<void> {
  // Register view in state manager
  registerView(viewId, container);
  ztoolkit.log(`[Init] Registered view: ${viewId}`);

  const context = createContext(container, viewId);

  // Initialize scroll manager for this container
  const chatHistory = container.querySelector("#chat-history") as HTMLElement;
  if (chatHistory) {
    getScrollManager(chatHistory);
    activeScrollManagers.add(chatHistory);
  }

  // Set provider change callback
  const providerManager = getProviderManager();
  providerManager.setOnProviderChange(() => {
    // Provider changed, no action needed for user bar (removed)
  });

  // Setup event handlers
  setupEventHandlers(context);

  // Set up chat manager callbacks
  const manager = getChatManager();
  setupChatManagerCallbacks(manager, context, container);

  // Get current item
  const activeItem = getActiveReaderItem();
  if (activeItem) {
    moduleCurrentItem = activeItem;
  }
  if (!moduleCurrentItem) {
    moduleCurrentItem = { id: 0 } as Zotero.Item;
  }

  // Update PDF checkbox visibility
  await context.updatePdfCheckboxVisibility(moduleCurrentItem);

  // Sync unified reference state - show if there's pending selected text or images for current document
  const activeReaderItem = getActiveReaderItem();
  const currentDocId = activeReaderItem?.id ?? null;
  const hasMatchingTextQuote =
    pendingSelectedText &&
    pendingSelectedTextDocumentId !== null &&
    currentDocId === pendingSelectedTextDocumentId;
  const currentImages = currentDocId !== null ? getImages(currentDocId) : [];

  if (hasMatchingTextQuote || currentImages.length > 0) {
    const theme = getCurrentTheme();
    const handleRemoveImage = (imageId: string) => {
      if (currentDocId !== null) {
        removeImage(currentDocId, imageId);
        const newImages = getImages(currentDocId);
        // Update unified reference display after removal
        updateUnifiedReferenceDisplay(
          container,
          {
            textQuote: pendingSelectedText,
            images: newImages,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => {
              pendingSelectedText = null;
              if (newImages.length === 0) {
                updateUnifiedReferenceDisplay(
                  container,
                  {
                    textQuote: null,
                    images: [],
                    onRemoveImage: () => {},
                    onCloseTextQuote: () => {},
                    onCloseAll: () => {},
                  },
                  theme,
                );
              }
            },
            onCloseAll: () => {
              pendingSelectedText = null;
              if (currentDocId !== null) {
                clearImages(currentDocId);
              }
              updateUnifiedReferenceDisplay(
                container,
                {
                  textQuote: null,
                  images: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                },
                theme,
              );
            },
          },
          theme,
        );
      }
    };

    updateUnifiedReferenceDisplay(
      container,
      {
        textQuote: hasMatchingTextQuote ? pendingSelectedText : null,
        images: currentImages,
        onRemoveImage: handleRemoveImage,
        onCloseTextQuote: () => {
          pendingSelectedText = null;
          if (currentImages.length === 0) {
            updateUnifiedReferenceDisplay(
              container,
              {
                textQuote: null,
                images: [],
                onRemoveImage: () => {},
                onCloseTextQuote: () => {},
                onCloseAll: () => {},
              },
              theme,
            );
          }
        },
        onCloseAll: () => {
          pendingSelectedText = null;
          if (currentDocId !== null) {
            clearImages(currentDocId);
          }
          updateUnifiedReferenceDisplay(
            container,
            {
              textQuote: null,
              images: [],
              onRemoveImage: () => {},
              onCloseTextQuote: () => {},
              onCloseAll: () => {},
            },
            theme,
          );
        },
      },
      theme,
    );
  }

  // Load session and render
  const session = await manager.getOrCreateSession(moduleCurrentItem.id);
  manager.setActiveItem(moduleCurrentItem.id);

  // Set view session in state manager
  const containerViewId = getViewIdForContainer(container);
  if (containerViewId) {
    setViewSession(containerViewId, moduleCurrentItem.id, session.id);
  }

  // Set active session in legacy state manager (for backward compatibility)
  setActiveSessionId(moduleCurrentItem.id, session.id);

  // Update send button state based on this session's state
  updateSendButtonStateForContainer(container);

  context.renderMessages(session.messages);

  focusInput(container);

  // Subscribe to document state changes and update unified reference display
  const unsubscribeDocuments = onDocumentsChange(() => {
    const theme = getCurrentTheme();
    const documents = getDocuments();
    const currentImages = currentDocId !== null ? getImages(currentDocId) : [];

    // Update unified reference display with current documents
    updateUnifiedReferenceDisplay(
      container,
      {
        textQuote: pendingSelectedText,
        images: currentImages,
        documents: documents,
        onRemoveImage: () => {},
        onCloseTextQuote: () => {},
        onCloseAll: () => {},
        onRemoveDocument: () => {},
      },
      theme,
    );
  });

  // Store unsubscribe function for cleanup
  (container as any)._unsubscribeDocuments = unsubscribeDocuments;

  // Subscribe to session deletion events to refresh history
  const unsubscribeSessionsDeleted = onSessionsDeleted((deletedItemIds) => {
    ztoolkit.log(
      "[ChatPanelManager] Sessions deleted for items:",
      deletedItemIds,
    );
    // Trigger history refresh in all views
    triggerHistoryRefresh();
  });

  // Store unsubscribe function for cleanup
  (container as any)._unsubscribeSessionsDeleted = unsubscribeSessionsDeleted;
}

/**
 * Refresh chat for current item (works for both sidebar and floating)
 */
async function refreshChatForContainer(container: HTMLElement): Promise<void> {
  const activeItem = getActiveReaderItem();

  // Determine if we're switching to library view (no active reader)
  const isLibraryView = activeItem === null;

  if (activeItem) {
    // Reader view - use the active reader item
    moduleCurrentItem = activeItem;
  } else {
    // Library view - use global chat (itemId = 0)
    // This ensures we show library/global chat when switching from reader to library
    moduleCurrentItem = { id: 0 } as Zotero.Item;
    ztoolkit.log(
      "[refreshChatForContainer] No active reader, switching to library view (itemId = 0)",
    );
  }

  const itemToUse = moduleCurrentItem;
  const manager = getChatManager();

  // Close history dropdown when switching documents
  const historyDropdown = container.querySelector(
    "#chat-history-dropdown",
  ) as HTMLElement;
  if (historyDropdown) {
    historyDropdown.style.display = "none";
  }

  // Update PDF checkbox visibility
  await updatePdfCheckboxVisibilityForItem(container, null, manager);

  // Reset checkbox state
  const attachPdfCheckbox = container.querySelector(
    "#chat-attach-pdf",
  ) as HTMLInputElement;
  if (attachPdfCheckbox) {
    attachPdfCheckbox.checked = false;
  }

  // Load and render session
  // Get the active session for this item, or create a new one if none exists
  const sessionItemId = !itemToUse || itemToUse.id === 0 ? 0 : itemToUse.id;
  let session = await manager.getActiveSession(sessionItemId);
  if (!session) {
    session = await manager.getOrCreateSession(sessionItemId);
  }
  manager.setActiveItem(sessionItemId);

  // Set view session in state manager
  const containerViewId = getViewIdForContainer(container);
  if (containerViewId) {
    setViewSession(containerViewId, sessionItemId, session.id);
  }

  // Set active session in legacy state manager (for backward compatibility)
  setActiveSessionId(sessionItemId, session.id);

  // Update send button state based on this session's state
  updateSendButtonStateForContainer(container);

  const chatHistory = container.querySelector("#chat-history") as HTMLElement;
  const emptyState = container.querySelector(
    "#chat-empty-state",
  ) as HTMLElement;

  // Check if this session is currently streaming
  const sessionState = getSessionStreamingState(sessionItemId, session.id);
  const isSessionStreaming = sessionState.isStreaming;

  if (chatHistory) {
    renderMessageElements(
      chatHistory,
      emptyState,
      session.messages,
      getCurrentTheme(),
      isSessionStreaming,
    );
  }

  const messageInput = container.querySelector(
    "#chat-message-input",
  ) as HTMLTextAreaElement;

  // Sync input text from global state (in case it was changed in another view)
  if (messageInput) {
    const globalText = getGlobalInputText();
    if (messageInput.value !== globalText) {
      messageInput.value = globalText;
      messageInput.style.height = "auto";
      messageInput.style.height =
        Math.min(messageInput.scrollHeight, 140) + "px";
    }
    messageInput.focus();
  }

  // Sync unified reference display from global state
  // This ensures the reference bar is consistent across sidebar and floating views
  const itemId = itemToUse?.id ?? 0;
  const currentImages = getImages(itemId);
  const currentDocuments = getDocuments();
  const hasTextQuote = !!pendingSelectedText;
  const hasImages = currentImages.length > 0;
  const hasDocuments = currentDocuments.length > 0;

  if (hasTextQuote || hasImages || hasDocuments) {
    const theme = getCurrentTheme();
    const handleRemoveImage = (imageId: string) => {
      removeImage(itemId, imageId);
      // Refresh display after removal
      const newImages = getImages(itemId);
      const newDocuments = getDocuments();
      const newHasTextQuote = !!pendingSelectedText;
      if (newHasTextQuote || newImages.length > 0 || newDocuments.length > 0) {
        updateUnifiedReferenceDisplay(
          container,
          {
            textQuote: pendingSelectedText,
            images: newImages,
            documents: newDocuments,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => {
              pendingSelectedText = null;
              const updatedImages = getImages(itemId);
              const updatedDocs = getDocuments();
              if (updatedImages.length > 0 || updatedDocs.length > 0) {
                updateUnifiedReferenceDisplay(
                  container,
                  {
                    textQuote: null,
                    images: updatedImages,
                    documents: updatedDocs,
                    onRemoveImage: handleRemoveImage,
                    onCloseTextQuote: () => {},
                    onCloseAll: () => {
                      pendingSelectedText = null;
                      clearImages(itemId);
                      clearDocuments();
                      updateUnifiedReferenceDisplay(
                        container,
                        {
                          textQuote: null,
                          images: [],
                          documents: [],
                          onRemoveImage: () => {},
                          onCloseTextQuote: () => {},
                          onCloseAll: () => {},
                          onRemoveDocument: () => {},
                        },
                        theme,
                      );
                    },
                    onRemoveDocument: (docId: number) => {
                      removeDocument(docId);
                    },
                  },
                  theme,
                );
              } else {
                updateUnifiedReferenceDisplay(
                  container,
                  {
                    textQuote: null,
                    images: [],
                    documents: [],
                    onRemoveImage: () => {},
                    onCloseTextQuote: () => {},
                    onCloseAll: () => {},
                    onRemoveDocument: () => {},
                  },
                  theme,
                );
              }
            },
            onCloseAll: () => {
              pendingSelectedText = null;
              clearImages(itemId);
              clearDocuments();
              updateUnifiedReferenceDisplay(
                container,
                {
                  textQuote: null,
                  images: [],
                  documents: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                  onRemoveDocument: () => {},
                },
                theme,
              );
            },
            onRemoveDocument: (docId: number) => {
              removeDocument(docId);
            },
          },
          theme,
        );
      } else {
        updateUnifiedReferenceDisplay(
          container,
          {
            textQuote: null,
            images: [],
            documents: [],
            onRemoveImage: () => {},
            onCloseTextQuote: () => {},
            onCloseAll: () => {},
            onRemoveDocument: () => {},
          },
          theme,
        );
      }
    };

    const handleRemoveDocument = (docId: number) => {
      removeDocument(docId);
      const newDocuments = getDocuments();
      const newImages = getImages(itemId);
      const newHasTextQuote = !!pendingSelectedText;
      if (newHasTextQuote || newImages.length > 0 || newDocuments.length > 0) {
        updateUnifiedReferenceDisplay(
          container,
          {
            textQuote: pendingSelectedText,
            images: newImages,
            documents: newDocuments,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => {
              pendingSelectedText = null;
              const updatedImages = getImages(itemId);
              const updatedDocs = getDocuments();
              if (updatedImages.length > 0 || updatedDocs.length > 0) {
                updateUnifiedReferenceDisplay(
                  container,
                  {
                    textQuote: null,
                    images: updatedImages,
                    documents: updatedDocs,
                    onRemoveImage: handleRemoveImage,
                    onCloseTextQuote: () => {},
                    onCloseAll: () => {
                      pendingSelectedText = null;
                      clearImages(itemId);
                      clearDocuments();
                      updateUnifiedReferenceDisplay(
                        container,
                        {
                          textQuote: null,
                          images: [],
                          documents: [],
                          onRemoveImage: () => {},
                          onCloseTextQuote: () => {},
                          onCloseAll: () => {},
                          onRemoveDocument: () => {},
                        },
                        theme,
                      );
                    },
                    onRemoveDocument: handleRemoveDocument,
                  },
                  theme,
                );
              } else {
                updateUnifiedReferenceDisplay(
                  container,
                  {
                    textQuote: null,
                    images: [],
                    documents: [],
                    onRemoveImage: () => {},
                    onCloseTextQuote: () => {},
                    onCloseAll: () => {},
                    onRemoveDocument: () => {},
                  },
                  theme,
                );
              }
            },
            onCloseAll: () => {
              pendingSelectedText = null;
              clearImages(itemId);
              clearDocuments();
              updateUnifiedReferenceDisplay(
                container,
                {
                  textQuote: null,
                  images: [],
                  documents: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                  onRemoveDocument: () => {},
                },
                theme,
              );
            },
            onRemoveDocument: handleRemoveDocument,
          },
          theme,
        );
      } else {
        updateUnifiedReferenceDisplay(
          container,
          {
            textQuote: null,
            images: [],
            documents: [],
            onRemoveImage: () => {},
            onCloseTextQuote: () => {},
            onCloseAll: () => {},
            onRemoveDocument: () => {},
          },
          theme,
        );
      }
    };

    updateUnifiedReferenceDisplay(
      container,
      {
        textQuote: pendingSelectedText,
        images: currentImages,
        documents: currentDocuments,
        onRemoveImage: handleRemoveImage,
        onCloseTextQuote: () => {
          pendingSelectedText = null;
          const newImages = getImages(itemId);
          const newDocs = getDocuments();
          if (newImages.length > 0 || newDocs.length > 0) {
            updateUnifiedReferenceDisplay(
              container,
              {
                textQuote: null,
                images: newImages,
                documents: newDocs,
                onRemoveImage: handleRemoveImage,
                onCloseTextQuote: () => {},
                onCloseAll: () => {
                  pendingSelectedText = null;
                  clearImages(itemId);
                  clearDocuments();
                  updateUnifiedReferenceDisplay(
                    container,
                    {
                      textQuote: null,
                      images: [],
                      documents: [],
                      onRemoveImage: () => {},
                      onCloseTextQuote: () => {},
                      onCloseAll: () => {},
                      onRemoveDocument: () => {},
                    },
                    theme,
                  );
                },
                onRemoveDocument: handleRemoveDocument,
              },
              theme,
            );
          } else {
            updateUnifiedReferenceDisplay(
              container,
              {
                textQuote: null,
                images: [],
                documents: [],
                onRemoveImage: () => {},
                onCloseTextQuote: () => {},
                onCloseAll: () => {},
                onRemoveDocument: () => {},
              },
              theme,
            );
          }
        },
        onCloseAll: () => {
          pendingSelectedText = null;
          clearImages(itemId);
          clearDocuments();
          updateUnifiedReferenceDisplay(
            container,
            {
              textQuote: null,
              images: [],
              documents: [],
              onRemoveImage: () => {},
              onCloseTextQuote: () => {},
              onCloseAll: () => {},
              onRemoveDocument: () => {},
            },
            theme,
          );
        },
        onRemoveDocument: handleRemoveDocument,
      },
      theme,
    );
  } else {
    // No references, ensure reference container is hidden
    const theme = getCurrentTheme();
    updateUnifiedReferenceDisplay(
      container,
      {
        textQuote: null,
        images: [],
        documents: [],
        onRemoveImage: () => {},
        onCloseTextQuote: () => {},
        onCloseAll: () => {},
        onRemoveDocument: () => {},
      },
      theme,
    );
  }
}

/**
 * Initialize chat content for floating window
 */
async function initializeFloatingChatContent(): Promise<void> {
  if (!floatingContainer) return;

  // Add tab notifier for floating window
  if (!floatingTabNotifierID) {
    floatingTabNotifierID = Zotero.Notifier.registerObserver(
      {
        notify: async () => {
          // Check if document changed - clear unified reference if so
          const activeReaderItem = getActiveReaderItem();
          const currentDocId = activeReaderItem?.id ?? null;
          if (
            pendingSelectedTextDocumentId !== null &&
            currentDocId !== pendingSelectedTextDocumentId
          ) {
            ztoolkit.log(
              "[DocumentSwitch] Document changed from",
              pendingSelectedTextDocumentId,
              "to",
              currentDocId,
              "- clearing unified reference (floating)",
            );
            pendingSelectedText = null;
            pendingSelectedTextDocumentId = null;
            // Clear unified reference display in both containers
            const theme = getCurrentTheme();
            if (floatingContainer) {
              updateUnifiedReferenceDisplay(
                floatingContainer,
                {
                  textQuote: null,
                  images: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                },
                theme,
              );
            }
            if (chatContainer) {
              updateUnifiedReferenceDisplay(
                chatContainer,
                {
                  textQuote: null,
                  images: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                },
                theme,
              );
            }
          }
          if (floatingContainer) {
            await refreshChatForContainer(floatingContainer);
          }
        },
      },
      ["tab"],
      `${config.addonRef}-floating-tab-notifier`,
    );
  }

  await initializeChatContentCommon(floatingContainer, FLOATING_VIEW_ID);
}

/**
 * Close floating window
 */
function closeFloatingWindow(): void {
  // Unregister tab notifier
  if (floatingTabNotifierID) {
    Zotero.Notifier.unregisterObserver(floatingTabNotifierID);
    floatingTabNotifierID = null;
  }

  // Unsubscribe from model changes
  if (floatingContainer) {
    const unsubscribe = (floatingContainer as any)._unsubscribeModelChange;
    if (unsubscribe) {
      unsubscribe();
      (floatingContainer as any)._unsubscribeModelChange = null;
    }

    // Unsubscribe from document changes
    const unsubscribeDocuments = (floatingContainer as any)
      ._unsubscribeDocuments;
    if (unsubscribeDocuments) {
      unsubscribeDocuments();
      (floatingContainer as any)._unsubscribeDocuments = null;
    }
  }

  if (floatingWindow && !floatingWindow.closed) {
    floatingWindow.close();
  }
  floatingWindow = null;
  floatingContainer = null;
  floatingContentInitialized = false;
}

/**
 * Show sidebar panel
 */
function showSidebarPanel(): void {
  const doc = Zotero.getMainWindow().document;
  const win = Zotero.getMainWindow();

  // Create container if not exists
  if (!chatContainer || !chatContainer.isConnected) {
    if (chatContainer) {
      chatContainer = null;
    }
    chatContainer = createChatContainer(doc, getCurrentTheme());
    contentInitialized = false;
  }

  // Update position
  updateSidebarContainerPosition();

  // Update mode button icon
  updatePanelModeButtonIcon(chatContainer, currentPanelMode);

  // Add resize listener
  if (!resizeHandler) {
    resizeHandler = () => updateContainerSize();
    win.addEventListener("resize", resizeHandler);
  }

  // Add theme change listener
  if (!themeCleanup) {
    themeCleanup = setupThemeListener(() => {
      if (chatContainer) {
        applyThemeToContainer(chatContainer);
      }
      if (floatingContainer) {
        applyThemeToContainer(floatingContainer);
      }
    });

    // Delay re-detecting theme because window may not have fully applied dark mode at startup
    // Use multiple checks to ensure theme is correctly applied
    const reapplyTheme = () => {
      updateCurrentTheme();
      if (chatContainer) {
        applyThemeToContainer(chatContainer);
      }
      if (floatingContainer) {
        applyThemeToContainer(floatingContainer);
      }
    };
    // Multiple delayed checks to ensure theme is correctly applied after window fully loads
    setTimeout(reapplyTheme, 0);
    setTimeout(reapplyTheme, 100);
    setTimeout(reapplyTheme, 500);
  }

  // Add sidebar observer
  const mainWin = win as unknown as {
    MutationObserver?: typeof MutationObserver;
  };
  const MutationObserverClass = mainWin.MutationObserver;
  const sidebar = getSidebar();
  if (!sidebarObserver && MutationObserverClass && sidebar) {
    sidebarObserver = new MutationObserverClass(() => updateContainerSize());
    sidebarObserver.observe(sidebar, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }

  // Add tab notifier
  if (!tabNotifierID) {
    tabNotifierID = Zotero.Notifier.registerObserver(
      {
        notify: () => {
          updateContainerSize();
          // Check if document changed - clear unified reference if so
          const activeReaderItem = getActiveReaderItem();
          const currentDocId = activeReaderItem?.id ?? null;
          if (
            pendingSelectedTextDocumentId !== null &&
            currentDocId !== pendingSelectedTextDocumentId
          ) {
            ztoolkit.log(
              "[DocumentSwitch] Document changed from",
              pendingSelectedTextDocumentId,
              "to",
              currentDocId,
              "- clearing unified reference",
            );
            pendingSelectedText = null;
            pendingSelectedTextDocumentId = null;
            // Clear unified reference display
            const theme = getCurrentTheme();
            if (chatContainer) {
              updateUnifiedReferenceDisplay(
                chatContainer,
                {
                  textQuote: null,
                  images: [],
                  onRemoveImage: () => {},
                  onCloseTextQuote: () => {},
                  onCloseAll: () => {},
                },
                theme,
              );
            }
          }
          if (chatContainer?.style.display !== "none") {
            refreshChatForCurrentItem();
          }
        },
      },
      ["tab"],
      `${config.addonRef}-chat-panel-tab-notifier`,
    );
  }

  chatContainer.style.display = "block";

  // Update toolbar button state
  updateToolbarButtonState(true);

  // Initialize chat content only once
  if (!contentInitialized) {
    initializeChatContent();
    contentInitialized = true;
  } else {
    refreshChatForCurrentItem();
    // Re-subscribe to model changes since we unsubscribed when hiding
    setupModelChangeSubscription(chatContainer);
    // Re-setup chat manager callbacks to ensure correct container reference
    const manager = getChatManager();
    const context = createContext(chatContainer, SIDEBAR_VIEW_ID);
    setupChatManagerCallbacks(manager, context, chatContainer);
  }

  ztoolkit.log("Sidebar panel shown");
}

/**
 * Hide sidebar panel
 */
function hideSidebarPanel(): void {
  if (chatContainer) {
    chatContainer.style.display = "none";

    // Unsubscribe from model changes
    const unsubscribe = (chatContainer as any)._unsubscribeModelChange;
    if (unsubscribe) {
      unsubscribe();
      (chatContainer as any)._unsubscribeModelChange = null;
    }

    // Unsubscribe from document changes
    const unsubscribeDocuments = (chatContainer as any)._unsubscribeDocuments;
    if (unsubscribeDocuments) {
      unsubscribeDocuments();
      (chatContainer as any)._unsubscribeDocuments = null;
    }
  }

  collapseSidebar();

  // Clean up listeners
  if (resizeHandler) {
    Zotero.getMainWindow().removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  if (sidebarObserver) {
    sidebarObserver.disconnect();
    sidebarObserver = null;
  }

  if (tabNotifierID) {
    Zotero.Notifier.unregisterObserver(tabNotifierID);
    tabNotifierID = null;
  }

  ztoolkit.log("Sidebar panel hidden");
}

/**
 * Setup chat manager callbacks - handles both sidebar and floating window
 */
function setupChatManagerCallbacks(
  manager: ChatManager,
  context: ChatPanelContext,
  container: HTMLElement,
): void {
  // Determine which containers are active
  const getActiveContainers = () => {
    const containers: HTMLElement[] = [];
    if (chatContainer?.isConnected) {
      containers.push(chatContainer);
    }
    if (floatingContainer?.isConnected) {
      containers.push(floatingContainer);
    }
    // If neither is connected, use the passed container
    if (containers.length === 0) {
      containers.push(container);
    }
    return containers;
  };

  // Helper to get chat history from a container
  const getChatHistory = (cont: HTMLElement) =>
    cont.querySelector("#chat-history") as HTMLElement;

  // Helper to update streaming content in a container
  const updateStreamingContent = async (
    cont: HTMLElement,
    content: string,
    itemId: number,
    sessionId: string,
  ) => {
    // First, verify this container is still viewing the correct session
    const sessionInfo = getContainerSessionInfo(cont);
    if (
      !sessionInfo ||
      sessionInfo.itemId !== itemId ||
      sessionInfo.sessionId !== sessionId
    ) {
      return;
    }

    const streamingEl = cont.querySelector("#chat-streaming-content");
    if (streamingEl) {
      renderMarkdownToElement(streamingEl as HTMLElement, content);
    } else {
      // Streaming element not found - need to re-render messages
      // This can happen when switching sessions during streaming
      ztoolkit.log(
        "[updateStreamingContent] Streaming element not found, re-rendering messages for session:",
        sessionId,
      );

      const chatHistory = getChatHistory(cont);
      const emptyState = cont.querySelector("#chat-empty-state") as HTMLElement;

      if (chatHistory) {
        // Try memory cache first, then load from storage
        let session = manager.getSession(itemId, sessionId);
        if (!session) {
          // Load from storage if not in memory cache
          session = await manager.loadSession(itemId, sessionId);
        }

        if (session) {
          // Check if there's an empty assistant message at the end
          const lastMessage = session.messages[session.messages.length - 1];
          const hasEmptyAssistantMessage =
            lastMessage?.role === "assistant" &&
            (!lastMessage.content || lastMessage.content === "");

          // Should show streaming if there's content or empty assistant message
          const shouldShowStreaming =
            content.length > 0 || hasEmptyAssistantMessage;

          renderMessageElements(
            chatHistory,
            emptyState,
            session.messages,
            getCurrentTheme(),
            shouldShowStreaming,
          );

          // Now try to update the streaming content again
          const newStreamingEl = cont.querySelector("#chat-streaming-content");
          if (newStreamingEl) {
            renderMarkdownToElement(newStreamingEl as HTMLElement, content);
          }
        }
      }
    }
  };

  // Helper to scroll during streaming - uses global streaming state
  const scrollDuringStreaming = (cont: HTMLElement) => {
    const chatHistory = getChatHistory(cont);
    if (!chatHistory) return;

    const scrollManager = getScrollManager(chatHistory);
    if (!scrollManager) return;

    // Ensure streaming mode is active for this container
    if (!scrollManager.getStreaming()) {
      scrollManager.startStreaming();
    }

    // Check if user is near bottom (within 150px)
    const { scrollTop, scrollHeight, clientHeight } = chatHistory;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom <= 150;

    // Only auto-scroll if we're in streaming mode and user hasn't scrolled away
    if (isNearBottom) {
      chatHistory.scrollTop = scrollHeight;
    }
  };

  manager.setCallbacks({
    onMessageUpdate: (itemId, messages, sessionId) => {
      ztoolkit.log(
        "onMessageUpdate callback fired, itemId:",
        itemId,
        "sessionId:",
        sessionId,
        "moduleCurrentItem:",
        moduleCurrentItem?.id,
      );

      // Update containers that are viewing this specific session
      const containers = getActiveContainers();
      containers.forEach((cont) => {
        const sessionInfo = getContainerSessionInfo(cont);
        // Only update if both itemId AND sessionId match
        if (
          sessionInfo &&
          sessionInfo.itemId === itemId &&
          sessionInfo.sessionId === sessionId
        ) {
          const chatHistory = getChatHistory(cont);
          const emptyState = cont.querySelector(
            "#chat-empty-state",
          ) as HTMLElement;
          if (chatHistory) {
            // Check if this specific session is streaming
            const state = getSessionStreamingState(
              itemId,
              sessionInfo.sessionId,
            );

            // Also check if there's an empty assistant message at the end
            // This indicates we're waiting for AI response
            const lastMessage = messages[messages.length - 1];
            const hasEmptyAssistantMessage =
              lastMessage?.role === "assistant" &&
              (!lastMessage.content || lastMessage.content === "");

            // Should show streaming UI if:
            // 1. State says we're streaming, OR
            // 2. There's an empty assistant message (waiting for response)
            const shouldShowStreaming =
              state.isStreaming || hasEmptyAssistantMessage;

            ztoolkit.log(
              "[onMessageUpdate] Container:",
              cont.id || "floating",
              "sessionId:",
              sessionInfo.sessionId,
              "isStreaming:",
              state.isStreaming,
              "hasEmptyAssistant:",
              hasEmptyAssistantMessage,
              "shouldShowStreaming:",
              shouldShowStreaming,
            );

            renderMessageElements(
              chatHistory,
              emptyState,
              messages,
              getCurrentTheme(),
              shouldShowStreaming,
            );

            // Scroll to bottom after rendering (not during streaming)
            const scrollManager = getScrollManager(chatHistory);
            if (scrollManager && !scrollManager.isAutoScrolling()) {
              scrollToBottom(chatHistory, true);
            }
          }
        }
      });
    },
    onStreamingUpdate: async (itemId, content, sessionId) => {
      // Set streaming state for this specific session
      if (sessionId) {
        setSessionStreamingState(itemId, sessionId, true);
        setSessionSendingState(itemId, sessionId, false);
      }

      // Update containers that are viewing this specific session
      const containers = getActiveContainers();
      for (const cont of containers) {
        const sessionInfo = getContainerSessionInfo(cont);
        if (
          sessionInfo &&
          sessionInfo.itemId === itemId &&
          sessionInfo.sessionId === sessionId
        ) {
          await updateStreamingContent(cont, content, itemId, sessionId);
          scrollDuringStreaming(cont);
          // Update send button state for this container
          updateSendButtonStateForContainer(cont);
        }
      }
    },
    onError: (error, itemId, sessionId) => {
      ztoolkit.log(
        "[ChatPanel] API Error:",
        error.message,
        "itemId:",
        itemId,
        "sessionId:",
        sessionId,
      );
      context.appendError(error.message);

      // Reset state for the specific session that had the error
      if (itemId && sessionId) {
        resetSessionState(itemId, sessionId);
      }

      // Stop streaming scroll in containers viewing this session
      const containers = getActiveContainers();
      containers.forEach((cont) => {
        const sessionInfo = getContainerSessionInfo(cont);
        if (
          sessionInfo &&
          sessionInfo.itemId === itemId &&
          sessionInfo.sessionId === sessionId
        ) {
          const chatHistory = getChatHistory(cont);
          if (chatHistory) {
            stopStreamingScroll(chatHistory);
          }
          // Update send button state for this container
          updateSendButtonStateForContainer(cont);
        }
      });
    },
    onPdfAttached: () => {
      // Update all active containers
      const containers = getActiveContainers();
      containers.forEach((cont) => {
        const attachPdfCheckbox = cont.querySelector(
          "#chat-attach-pdf",
        ) as HTMLInputElement;
        if (attachPdfCheckbox) {
          attachPdfCheckbox.checked = false;
        }
      });
      ztoolkit.log(
        "[PDF Attach] Checkbox unchecked after successful attachment",
      );
    },
    onMessageComplete: async (itemId, sessionId) => {
      ztoolkit.log(
        "[onMessageComplete] itemId:",
        itemId,
        "sessionId:",
        sessionId,
      );

      // Reset streaming state for this specific session
      // Note: itemId can be 0 for global/multi-document sessions
      if (itemId !== undefined && sessionId) {
        resetSessionState(itemId, sessionId);
      }

      // Update containers viewing this session
      const containers = getActiveContainers();

      // First, update button state for all affected containers
      containers.forEach((cont) => {
        const sessionInfo = getContainerSessionInfo(cont);
        if (
          sessionInfo &&
          sessionInfo.itemId === itemId &&
          sessionInfo.sessionId === sessionId
        ) {
          const chatHistory = getChatHistory(cont);
          if (chatHistory) {
            stopStreamingScroll(chatHistory);
          }
          // Update send button state for this container - MUST be called
          updateSendButtonStateForContainer(cont);
          ztoolkit.log(
            "[onMessageComplete] Updated button state for container viewing session:",
            sessionId,
          );
        }
      });

      // Re-render messages to show copy button and timestamp for completed message
      // Note: itemId can be 0 for global/multi-document sessions
      if (itemId !== undefined && sessionId) {
        // Get the session from memory cache first (faster and has latest data)
        let session = manager.getSession(itemId, sessionId);
        // Only load from storage if not in memory cache
        if (!session) {
          session = await manager.loadSession(itemId, sessionId);
        }
        if (session) {
          containers.forEach((cont) => {
            const sessionInfo = getContainerSessionInfo(cont);
            if (
              sessionInfo &&
              sessionInfo.itemId === itemId &&
              sessionInfo.sessionId === sessionId
            ) {
              const chatHistory = getChatHistory(cont);
              const emptyState = cont.querySelector(
                "#chat-empty-state",
              ) as HTMLElement;
              if (chatHistory) {
                renderMessageElements(
                  chatHistory,
                  emptyState,
                  session.messages,
                  getCurrentTheme(),
                  false,
                );
              }
            }
          });
        }
      }
    },
  });
}

/**
 * Check if panel is shown (either sidebar or floating)
 */
export function isPanelShown(): boolean {
  if (currentPanelMode === "sidebar") {
    return chatContainer?.style.display === "block";
  } else {
    return floatingWindow !== null && !floatingWindow.closed;
  }
}

/**
 * Show the chat panel
 */
export function showPanel(): void {
  // Initialize events module
  initializeEventsModule();

  // Load saved panel mode
  loadPanelMode();

  // Update toolbar button pressed state
  updateToolbarButtonState(true);

  if (currentPanelMode === "sidebar") {
    showSidebarPanel();
  } else {
    openFloatingWindow();
  }
}

/**
 * Hide the chat panel
 */
export function hidePanel(): void {
  if (currentPanelMode === "sidebar") {
    hideSidebarPanel();
  } else {
    closeFloatingWindow();
  }

  // Update toolbar button pressed state
  updateToolbarButtonState(false);
}

/**
 * Update toolbar button pressed state
 */
function updateToolbarButtonState(pressed: boolean): void {
  const doc = Zotero.getMainWindow().document;
  const button = doc.getElementById(
    `${config.addonRef}-toolbar-button`,
  ) as HTMLElement;
  if (button) {
    if (pressed) {
      button.style.backgroundColor = "var(--fill-quinary)";
      button.style.boxShadow = "inset 0 1px 3px rgba(0,0,0,0.2)";
    } else {
      button.style.backgroundColor = "transparent";
      button.style.boxShadow = "none";
    }
  }
}

/**
 * Sync sidebar state based on panel visibility and mode
 */
function syncSidebarState(): void {
  if (isPanelShown() && currentPanelMode === "sidebar") {
    // Sidebar panel is open - update position
    updateSidebarContainerPosition();
    refreshChatForCurrentItem();
  } else if (!isPanelShown() && currentPanelMode === "sidebar") {
    // Sidebar panel is closed - collapse sidebar
    collapseSidebar();
  }
}

/**
 * Register global tab notifier for sidebar sync
 */
function registerGlobalTabNotifier(): void {
  if (globalTabNotifierID) return;

  globalTabNotifierID = Zotero.Notifier.registerObserver(
    {
      notify: () => {
        // Sync sidebar state when switching tabs
        syncSidebarState();
      },
    },
    ["tab"],
    `${config.addonRef}-global-tab-notifier`,
  );
  ztoolkit.log("Global tab notifier registered");
}

/**
 * Unregister global tab notifier
 */
function unregisterGlobalTabNotifier(): void {
  if (globalTabNotifierID) {
    Zotero.Notifier.unregisterObserver(globalTabNotifierID);
    globalTabNotifierID = null;
    ztoolkit.log("Global tab notifier unregistered");
  }
}

/**
 * Toggle the chat panel
 */
export function togglePanel(): void {
  if (isPanelShown()) {
    hidePanel();
  } else {
    showPanel();
  }
}

/**
 * Register toolbar button
 */
export function registerToolbarButton(): void {
  const doc = Zotero.getMainWindow().document;

  if (doc.getElementById(`${config.addonRef}-toolbar-button`)) {
    return;
  }

  const anchor = doc.querySelector(
    "#zotero-tabs-toolbar > .zotero-tb-separator",
  );
  if (!anchor) {
    ztoolkit.log("Tabs toolbar separator not found");
    return;
  }

  const button = ztoolkit.UI.insertElementBefore(
    {
      tag: "div",
      namespace: "html",
      id: `${config.addonRef}-toolbar-button`,
      attributes: {
        title: getString(
          "chat-toolbar-button-tooltip" as Parameters<typeof getString>[0],
        ),
      },
      styles: {
        backgroundImage: `url(chrome://${config.addonRef}/content/icons/favicon.svg)`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "18px",
        display: "flex",
        width: "28px",
        height: "28px",
        alignItems: "center",
        borderRadius: "5px",
        cursor: "pointer",
      },
      listeners: [
        {
          type: "click",
          listener: () => togglePanel(),
        },
        {
          type: "mouseover",
          listener: (e: Event) => {
            (e.currentTarget as HTMLElement).style.backgroundColor =
              "var(--fill-quinary)";
          },
        },
        {
          type: "mouseout",
          listener: (e: Event) => {
            // Keep pressed state if panel is open
            if (!isPanelShown()) {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                "transparent";
            }
          },
        },
      ],
    },
    anchor.nextElementSibling as Element,
  ) as HTMLElement;

  // Register global tab notifier for sidebar sync across tabs
  registerGlobalTabNotifier();

  ztoolkit.log("Toolbar button registered", button);
}

/**
 * Unregister toolbar button
 */
export function unregisterToolbarButton(): void {
  const doc = Zotero.getMainWindow().document;
  const button = doc.getElementById(`${config.addonRef}-toolbar-button`);
  if (button) {
    button.remove();
  }

  // Unregister global tab notifier
  unregisterGlobalTabNotifier();
}

/**
 * Create context for event handlers
 */
function createContext(
  container: HTMLElement,
  viewId: string,
): ChatPanelContext {
  const manager = getChatManager();

  // Create context object that will be returned
  const context: ChatPanelContext = {
    container: container,
    chatManager: manager,
    getCurrentItem: () => {
      if (!moduleCurrentItem) {
        moduleCurrentItem = getActiveReaderItem();
        if (moduleCurrentItem && container) {
          updatePdfCheckboxVisibilityForItem(
            container,
            moduleCurrentItem,
            manager,
          );
        }
      }
      return moduleCurrentItem;
    },
    setCurrentItem: (item: Zotero.Item | null) => {
      moduleCurrentItem = item;
    },
    getTheme: getCurrentTheme,
    getAttachmentState: () => ({
      pendingSelectedText,
      pendingSelectedTextDocumentId,
      isQuoteCancelled,
    }),
    clearAttachments: (cancelled: boolean = false) => {
      pendingSelectedText = null;
      pendingSelectedTextDocumentId = null;
      // Set cancelled flag only when user manually closes the quote box
      if (cancelled) {
        isQuoteCancelled = true;
      }
      // Update unified reference display in all containers
      const itemId = moduleCurrentItem?.id ?? 0;
      const currentImages = getImages(itemId);
      const currentDocuments = getDocuments();
      const theme = getCurrentTheme();

      // Create handlers for the unified display
      const handleRemoveImage = (imageId: string) => {
        removeImage(itemId, imageId);
        const newImages = getImages(itemId);
        const newDocuments = getDocuments();
        const hasTextQuote = !!pendingSelectedText;

        // Only close entire container if both text and images are empty
        if (chatContainer) {
          updateUnifiedReferenceDisplay(
            chatContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              documents: newDocuments,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
                context.clearDocuments();
              },
              onRemoveDocument: (docId: number) =>
                context.removeDocument(docId),
            },
            theme,
          );
        }
        if (floatingContainer) {
          updateUnifiedReferenceDisplay(
            floatingContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              documents: newDocuments,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
                context.clearDocuments();
              },
              onRemoveDocument: (docId: number) =>
                context.removeDocument(docId),
            },
            theme,
          );
        }
      };

      if (chatContainer) {
        updateUnifiedReferenceDisplay(
          chatContainer,
          {
            textQuote: null,
            images: currentImages,
            documents: currentDocuments,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
              context.clearDocuments();
            },
            onRemoveDocument: (docId: number) => context.removeDocument(docId),
          },
          theme,
        );
      }
      if (floatingContainer) {
        updateUnifiedReferenceDisplay(
          floatingContainer,
          {
            textQuote: null,
            images: currentImages,
            documents: currentDocuments,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
              context.clearDocuments();
            },
            onRemoveDocument: (docId: number) => context.removeDocument(docId),
          },
          theme,
        );
      }
    },
    updateAttachmentsPreview: () => {
      if (container) {
        updateAttachmentsPreviewDisplay(container, {
          pendingSelectedText,
          pendingSelectedTextDocumentId,
          isQuoteCancelled,
        });
      }
    },
    updatePdfCheckboxVisibility: async (item: Zotero.Item | null) => {
      if (container) {
        await updatePdfCheckboxVisibilityForItem(container, item, manager);
      }
    },
    renderMessages: (messages: ChatMessage[]) => {
      if (container) {
        const chatHistory = container.querySelector(
          "#chat-history",
        ) as HTMLElement;
        const emptyState = container.querySelector(
          "#chat-empty-state",
        ) as HTMLElement;
        if (chatHistory) {
          // Check if the current session is streaming
          const sessionInfo = getContainerSessionInfo(container);
          let isStreaming = false;
          if (sessionInfo) {
            const state = getSessionStreamingState(
              sessionInfo.itemId,
              sessionInfo.sessionId,
            );
            isStreaming = state.isStreaming;
          }
          renderMessageElements(
            chatHistory,
            emptyState,
            messages,
            getCurrentTheme(),
            isStreaming,
          );
        }
      }
    },
    appendError: (errorMessage: string) => {
      ztoolkit.log(
        "[ChatPanel] appendError called:",
        errorMessage.substring(0, 100),
      );
      ztoolkit.log("[ChatPanel] container:", container ? "exists" : "null");

      if (container) {
        const chatHistory = container.querySelector(
          "#chat-history",
        ) as HTMLElement;
        const doc = container.ownerDocument;
        ztoolkit.log(
          "[ChatPanel] chatHistory:",
          chatHistory ? "exists" : "null",
        );
        ztoolkit.log("[ChatPanel] doc:", doc ? "exists" : "null");

        if (chatHistory && doc) {
          const wrapper = doc.createElement("div");
          wrapper.className = "message-wrapper error-message-wrapper";

          const bubble = doc.createElement("div");
          bubble.className = "message-bubble error-bubble";
          bubble.style.cssText = `background: ${chatColors.errorBubbleBg}; border: 1px solid ${chatColors.errorBubbleBorder}; color: ${chatColors.errorBubbleText}; padding: 12px; border-radius: 8px; margin: 8px 0;`;

          const content = doc.createElement("div");
          content.className = "message-content";
          content.textContent = `⚠️ ${errorMessage}`;

          bubble.appendChild(content);
          wrapper.appendChild(bubble);
          chatHistory.appendChild(wrapper);
          chatHistory.scrollTop = chatHistory.scrollHeight;
          ztoolkit.log("[ChatPanel] Error message appended to chat history");
        }
      }
    },
    // Image handling methods
    getImages: () => {
      const itemId = moduleCurrentItem?.id ?? 0;
      return getImages(itemId);
    },
    addImage: async (file: File) => {
      const itemId = moduleCurrentItem?.id ?? 0;
      await addImage(itemId, file);
      // Get updated images after adding
      const updatedImages = getImages(itemId);
      const theme = getCurrentTheme();

      // Create handlers for the unified display
      const handleRemoveImage = (imageId: string) => {
        removeImage(itemId, imageId);
        const newImages = getImages(itemId);
        // Update unified reference display after removal
        if (chatContainer) {
          updateUnifiedReferenceDisplay(
            chatContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
        if (floatingContainer) {
          updateUnifiedReferenceDisplay(
            floatingContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
      };

      // Update unified reference display in all containers
      if (chatContainer) {
        updateUnifiedReferenceDisplay(
          chatContainer,
          {
            textQuote: pendingSelectedText,
            images: updatedImages,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
      if (floatingContainer) {
        updateUnifiedReferenceDisplay(
          floatingContainer,
          {
            textQuote: pendingSelectedText,
            images: updatedImages,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
    },
    removeImage: (imageId: string) => {
      const itemId = moduleCurrentItem?.id ?? 0;
      removeImage(itemId, imageId);
      // Get updated images after removal
      const updatedImages = getImages(itemId);
      const theme = getCurrentTheme();

      // Create handlers for the unified display
      const handleRemoveImage = (id: string) => {
        removeImage(itemId, id);
        const newImages = getImages(itemId);
        // Update unified reference display after removal
        if (chatContainer) {
          updateUnifiedReferenceDisplay(
            chatContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
        if (floatingContainer) {
          updateUnifiedReferenceDisplay(
            floatingContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
      };

      // Update unified reference display in all containers
      if (chatContainer) {
        updateUnifiedReferenceDisplay(
          chatContainer,
          {
            textQuote: pendingSelectedText,
            images: updatedImages,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
      if (floatingContainer) {
        updateUnifiedReferenceDisplay(
          floatingContainer,
          {
            textQuote: pendingSelectedText,
            images: updatedImages,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
    },
    clearImages: () => {
      const itemId = moduleCurrentItem?.id ?? 0;
      clearImages(itemId);
      // Update unified reference display after clearing images
      const theme = getCurrentTheme();
      const emptyImages: Array<{
        id: string;
        base64: string;
        mimeType: string;
      }> = [];

      const handleRemoveImage = (imageId: string) => {
        removeImage(itemId, imageId);
        const newImages = getImages(itemId);
        if (chatContainer) {
          updateUnifiedReferenceDisplay(
            chatContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
        if (floatingContainer) {
          updateUnifiedReferenceDisplay(
            floatingContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemoveImage,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
      };

      if (chatContainer) {
        updateUnifiedReferenceDisplay(
          chatContainer,
          {
            textQuote: pendingSelectedText,
            images: emptyImages,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
      if (floatingContainer) {
        updateUnifiedReferenceDisplay(
          floatingContainer,
          {
            textQuote: pendingSelectedText,
            images: emptyImages,
            onRemoveImage: handleRemoveImage,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
    },
    updateImagePreview: () => {
      const itemId = moduleCurrentItem?.id ?? 0;
      const currentImages = getImages(itemId);
      const theme = getCurrentTheme();

      // Create a stable remove handler
      const handleRemove = (imageId: string) => {
        removeImage(itemId, imageId);
        const newImages = getImages(itemId);
        if (chatContainer) {
          updateUnifiedReferenceDisplay(
            chatContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemove,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
        if (floatingContainer) {
          updateUnifiedReferenceDisplay(
            floatingContainer,
            {
              textQuote: pendingSelectedText,
              images: newImages,
              onRemoveImage: handleRemove,
              onCloseTextQuote: () => context.clearAttachments(true),
              onCloseAll: () => {
                context.clearAttachments(true);
                context.clearImages();
              },
            },
            theme,
          );
        }
      };

      if (chatContainer) {
        updateUnifiedReferenceDisplay(
          chatContainer,
          {
            textQuote: pendingSelectedText,
            images: currentImages,
            onRemoveImage: handleRemove,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
      if (floatingContainer) {
        updateUnifiedReferenceDisplay(
          floatingContainer,
          {
            textQuote: pendingSelectedText,
            images: currentImages,
            onRemoveImage: handleRemove,
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
            },
          },
          theme,
        );
      }
    },
    // Document handling methods
    getDocuments: () => getDocuments(),
    clearDocuments: () => {
      clearDocuments();
      // Update unified reference display in both containers
      const theme = getCurrentTheme();
      const itemId = moduleCurrentItem?.id ?? 0;
      const currentImages = getImages(itemId);

      if (chatContainer) {
        updateUnifiedReferenceDisplay(
          chatContainer,
          {
            textQuote: pendingSelectedText,
            images: currentImages,
            documents: [],
            onRemoveImage: () => {},
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
              clearDocuments();
            },
            onRemoveDocument: () => {},
          },
          theme,
        );
      }
      if (floatingContainer) {
        updateUnifiedReferenceDisplay(
          floatingContainer,
          {
            textQuote: pendingSelectedText,
            images: currentImages,
            documents: [],
            onRemoveImage: () => {},
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
              clearDocuments();
            },
            onRemoveDocument: () => {},
          },
          theme,
        );
      }
    },
    removeDocument: (documentId: number) => {
      removeDocument(documentId);
      // Update unified reference display in both containers
      const theme = getCurrentTheme();
      const itemId = moduleCurrentItem?.id ?? 0;
      const currentImages = getImages(itemId);
      const currentDocuments = getDocuments();

      if (chatContainer) {
        updateUnifiedReferenceDisplay(
          chatContainer,
          {
            textQuote: pendingSelectedText,
            images: currentImages,
            documents: currentDocuments,
            onRemoveImage: () => {},
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
              clearDocuments();
            },
            onRemoveDocument: (docId: number) => context.removeDocument(docId),
          },
          theme,
        );
      }
      if (floatingContainer) {
        updateUnifiedReferenceDisplay(
          floatingContainer,
          {
            textQuote: pendingSelectedText,
            images: currentImages,
            documents: currentDocuments,
            onRemoveImage: () => {},
            onCloseTextQuote: () => context.clearAttachments(true),
            onCloseAll: () => {
              context.clearAttachments(true);
              context.clearImages();
              clearDocuments();
            },
            onRemoveDocument: (docId: number) => context.removeDocument(docId),
          },
          theme,
        );
      }
    },
    // View identification
    getViewId: () => viewId,
  };

  // Set the current context for event handlers
  setCurrentContext(context);

  return context;
}

/**
 * Initialize chat content and event handlers (for sidebar)
 */
async function initializeChatContent(): Promise<void> {
  if (!chatContainer) return;
  await initializeChatContentCommon(chatContainer, SIDEBAR_VIEW_ID);
}

/**
 * Refresh chat content for current item (for sidebar)
 */
async function refreshChatForCurrentItem(): Promise<void> {
  if (!chatContainer) return;
  await refreshChatForContainer(chatContainer);
}

/**
 * Unregister all and clean up
 */
export function unregisterAll(): void {
  // Close floating window
  closeFloatingWindow();

  // Remove container
  if (chatContainer) {
    chatContainer.remove();
    chatContainer = null;
  }

  // Reset initialization flags
  contentInitialized = false;
  floatingContentInitialized = false;

  // Remove toolbar button
  unregisterToolbarButton();

  // Clean up listeners
  if (resizeHandler) {
    Zotero.getMainWindow().removeEventListener("resize", resizeHandler);
    resizeHandler = null;
  }

  if (sidebarObserver) {
    sidebarObserver.disconnect();
    sidebarObserver = null;
  }

  if (tabNotifierID) {
    Zotero.Notifier.unregisterObserver(tabNotifierID);
    tabNotifierID = null;
  }

  // Clean up theme listener
  if (themeCleanup) {
    themeCleanup();
    themeCleanup = null;
  }

  // Clean up scroll managers
  activeScrollManagers.forEach((chatHistory) => {
    removeScrollManager(chatHistory);
  });
  activeScrollManagers.clear();

  // Destroy chat manager
  if (chatManager) {
    chatManager.destroy();
    chatManager = null;
  }

  // Clear attachment state
  pendingSelectedText = null;
  moduleCurrentItem = null;
}

/**
 * Get the chat container element
 */
export function getChatContainer(): HTMLElement | null {
  return chatContainer;
}

/**
 * Get the floating container element
 */
export function getFloatingContainer(): HTMLElement | null {
  return floatingContainer;
}

/**
 * Add selected text as attachment
 */
export function addSelectedTextAttachment(text: string): void {
  pendingSelectedText = text;
  if (chatContainer) {
    updateAttachmentsPreviewDisplay(chatContainer, {
      pendingSelectedText,
      pendingSelectedTextDocumentId,
      isQuoteCancelled,
    });
  }
}

/**
 * Setup model change subscription for a container
 * Called when showing panel to ensure subscription is active
 */
function setupModelChangeSubscription(container: HTMLElement): void {
  // Unsubscribe from previous listener if exists
  const existingUnsubscribe = (container as any)._unsubscribeModelChange;
  if (existingUnsubscribe) {
    existingUnsubscribe();
    (container as any)._unsubscribeModelChange = null;
  }

  // Subscribe to model changes
  const modelStateManager = getModelStateManager();
  const unsubscribe = modelStateManager.onModelChange(() => {
    // Update model selector display when model changes
    updateModelSelectorDisplay(container);
  });

  // Store unsubscribe function
  (container as any)._unsubscribeModelChange = unsubscribe;

  // Immediately update display with current model
  updateModelSelectorDisplay(container);
}
