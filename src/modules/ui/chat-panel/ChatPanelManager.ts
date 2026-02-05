/**
 * ChatPanelManager - Main panel lifecycle and coordination
 */

import { config } from "../../../../package.json";
import { getString } from "../../../utils/locale";
import { ChatManager, type ChatMessage } from "../../chat";

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
} from "./ChatPanelEvents";
import { getGlobalInputText } from "./InputStateManager";
import {
  getScrollManager,
  removeScrollManager,
  startStreamingScroll,
  stopStreamingScroll,
  scrollToBottom,
} from "./AutoScrollManager";

// Track scroll managers for cleanup
const activeScrollManagers = new Set<HTMLElement>();

// Global streaming state to track across view switches
let isGloballyStreaming = false;

// Global sending state to track if user has sent a message but not yet received response
let isSendingMessage = false;

/**
 * Check if AI is currently streaming a response
 */
export function getIsGloballyStreaming(): boolean {
  return isGloballyStreaming;
}

/**
 * Check if a message is being sent (user clicked send but response not started)
 */
export function getIsSendingMessage(): boolean {
  return isSendingMessage;
}

/**
 * Set the sending message state
 */
export function setIsSendingMessage(value: boolean): void {
  isSendingMessage = value;
}

// Panel display mode: 'sidebar' or 'floating'
export type PanelMode = "sidebar" | "floating";

// Floating window default size
const FLOATING_WIDTH = 420;
const FLOATING_HEIGHT = 600;

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
 * Shows quote box in all active containers
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

  // Update quote box in sidebar container
  if (chatContainer) {
    updateQuoteBoxDisplay(chatContainer, text);
  }

  // Update quote box in floating container
  if (floatingContainer) {
    updateQuoteBoxDisplay(floatingContainer, text);
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

  // Calculate position (center on main window)
  const width = FLOATING_WIDTH;
  const height = FLOATING_HEIGHT;
  const left = mainWindow.screenX + (mainWindow.outerWidth - width) / 2;
  const top = mainWindow.screenY + (mainWindow.outerHeight - height) / 2;

  // Check if window should be always on top
  const isAlwaysOnTop = getPref("keepWindowTop") as boolean;

  // Open new window using openDialog for better control
  floatingWindow = (
    mainWindow as Window & { openDialog: (...args: unknown[]) => Window }
  ).openDialog(
    `chrome://${config.addonRef}/content/chatWindow.xhtml`,
    "zota-chat-window",
    `chrome,dialog=no,resizable=yes,centerscreen,${isAlwaysOnTop ? "alwaysRaised=yes," : ""}width=${width},height=${height},left=${left},top=${top}`,
  );

  if (!floatingWindow) {
    ztoolkit.log("Failed to open floating window");
    return;
  }

  // Wait for window to load, then initialize content
  floatingWindow.addEventListener("load", () => {
    ztoolkit.log("Floating window load event fired");
    initializeFloatingWindowContent();

    // Handle window close - only after content is loaded
    floatingWindow?.addEventListener("unload", () => {
      ztoolkit.log("Floating window unload event");
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
): Promise<void> {
  const context = createContext(container);

  // Initialize scroll manager for this container
  const chatHistory = container.querySelector("#chat-history") as HTMLElement;
  if (chatHistory) {
    getScrollManager(chatHistory);
    activeScrollManagers.add(chatHistory);

    // If globally streaming, start streaming for this container too
    if (isGloballyStreaming) {
      startStreamingScroll(chatHistory);
    }
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

  // Sync quote box state - show if there's pending selected text for current document
  const activeReaderItem = getActiveReaderItem();
  const currentDocId = activeReaderItem?.id ?? null;
  if (
    pendingSelectedText &&
    pendingSelectedTextDocumentId !== null &&
    currentDocId === pendingSelectedTextDocumentId
  ) {
    updateQuoteBoxDisplay(container, pendingSelectedText);
  }

  // Load session and render
  const session = await manager.getOrCreateSession(moduleCurrentItem.id);
  manager.setActiveItem(moduleCurrentItem.id);
  context.renderMessages(session.messages);

  focusInput(container);
}

/**
 * Refresh chat for current item (works for both sidebar and floating)
 */
async function refreshChatForContainer(container: HTMLElement): Promise<void> {
  const activeItem = getActiveReaderItem();
  if (activeItem) {
    moduleCurrentItem = activeItem;
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

  const chatHistory = container.querySelector("#chat-history") as HTMLElement;
  const emptyState = container.querySelector(
    "#chat-empty-state",
  ) as HTMLElement;
  if (chatHistory) {
    renderMessageElements(
      chatHistory,
      emptyState,
      session.messages,
      getCurrentTheme(),
      isGloballyStreaming,
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
          // Check if document changed - clear quote box if so
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
              "- clearing quote box (floating)",
            );
            pendingSelectedText = null;
            pendingSelectedTextDocumentId = null;
            if (floatingContainer) {
              updateQuoteBoxDisplay(floatingContainer, null);
            }
            if (chatContainer) {
              updateQuoteBoxDisplay(chatContainer, null);
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

  await initializeChatContentCommon(floatingContainer);
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

    // 延迟重新检测主题，因为启动时窗口可能还没完全应用暗黑模式
    // 使用多次检测确保主题正确应用
    const reapplyTheme = () => {
      updateCurrentTheme();
      if (chatContainer) {
        applyThemeToContainer(chatContainer);
      }
      if (floatingContainer) {
        applyThemeToContainer(floatingContainer);
      }
    };
    // 多次延迟检测，确保在窗口完全加载后正确应用主题
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
          // Check if document changed - clear quote box if so
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
              "- clearing quote box",
            );
            pendingSelectedText = null;
            pendingSelectedTextDocumentId = null;
            if (chatContainer) {
              updateQuoteBoxDisplay(chatContainer, null);
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
    const context = createContext(chatContainer);
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
  const updateStreamingContent = (cont: HTMLElement, content: string) => {
    const streamingEl = cont.querySelector("#chat-streaming-content");
    if (streamingEl) {
      renderMarkdownToElement(streamingEl as HTMLElement, content);
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
    onMessageUpdate: (itemId, messages) => {
      ztoolkit.log(
        "onMessageUpdate callback fired, itemId:",
        itemId,
        "moduleCurrentItem:",
        moduleCurrentItem?.id,
      );
      if (moduleCurrentItem && itemId === moduleCurrentItem.id) {
        // Update all active containers
        const containers = getActiveContainers();
        containers.forEach((cont) => {
          const chatHistory = getChatHistory(cont);
          const emptyState = cont.querySelector(
            "#chat-empty-state",
          ) as HTMLElement;
          if (chatHistory) {
            renderMessageElements(
              chatHistory,
              emptyState,
              messages,
              getCurrentTheme(),
              isGloballyStreaming,
            );

            // Scroll to bottom after rendering (not during streaming)
            const scrollManager = getScrollManager(chatHistory);
            if (scrollManager && !scrollManager.isAutoScrolling()) {
              scrollToBottom(chatHistory, true);
            }
          }
        });
      }
    },
    onStreamingUpdate: (itemId, content) => {
      if (moduleCurrentItem && itemId === moduleCurrentItem.id) {
        // Set global streaming state
        isGloballyStreaming = true;
        // Clear sending state since response has started
        isSendingMessage = false;

        // Update streaming content in all active containers
        const containers = getActiveContainers();
        containers.forEach((cont) => {
          updateStreamingContent(cont, content);
          scrollDuringStreaming(cont);
          // Disable send button while streaming
          const sendButton = cont.querySelector(
            "#chat-send-button",
          ) as HTMLButtonElement;
          if (sendButton) {
            sendButton.disabled = true;
            sendButton.style.opacity = "0.5";
            sendButton.style.cursor = "not-allowed";
          }
        });
      }
    },
    onError: (error) => {
      ztoolkit.log("[ChatPanel] API Error:", error.message);
      context.appendError(error.message);
      // Clear global streaming state and sending state
      isGloballyStreaming = false;
      isSendingMessage = false;
      // Stop streaming scroll in all containers
      const containers = getActiveContainers();
      containers.forEach((cont) => {
        const chatHistory = getChatHistory(cont);
        if (chatHistory) {
          stopStreamingScroll(chatHistory);
        }
        // Re-enable send button
        const sendButton = cont.querySelector(
          "#chat-send-button",
        ) as HTMLButtonElement;
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.style.opacity = "1";
          sendButton.style.cursor = "pointer";
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
    onMessageComplete: async () => {
      // Clear global streaming state and sending state
      isGloballyStreaming = false;
      isSendingMessage = false;
      // Stop streaming scroll in all containers
      const containers = getActiveContainers();
      containers.forEach((cont) => {
        const chatHistory = getChatHistory(cont);
        if (chatHistory) {
          stopStreamingScroll(chatHistory);
        }
        // Re-enable send button
        const sendButton = cont.querySelector(
          "#chat-send-button",
        ) as HTMLButtonElement;
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.style.opacity = "1";
          sendButton.style.cursor = "pointer";
        }
      });
      // Re-render messages to show copy button and timestamp for completed message
      if (moduleCurrentItem) {
        const session = await manager.getOrCreateSession(moduleCurrentItem.id);
        containers.forEach((cont) => {
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
              isGloballyStreaming,
            );
          }
        });
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
function createContext(container: HTMLElement): ChatPanelContext {
  const manager = getChatManager();

  return {
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
      // Update quote box in all containers
      if (chatContainer) {
        updateQuoteBoxDisplay(chatContainer, null);
      }
      if (floatingContainer) {
        updateQuoteBoxDisplay(floatingContainer, null);
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
          renderMessageElements(
            chatHistory,
            emptyState,
            messages,
            getCurrentTheme(),
            isGloballyStreaming,
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
  };
}

/**
 * Initialize chat content and event handlers (for sidebar)
 */
async function initializeChatContent(): Promise<void> {
  if (!chatContainer) return;
  await initializeChatContentCommon(chatContainer);
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
