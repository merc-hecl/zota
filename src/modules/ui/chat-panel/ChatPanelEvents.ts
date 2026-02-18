/**
 * ChatPanelEvents - Event handlers for the chat panel
 */

import { config } from "../../../../package.json";
import type { ChatPanelContext, AttachmentState, SessionInfo } from "./types";
import { chatColors } from "../../../utils/colors";
import {
  createElement,
  copyToClipboard,
  updateUnifiedReferenceDisplay,
  showDropZone,
  hideDropZone,
  updateDropZoneText,
} from "./ChatPanelBuilder";
import { getCurrentTheme } from "./ChatPanelTheme";
import {
  createHistoryDropdownState,
  populateHistoryDropdown,
  toggleHistoryDropdown,
  setupClickOutsideHandler,
} from "./HistoryDropdown";

import { getString } from "../../../utils/locale";
import {
  getProviderManager,
  getModelStateManager,
  type ApiKeyProviderConfig,
} from "../../providers";
import { getPref, setPref } from "../../../utils/prefs";
import { formatModelLabel } from "../../preferences/ModelsFetcher";
import type { PanelMode } from "./ChatPanelManager";
import {
  getIsGloballyStreaming,
  getIsSendingMessage,
  setIsSendingMessageForContainer,
  getChatContainer,
  getFloatingContainer,
  updateSendButtonStateForContainer as updateContainerSendButtonState,
} from "./ChatPanelManager";
import {
  setActiveSessionId,
  getSessionStreamingState,
} from "./StreamingStateManager";
import { startStreamingScroll } from "./AutoScrollManager";
import { getNoteExportService } from "../../chat";
import {
  getGlobalInputText,
  setGlobalInputText,
  addToInputHistory,
  navigateHistoryUp,
  navigateHistoryDown,
  resetHistoryNavigation,
} from "./InputStateManager";
import {
  clearImages,
  getImages,
  removeImage,
  addImageFromBase64,
} from "./ImageStateManager";
import {
  parseDataTransfer,
  hasSupportedImageType,
  hasZoteroItem,
  type ParsedDragData,
} from "./DataTransferParser";
import {
  incrementDrag,
  decrementDrag,
  resetDragState,
  onDragStateChange,
} from "./DragDropManager";
import {
  setDocuments,
  getDocuments,
  removeDocument,
  clearDocuments,
  hasDocuments,
} from "./DocumentStateManager";

// Import getActiveReaderItem from the manager module to avoid circular dependency
// This is set by ChatPanelManager during initialization
let getActiveReaderItemFn: (() => Zotero.Item | null) | null = null;

// Toggle panel mode function reference (set by ChatPanelManager)
let togglePanelModeFn: (() => void) | null = null;

// Note: We use the global isSendingMessage state from ChatPanelManager
// instead of a local variable to ensure proper state synchronization

// Global history refresh callbacks
const historyRefreshCallbacks = new Set<() => void>();

/**
 * Register a callback to be called when history should be refreshed
 */
export function onHistoryRefresh(callback: () => void): () => void {
  historyRefreshCallbacks.add(callback);
  return () => {
    historyRefreshCallbacks.delete(callback);
  };
}

/**
 * Trigger history refresh for all registered callbacks
 */
export function triggerHistoryRefresh(): void {
  historyRefreshCallbacks.forEach((callback) => {
    try {
      callback();
    } catch (error) {
      ztoolkit.log("[ChatPanelEvents] History refresh callback error:", error);
    }
  });
}
// Use setIsSendingMessage(true/false) to set the state
// Use getIsSendingMessage() to read the state

/**
 * Set the getActiveReaderItem function reference
 * Called by ChatPanelManager to avoid circular imports
 */
export function setActiveReaderItemFn(fn: () => Zotero.Item | null): void {
  getActiveReaderItemFn = fn;
}

/**
 * Set the togglePanelMode function reference
 * Called by ChatPanelManager to avoid circular imports
 */
export function setTogglePanelModeFn(fn: () => void): void {
  togglePanelModeFn = fn;
}

/**
 * Update unified reference display for a specific item in all containers
 */
function updateUnifiedReferenceForItem(
  itemId: number,
  textQuote?: string | null,
  explicitContext?: ChatPanelContext,
): void {
  const images = getImages(itemId);

  // Get text quote from state if not provided
  // This ensures we always use the correct state, not stale DOM content
  let effectiveTextQuote = textQuote;
  if (effectiveTextQuote === undefined) {
    // Use explicit context if provided, otherwise try to get from containers
    const ctx =
      explicitContext ||
      getContextForContainer(getChatContainer()) ||
      getContextForContainer(getFloatingContainer());
    const attachmentState = ctx?.getAttachmentState();
    effectiveTextQuote = attachmentState?.pendingSelectedText || null;
  }

  const chatContainer = getChatContainer();
  const floatingContainer = getFloatingContainer();
  const theme = getCurrentTheme();

  ztoolkit.log(
    "[updateUnifiedReferenceForItem] chatContainer:",
    chatContainer ? "exists" : "null",
    "floatingContainer:",
    floatingContainer ? "exists" : "null",
  );

  // Create handlers
  const handleRemoveImage = (imageId: string) => {
    removeImage(itemId, imageId);
    // Refresh display using current state (not DOM)
    updateUnifiedReferenceForItem(itemId);
  };

  const handleCloseTextQuote = () => {
    // Clear text quote but keep images
    const context =
      getContextForContainer(chatContainer) ||
      getContextForContainer(floatingContainer);
    if (context) {
      context.clearAttachments(true);
    }
    // Refresh display - state will be fetched from getAttachmentState
    updateUnifiedReferenceForItem(itemId);
  };

  const handleCloseAll = () => {
    // Clear both text and images
    const context =
      getContextForContainer(chatContainer) ||
      getContextForContainer(floatingContainer);
    if (context) {
      context.clearAttachments(true);
      context.clearImages();
    }
    // Refresh display
    updateUnifiedReferenceForItem(itemId);
  };

  if (chatContainer) {
    updateUnifiedReferenceDisplay(
      chatContainer,
      {
        textQuote: effectiveTextQuote,
        images,
        onRemoveImage: handleRemoveImage,
        onCloseTextQuote: handleCloseTextQuote,
        onCloseAll: handleCloseAll,
      },
      theme,
    );
  }
  if (floatingContainer) {
    updateUnifiedReferenceDisplay(
      floatingContainer,
      {
        textQuote: effectiveTextQuote,
        images,
        onRemoveImage: handleRemoveImage,
        onCloseTextQuote: handleCloseTextQuote,
        onCloseAll: handleCloseAll,
      },
      theme,
    );
  }
}

/**
 * Helper to get current text quote from a container
 */
function getCurrentTextQuoteFromContainer(
  container: HTMLElement | null,
): string | null {
  if (!container) return null;
  const textQuoteContent = container.querySelector(
    "#chat-text-quote-content",
  ) as HTMLElement;
  return textQuoteContent?.textContent || null;
}

/**
 * Helper to get context for a container
 * Note: This is a simplified version - the actual context is managed by ChatPanelManager
 */
let currentContext: ChatPanelContext | null = null;

export function setCurrentContext(context: ChatPanelContext | null): void {
  currentContext = context;
}

function getContextForContainer(
  _container: HTMLElement | null,
): ChatPanelContext | null {
  return currentContext;
}

/**
 * Update panel mode button icon based on current mode
 */
export function updatePanelModeButtonIcon(
  container: HTMLElement,
  mode: PanelMode,
): void {
  const panelModeIcon = container.querySelector(
    "#chat-panel-mode-icon",
  ) as HTMLImageElement;
  const panelModeBtn = container.querySelector(
    "#chat-panel-mode-btn",
  ) as HTMLButtonElement;
  if (panelModeIcon && panelModeBtn) {
    // split.svg for sidebar mode (click to switch to floating)
    // right-bar.svg for floating mode (click to switch to sidebar)
    panelModeIcon.src =
      mode === "sidebar"
        ? `chrome://${config.addonRef}/content/icons/split.svg`
        : `chrome://${config.addonRef}/content/icons/right-bar.svg`;
    panelModeBtn.title =
      mode === "sidebar"
        ? getString("chat-switch-to-floating")
        : getString("chat-switch-to-sidebar");
  }
}

/**
 * Get the active reader item
 */
function getActiveReaderItem(): Zotero.Item | null {
  if (getActiveReaderItemFn) {
    return getActiveReaderItemFn();
  }
  return null;
}

/**
 * Setup all event handlers for the chat panel
 */
export function setupEventHandlers(context: ChatPanelContext): void {
  const { container, chatManager } = context;

  // Get DOM elements
  const messageInput = container.querySelector(
    "#chat-message-input",
  ) as HTMLTextAreaElement;
  const sendButton = container.querySelector(
    "#chat-send-button",
  ) as HTMLButtonElement;
  const attachPdfCheckbox = container.querySelector(
    "#chat-attach-pdf",
  ) as HTMLInputElement;
  const newChatBtn = container.querySelector("#chat-new") as HTMLButtonElement;
  const historyBtn = container.querySelector(
    "#chat-history-btn",
  ) as HTMLButtonElement;
  const historyDropdown = container.querySelector(
    "#chat-history-dropdown",
  ) as HTMLElement;
  const attachmentsPreview = container.querySelector(
    "#chat-attachments-preview",
  ) as HTMLElement;
  const chatHistory = container.querySelector("#chat-history") as HTMLElement;
  const emptyState = container.querySelector(
    "#chat-empty-state",
  ) as HTMLElement;
  const pinBtn = container.querySelector("#chat-pin-btn") as HTMLButtonElement;
  const closeBtn = container.querySelector(
    "#chat-close-btn",
  ) as HTMLButtonElement;
  // History dropdown state
  const historyState = createHistoryDropdownState();

  // Reference close buttons are handled by updateUnifiedReferenceDisplay

  // Initialize send button state - button starts enabled
  // The actual state will be updated by ChatPanelManager based on the session state
  if (sendButton) {
    sendButton.disabled = false;
    sendButton.style.opacity = "1";
    sendButton.style.cursor = "pointer";
  }

  // Initialize input with global text (in case it was set by another view)
  if (messageInput) {
    const globalText = getGlobalInputText();
    if (messageInput.value !== globalText) {
      messageInput.value = globalText;
      messageInput.style.height = "auto";
      messageInput.style.height =
        Math.min(messageInput.scrollHeight, 140) + "px";
    }
  }

  // Initialize unified reference display
  const itemId = context.getCurrentItem()?.id ?? 0;
  // State will be fetched from getAttachmentState inside updateUnifiedReferenceForItem
  updateUnifiedReferenceForItem(itemId);

  // Handle paste events for images
  messageInput?.addEventListener("paste", async (e: ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // Check if clipboard contains images
    const hasImages = Array.from(clipboardData.items).some((item) =>
      item.type.startsWith("image/"),
    );

    if (hasImages) {
      e.preventDefault();

      // Extract and add images
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            await context.addImage(blob);
          }
        }
      }
      // Update unified reference display after adding images
      const currentItemId = context.getCurrentItem()?.id ?? 0;
      // Pass context explicitly to ensure correct state is fetched
      updateUnifiedReferenceForItem(currentItemId, undefined, context);
    }
  });

  // Handle drag and drop events for images and Zotero annotations
  const inputWrapper = container.querySelector(
    "#chat-input-wrapper",
  ) as HTMLElement;

  // Subscribe to drag state changes to show/hide drop zone
  const unsubscribeDragState = onDragStateChange((isDragging) => {
    if (isDragging) {
      showDropZone(container);
    } else {
      hideDropZone(container);
    }
  });

  // Store unsubscribe function for cleanup
  (container as any)._unsubscribeDragState = unsubscribeDragState;

  // Container-level drag detection for drop zone
  container.addEventListener("dragenter", (e: DragEvent) => {
    if (
      e.dataTransfer &&
      (hasSupportedImageType(e.dataTransfer) || hasZoteroItem(e.dataTransfer))
    ) {
      e.preventDefault();
      e.stopPropagation();
      // Update drop zone text based on content type
      const isDocument = hasZoteroItem(e.dataTransfer);
      updateDropZoneText(container, isDocument);
      incrementDrag();
    }
  });

  container.addEventListener("dragleave", (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    decrementDrag();
  });

  container.addEventListener("dragover", (e: DragEvent) => {
    if (
      e.dataTransfer &&
      (hasSupportedImageType(e.dataTransfer) || hasZoteroItem(e.dataTransfer))
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    }
  });

  // Handle drop on container (for drop zone)
  container.addEventListener("drop", async (e: DragEvent) => {
    if (
      !e.dataTransfer ||
      (!hasSupportedImageType(e.dataTransfer) && !hasZoteroItem(e.dataTransfer))
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    resetDragState();
    hideDropZone(container);

    await handleDroppedData(e.dataTransfer, context, messageInput);
  });

  if (inputWrapper) {
    // Store original border style
    const originalBorder = inputWrapper.style.border;
    const originalBackground = inputWrapper.style.background;

    // Drag enter - show visual feedback
    inputWrapper.addEventListener("dragenter", (e: DragEvent) => {
      if (
        e.dataTransfer &&
        (hasSupportedImageType(e.dataTransfer) || hasZoteroItem(e.dataTransfer))
      ) {
        e.preventDefault();
        e.stopPropagation();
        inputWrapper.style.border = "2px dashed #10b981";
        inputWrapper.style.background = "rgba(16, 185, 129, 0.05)";
      }
    });

    // Drag over - allow drop
    inputWrapper.addEventListener("dragover", (e: DragEvent) => {
      if (
        e.dataTransfer &&
        (hasSupportedImageType(e.dataTransfer) || hasZoteroItem(e.dataTransfer))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Drag leave - remove visual feedback
    inputWrapper.addEventListener("dragleave", (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Check if we're actually leaving the wrapper (not entering a child)
      const rect = inputWrapper.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        inputWrapper.style.border = originalBorder;
        inputWrapper.style.background = originalBackground;
      }
    });

    // Drop - handle dropped files and Zotero annotations
    inputWrapper.addEventListener("drop", async (e: DragEvent) => {
      if (
        !e.dataTransfer ||
        (!hasSupportedImageType(e.dataTransfer) &&
          !hasZoteroItem(e.dataTransfer))
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Remove visual feedback
      inputWrapper.style.border = originalBorder;
      inputWrapper.style.background = originalBackground;

      resetDragState();
      hideDropZone(container);

      await handleDroppedData(e.dataTransfer, context, messageInput);
    });
  }

  // Send button
  sendButton?.addEventListener("click", async () => {
    ztoolkit.log("Send button clicked");

    // Check if input is empty
    const content = messageInput?.value?.trim() || "";
    const images = context.getImages();

    // Don't send if there's no content and no images
    if (!content && images.length === 0) {
      ztoolkit.log("Send button clicked but input is empty, ignoring");
      return;
    }

    // Block send button while AI is responding or message is being sent in this container
    if (sendButton?.disabled) {
      ztoolkit.log(
        "Send button blocked - AI is responding or message is being sent",
      );
      return;
    }

    ztoolkit.log("[Send] attachPdfCheckbox element:", attachPdfCheckbox);
    ztoolkit.log(
      "[Send] attachPdfCheckbox.checked:",
      attachPdfCheckbox?.checked,
    );
    await sendMessage(
      context,
      messageInput,
      sendButton,
      attachPdfCheckbox,
      attachmentsPreview,
      container,
    );
  });

  // Input keydown - Enter to send (blocked while sending), ArrowUp/ArrowDown for history
  messageInput?.addEventListener("keydown", (e: KeyboardEvent) => {
    // Handle ArrowUp - show previous input from history (only when input is empty or navigating history)
    if (e.key === "ArrowUp" && !e.shiftKey) {
      const currentText = messageInput.value;
      // Only trigger when input is empty OR when we're already navigating history
      if (
        currentText === "" ||
        (currentText !== "" &&
          messageInput.selectionStart === 0 &&
          messageInput.selectionEnd === 0)
      ) {
        e.preventDefault();
        const historyText = navigateHistoryUp(currentText);
        if (historyText !== null) {
          messageInput.value = historyText;
          // Sync to global state for cross-view synchronization
          setGlobalInputText(historyText);
          // Move cursor to end
          messageInput.selectionStart = historyText.length;
          messageInput.selectionEnd = historyText.length;
          // Trigger auto-resize
          messageInput.style.height = "auto";
          messageInput.style.height =
            Math.min(messageInput.scrollHeight, 140) + "px";
        }
        return;
      }
    }

    // Handle ArrowDown - navigate forward in history
    if (e.key === "ArrowDown" && !e.shiftKey) {
      const historyText = navigateHistoryDown();
      if (historyText !== null) {
        e.preventDefault();
        messageInput.value = historyText;
        // Sync to global state for cross-view synchronization
        setGlobalInputText(historyText);
        // Move cursor to end
        messageInput.selectionStart = historyText.length;
        messageInput.selectionEnd = historyText.length;
        // Trigger auto-resize
        messageInput.style.height = "auto";
        messageInput.style.height =
          Math.min(messageInput.scrollHeight, 140) + "px";
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      // Check if input is empty
      const content = messageInput?.value?.trim() || "";
      const images = context.getImages();

      // Don't send if there's no content and no images
      if (!content && images.length === 0) {
        ztoolkit.log("Enter key pressed but input is empty, ignoring");
        return;
      }

      // Block Enter key while sending or AI is responding in this container
      if (sendButton?.disabled) {
        ztoolkit.log(
          "Enter key blocked - message is being sent or AI is responding",
        );
        return;
      }

      ztoolkit.log("Enter key pressed to send");
      ztoolkit.log("[Send] attachPdfCheckbox element:", attachPdfCheckbox);
      ztoolkit.log(
        "[Send] attachPdfCheckbox.checked:",
        attachPdfCheckbox?.checked,
      );
      sendMessage(
        context,
        messageInput,
        sendButton,
        attachPdfCheckbox,
        attachmentsPreview,
        container,
      );
    }
  });

  // Input auto-resize and sync to global state
  messageInput?.addEventListener("input", () => {
    if (messageInput) {
      messageInput.style.height = "auto";
      messageInput.style.height =
        Math.min(messageInput.scrollHeight, 140) + "px";
      // Sync to global state for cross-view synchronization
      setGlobalInputText(messageInput.value);
    }
  });

  // Check for PDF when input is focused, also reset history navigation
  messageInput?.addEventListener("focus", () => {
    // Reset history navigation when focusing input
    resetHistoryNavigation();
    const currentItem = context.getCurrentItem();
    if (!currentItem) {
      const item = getActiveReaderItem();
      if (item) {
        context.setCurrentItem(item);
        context.updatePdfCheckboxVisibility(item);
      }
    }
  });

  // Handle Ctrl+C / Cmd+C for copying selected text
  container.addEventListener("keydown", (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "c") {
      const win = container.ownerDocument?.defaultView;
      const selection = win?.getSelection();
      const selectedText = selection?.toString();
      if (selectedText && selectedText.trim().length > 0) {
        e.preventDefault();
        copyToClipboard(selectedText);
        ztoolkit.log(
          "Copied selected text via Ctrl+C:",
          selectedText.substring(0, 50),
        );
      }
    }
  });

  // Make container focusable for keyboard events
  if (!container.hasAttribute("tabindex")) {
    container.setAttribute("tabindex", "-1");
  }

  // New chat button - start a new conversation
  newChatBtn?.addEventListener("click", async () => {
    ztoolkit.log("New chat button clicked");

    let item = getActiveReaderItem();
    if (item) {
      context.setCurrentItem(item);
    } else {
      const currentItem = context.getCurrentItem();
      if (!currentItem) {
        context.setCurrentItem({ id: 0 } as Zotero.Item);
        item = { id: 0 } as Zotero.Item;
      } else {
        item = currentItem;
      }
    }

    // Create new session instead of clearing current one
    // This preserves all historical sessions
    const newSession = await chatManager.createNewSession(item!.id);

    // Update active session tracking for this container
    const { setActiveSessionId, setViewSession } =
      await import("./StreamingStateManager");
    setActiveSessionId(item!.id, newSession.id);

    // Also update view session in state manager
    const viewId = context.getViewId?.();
    if (viewId) {
      setViewSession(viewId, item!.id, newSession.id);
    }

    // Clear attachments (text quote)
    context.clearAttachments();

    // Clear images
    context.clearImages();

    // Unified reference display is updated by clearAttachments and clearImages

    if (attachPdfCheckbox) {
      attachPdfCheckbox.checked = false;
    }

    // Clear chat history display and show empty state
    if (chatHistory && emptyState) {
      chatHistory.textContent = "";
      chatHistory.appendChild(emptyState);
      emptyState.style.display = "flex";
    }

    // Reset send button state for the new session
    // New session should always have button enabled
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.style.opacity = "1";
      sendButton.style.cursor = "pointer";
    }

    ztoolkit.log(
      "New chat started for item:",
      item!.id,
      "session:",
      newSession.id,
    );
  });

  // History button - toggle dropdown with pagination
  historyBtn?.addEventListener("click", async () => {
    ztoolkit.log("History button clicked");
    if (!historyDropdown) return;

    const isNowVisible = toggleHistoryDropdown(historyDropdown);
    if (!isNowVisible) return;

    // Populate history dropdown
    await refreshHistoryDropdown();
  });

  // Helper function to check if we are in library view (no active reader)
  const isInLibraryView = (): boolean => {
    const activeReaderItem = getActiveReaderItem();
    return activeReaderItem === null;
  };

  // Helper function to refresh history dropdown
  const refreshHistoryDropdown = async () => {
    if (!historyDropdown) return;

    // Get current item to filter sessions by document
    const currentItem = context.getCurrentItem();
    const currentItemId = currentItem?.id;

    // Check if we are in library view (no active reader)
    const inLibraryView = isInLibraryView();

    // Get all sessions
    const allSessions = await chatManager.getAllSessions();

    // Filter sessions: if we have a current item and not in library view,
    // show only that document's sessions
    // Otherwise show all sessions grouped by document
    let sessions: SessionInfo[] = allSessions.map((s) => ({
      sessionId: s.sessionId,
      itemId: s.itemId,
      itemName: s.itemName,
      messageCount: s.messageCount,
      lastMessage: s.lastMessage,
      lastUpdated: s.lastUpdated,
      isEmpty: s.isEmpty,
      sessionTitle: s.sessionTitle,
    }));

    // Document isolation: if we have a selected document and not in library view,
    // only show sessions for that document
    let groupByDocument = false;
    let documentName: string | undefined;

    if (inLibraryView) {
      // In library view: show all sessions grouped by document name
      groupByDocument = true;
      ztoolkit.log(
        "[HistoryDropdown] In library view, showing all sessions grouped by document",
      );
    } else if (currentItemId !== undefined && currentItemId !== null) {
      // In reader view with a selected document: show only that document's sessions
      sessions = sessions.filter((s) => s.itemId === currentItemId);
      if (sessions.length > 0) {
        documentName = sessions[0]?.itemName;
      }
      ztoolkit.log(
        "[HistoryDropdown] In reader view, showing sessions for document:",
        currentItemId,
      );
    }

    const theme = getCurrentTheme();

    populateHistoryDropdown(
      historyDropdown,
      container.ownerDocument!,
      sessions,
      historyState,
      theme,
      // onSelect callback - switch to selected session
      async (session: SessionInfo) => {
        ztoolkit.log(
          "Switching to session:",
          session.sessionId,
          "for item:",
          session.itemId,
        );
        historyDropdown.style.display = "none";

        // Switch to the selected session
        const loadedSession = await chatManager.switchSession(
          session.itemId,
          session.sessionId,
        );

        if (loadedSession) {
          let itemForSession: Zotero.Item | null = null;

          if (session.itemId === 0) {
            // Global chat - use fake item with id 0
            itemForSession = { id: 0 } as Zotero.Item;
          } else {
            try {
              const item = await Zotero.Items.getAsync(session.itemId);
              if (item) {
                itemForSession = item as Zotero.Item;
              } else {
                // Item was deleted - create a placeholder with the original itemId
                // This ensures session tracking remains consistent
                ztoolkit.log(
                  "Item not found, creating placeholder for session:",
                  session.itemId,
                );
                itemForSession = { id: session.itemId } as Zotero.Item;
              }
            } catch {
              // Error fetching item - create a placeholder with the original itemId
              ztoolkit.log(
                "Error fetching item, creating placeholder for session:",
                session.itemId,
              );
              itemForSession = { id: session.itemId } as Zotero.Item;
            }
          }

          // Always set the current item
          context.setCurrentItem(itemForSession);
          context.updatePdfCheckboxVisibility(itemForSession);

          // Update active session tracking for this container
          setActiveSessionId(session.itemId, session.sessionId);

          // Also update ChatPanelManager's session tracking
          const { setContainerActiveSession } =
            await import("./ChatPanelManager");
          setContainerActiveSession(
            container,
            session.itemId,
            session.sessionId,
          );

          // Check if the target session is currently streaming
          const sessionState = getSessionStreamingState(
            session.itemId,
            session.sessionId,
          );

          // Also check if there's an empty assistant message at the end
          // This indicates we're waiting for AI response
          const lastMessage =
            loadedSession.messages[loadedSession.messages.length - 1];
          const hasEmptyAssistantMessage =
            lastMessage?.role === "assistant" &&
            (!lastMessage.content || lastMessage.content === "");

          // Should show streaming UI if:
          // 1. State says we're streaming, OR
          // 2. There's an empty assistant message (waiting for response)
          const shouldShowStreaming =
            sessionState.isStreaming || hasEmptyAssistantMessage;

          ztoolkit.log(
            "[SessionSwitch] Session:",
            session.sessionId,
            "isStreaming:",
            sessionState.isStreaming,
            "hasEmptyAssistant:",
            hasEmptyAssistantMessage,
            "shouldShowStreaming:",
            shouldShowStreaming,
          );

          // Render messages with correct streaming state
          const chatHistory = container.querySelector(
            "#chat-history",
          ) as HTMLElement;
          const emptyState = container.querySelector(
            "#chat-empty-state",
          ) as HTMLElement;
          if (chatHistory) {
            const { renderMessages } = await import("./MessageRenderer");
            renderMessages(
              chatHistory,
              emptyState,
              loadedSession.messages,
              getCurrentTheme(),
              shouldShowStreaming,
            );

            // If the session is streaming, ensure streaming scroll is active
            if (shouldShowStreaming) {
              const { startStreamingScroll } =
                await import("./AutoScrollManager");
              startStreamingScroll(chatHistory);
            }
          }

          // Update send button state based on the new session's state
          const sendButton = container.querySelector(
            "#chat-send-button",
          ) as HTMLButtonElement;
          if (sendButton) {
            const shouldDisable =
              sessionState.isStreaming ||
              sessionState.isSending ||
              hasEmptyAssistantMessage;
            sendButton.disabled = shouldDisable;
            sendButton.style.opacity = shouldDisable ? "0.5" : "1";
            sendButton.style.cursor = shouldDisable ? "not-allowed" : "pointer";
          }
        }
      },
      // onDelete callback
      async (session: SessionInfo) => {
        ztoolkit.log(
          "Deleting session:",
          session.sessionId,
          "for item:",
          session.itemId,
        );

        // Delete the session
        await chatManager.deleteSession(session.itemId, session.sessionId);

        // Check if this is the currently displayed session
        const currentItem = context.getCurrentItem();
        const isCurrentSession =
          currentItem &&
          currentItem.id === session.itemId &&
          (await import("./StreamingStateManager")).getActiveSessionIdForItem(
            session.itemId,
          ) === session.sessionId;

        // If deleted session was currently displayed, update UI to show new session
        if (isCurrentSession) {
          const newSession = await chatManager.getActiveSession(session.itemId);
          if (newSession) {
            // Update container session tracking
            setActiveSessionId(session.itemId, newSession.id);
            const { setContainerActiveSession } =
              await import("./ChatPanelManager");
            setContainerActiveSession(container, session.itemId, newSession.id);

            // Update UI to show empty state (new session)
            const chatHistory = container.querySelector(
              "#chat-history",
            ) as HTMLElement;
            const emptyState = container.querySelector(
              "#chat-empty-state",
            ) as HTMLElement;
            if (chatHistory && emptyState) {
              const { renderMessages } = await import("./MessageRenderer");
              renderMessages(
                chatHistory,
                emptyState,
                newSession.messages,
                getCurrentTheme(),
                false,
              );
            }
          }
        }

        // Refresh the dropdown to reflect the deletion
        await refreshHistoryDropdown();
      },
      // documentName - PDF document name displayed at top (only for single document view)
      documentName,
      // onExport callback - export session as note
      async (session: SessionInfo) => {
        ztoolkit.log(
          "Exporting session as note:",
          session.sessionId,
          "for item:",
          session.itemId,
        );

        // Load the full session data
        const fullSession = await chatManager.getSessionWithTitle(
          session.itemId,
          session.sessionId,
        );

        if (!fullSession) {
          const errorMsg = `Failed to load session for export: ${session.sessionId}`;
          ztoolkit.log(errorMsg);
          throw new Error(errorMsg);
        }

        // Export the session as a note
        const noteExportService = getNoteExportService();
        const result = await noteExportService.exportSessionAsNote(
          fullSession,
          session.itemId,
        );

        // Show result notification
        if (result.success) {
          ztoolkit.log("Note exported successfully:", result.noteItem?.id);
        } else {
          ztoolkit.log("Failed to export note:", result.message);
          throw new Error(result.message);
        }
      },
      // groupByDocument - when true, sessions are grouped by document name
      groupByDocument,
    );
  };

  // Close dropdown when clicking outside
  if (historyDropdown && historyBtn) {
    setupClickOutsideHandler(container, historyDropdown, historyBtn);
  }

  // Subscribe to global history refresh events
  const unsubscribeHistoryRefresh = onHistoryRefresh(async () => {
    ztoolkit.log("[ChatPanelEvents] Received history refresh event");
    await refreshHistoryDropdown();
  });

  // Store unsubscribe function for cleanup
  (container as any)._unsubscribeHistoryRefresh = unsubscribeHistoryRefresh;

  // Model selector
  const modelSelectorBtn = container.querySelector(
    "#chat-model-selector-btn",
  ) as HTMLButtonElement;
  const modelDropdown = container.querySelector(
    "#chat-model-dropdown",
  ) as HTMLElement;

  if (modelSelectorBtn && modelDropdown) {
    // Initialize model selector text
    updateModelSelectorDisplay(container);

    // Subscribe to model changes for synchronization
    const modelStateManager = getModelStateManager();
    const unsubscribeModelChange = modelStateManager.onModelChange(() => {
      // Update display when model changes from other sources
      updateModelSelectorDisplay(container);
    });

    // Store unsubscribe function for cleanup
    (container as any)._unsubscribeModelChange = unsubscribeModelChange;

    // Toggle model dropdown
    modelSelectorBtn.addEventListener("click", () => {
      const isVisible = modelDropdown.style.display === "block";
      if (isVisible) {
        modelDropdown.style.display = "none";
      } else {
        populateModelDropdown(container, modelDropdown, context);
        modelDropdown.style.display = "block";
      }
    });

    // Close model dropdown when clicking outside
    container.ownerDocument?.addEventListener("click", (e: Event) => {
      const target = e.target as HTMLElement;
      if (
        !modelSelectorBtn.contains(target) &&
        !modelDropdown.contains(target)
      ) {
        modelDropdown.style.display = "none";
      }
    });
  }

  // Settings button - open preferences
  const settingsBtn = container.querySelector(
    "#chat-settings-btn",
  ) as HTMLButtonElement;
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      ztoolkit.log("Settings button clicked");
      // Open preferences and navigate to this plugin's pane
      Zotero.Utilities.Internal.openPreferences("zota-prefpane");
    });

    // Hover effect
    settingsBtn.addEventListener("mouseenter", () => {
      settingsBtn.style.background = getCurrentTheme().dropdownItemHoverBg;
    });
    settingsBtn.addEventListener("mouseleave", () => {
      settingsBtn.style.background = "transparent";
    });
  }

  // Panel mode toggle button - switch between sidebar and floating mode
  const panelModeBtn = container.querySelector(
    "#chat-panel-mode-btn",
  ) as HTMLButtonElement;
  if (panelModeBtn) {
    panelModeBtn.addEventListener("click", () => {
      ztoolkit.log("Panel mode toggle button clicked");
      if (togglePanelModeFn) {
        togglePanelModeFn();
      }
    });

    // Hover effect
    panelModeBtn.addEventListener("mouseenter", () => {
      panelModeBtn.style.background = getCurrentTheme().dropdownItemHoverBg;
    });
    panelModeBtn.addEventListener("mouseleave", () => {
      panelModeBtn.style.background = "transparent";
    });
  }

  // Show pin button only in floating mode
  const isFloatingWindow =
    container.ownerDocument?.defaultView?.location.href.includes(
      "chatWindow.xhtml",
    );
  if (pinBtn) {
    pinBtn.style.display = isFloatingWindow ? "flex" : "none";

    // Initialize pin button state based on current preference
    const isCurrentlyPinned = getPref("keepWindowTop") as boolean;
    updatePinButtonState(pinBtn, isCurrentlyPinned);
  }

  // Pin button - toggle window always on top
  pinBtn?.addEventListener("click", () => {
    ztoolkit.log("Pin button clicked");

    // Toggle the preference
    const currentPinned = getPref("keepWindowTop") as boolean;
    setPref("keepWindowTop", !currentPinned);

    // Update button state
    const isPinned = !currentPinned;
    updatePinButtonState(pinBtn, isPinned);

    // Get the current window
    const win = container.ownerDocument?.defaultView;
    if (!win) return;

    // Check if this is a floating window
    const isFloatingWindow = win.location.href.includes("chatWindow.xhtml");
    if (isFloatingWindow) {
      // Mark window as being closed for pin toggle
      (win as any)._isPinToggle = true;

      // Reopen the window to apply the alwaysRaised flag
      win.close();

      // Reopen the panel after a short delay to ensure the window is fully closed
      setTimeout(() => {
        // Import showPanel dynamically to avoid circular dependency
        import("./ChatPanelManager").then(({ showPanel }) => {
          showPanel();
        });
      }, 100);

      ztoolkit.log(
        `Window ${isPinned ? "pinned" : "unpinned"} to top, reopening window...`,
      );
    }
  });

  // Helper function to update pin button state
  function updatePinButtonState(button: HTMLElement, isPinned: boolean) {
    if (!button) return;

    // Update button opacity and color
    button.style.opacity = isPinned ? "1" : "0.6";

    // Update button title based on state
    button.title = getString(isPinned ? "chat-unpin" : "chat-pin");

    // Update pin icon
    const pinIcon = button.querySelector("#chat-pin-icon") as HTMLImageElement;
    if (pinIcon) {
      // Switch between pin and pin-off icons based on state
      pinIcon.src = isPinned
        ? `chrome://${config.addonRef}/content/icons/pin.svg`
        : `chrome://${config.addonRef}/content/icons/pin-off.svg`;
      pinIcon.style.opacity = isPinned ? "1" : "0.6";
    }
  }

  // Close button - close the floating window
  closeBtn?.addEventListener("click", () => {
    ztoolkit.log("Close button clicked");
    const win = container.ownerDocument?.defaultView;
    if (win) {
      win.close();
    }
  });

  ztoolkit.log("Event listeners attached to buttons");
}

/**
 * Update unified reference display with text quote and images
 * This is the main function to update the unified reference container
 */
export function updateQuoteBoxDisplay(
  container: HTMLElement,
  text: string | null,
): void {
  // Get current images from ImageStateManager
  const images = getImages(getCurrentItemIdFromContainer(container));

  updateUnifiedReferenceDisplay(
    container,
    {
      textQuote: text,
      images,
      onRemoveImage: (imageId: string) => {
        removeImage(getCurrentItemIdFromContainer(container), imageId);
        // Refresh display after removal
        const currentText = getCurrentTextQuoteFromContainer(container);
        updateQuoteBoxDisplay(container, currentText);
      },
      onCloseTextQuote: () => {
        // Close text quote only - images remain
        // The actual clearing is handled by the caller through context.clearAttachments
        // Just update the display here
        const imagesAfter = getImages(getCurrentItemIdFromContainer(container));
        if (imagesAfter.length === 0) {
          // No images left, close entire container
          updateUnifiedReferenceDisplay(
            container,
            {
              textQuote: null,
              images: [],
              onRemoveImage: () => {},
              onCloseTextQuote: () => {},
              onCloseAll: () => {},
            },
            getCurrentTheme(),
          );
        }
      },
      onCloseAll: () => {
        // Close entire reference container
        updateUnifiedReferenceDisplay(
          container,
          {
            textQuote: null,
            images: [],
            onRemoveImage: () => {},
            onCloseTextQuote: () => {},
            onCloseAll: () => {},
          },
          getCurrentTheme(),
        );
      },
    },
    getCurrentTheme(),
  );
}

/**
 * Helper to get current item ID from a container
 */
function getCurrentItemIdFromContainer(container: HTMLElement | null): number {
  if (!container) return 0;
  // Try to get from the container's data attribute or context
  // This is a simplified version - the actual implementation may vary
  const context = getContextForContainer(container);
  return context?.getCurrentItem()?.id ?? 0;
}

/**
 * Update attachments preview display
 */
export function updateAttachmentsPreviewDisplay(
  container: HTMLElement,
  attachmentState: AttachmentState,
): void {
  const attachmentsPreview = container.querySelector(
    "#chat-attachments-preview",
  ) as HTMLElement;
  if (!attachmentsPreview) return;

  attachmentsPreview.textContent = "";
  const doc = container.ownerDocument!;

  const tags = [
    ...(attachmentState.pendingSelectedText
      ? [{ text: "\uD83D\uDCDD Selection", type: "selection" }]
      : []),
  ];

  for (const tag of tags) {
    const span = createElement(doc, "span", {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      background: chatColors.attachmentBg,
      border: `1px solid ${chatColors.attachmentBorder}`,
      borderRadius: "12px",
      padding: "4px 12px",
      fontSize: "11px",
      color: chatColors.attachmentText,
    });
    span.textContent = tag.text;
    attachmentsPreview.appendChild(span);
  }

  attachmentsPreview.style.display = tags.length > 0 ? "flex" : "none";
}

/**
 * Send a message
 */
async function sendMessage(
  context: ChatPanelContext,
  messageInput: HTMLTextAreaElement | null,
  sendButton: HTMLButtonElement | null,
  attachPdfCheckbox: HTMLInputElement | null,
  _attachmentsPreview: HTMLElement | null,
  container: HTMLElement,
): Promise<void> {
  const content = messageInput?.value?.trim() || "";
  const images = context.getImages();

  // Don't send if there's no content and no images
  if (!content && images.length === 0) {
    ztoolkit.log("[SendMessage] Empty message, not sending");
    return;
  }

  const { chatManager } = context;

  // Get active reader item first (used for PDF attachment)
  const activeReaderItem = getActiveReaderItem();

  // Use current item or fall back to active reader
  const item = context.getCurrentItem();

  // Determine target item first (needed for getting correct images)
  let targetItem = item;
  if (attachPdfCheckbox?.checked && activeReaderItem) {
    targetItem = activeReaderItem;
  }

  // Always set current item to ensure context is correct
  if (targetItem) {
    context.setCurrentItem(targetItem);
  } else if (!context.getCurrentItem()) {
    // Fallback to global chat if no item is set
    context.setCurrentItem({ id: 0 } as Zotero.Item);
  }

  // Get images after setting the correct current item
  const currentImages = context.getImages();

  // Check provider authentication/readiness
  const providerManager = getProviderManager();
  const activeProvider = providerManager.getActiveProvider();

  if (!activeProvider?.isReady()) {
    ztoolkit.log("Provider not ready");
    return;
  }

  // Set sending state for this container and disable send button
  setIsSendingMessageForContainer(container, true);
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.style.opacity = "0.5";
    sendButton.style.cursor = "not-allowed";
  }

  // Get attachment state before clearing
  const attachmentState = context.getAttachmentState();
  const shouldAttachPdf =
    attachPdfCheckbox?.checked && activeReaderItem !== null;

  // Clear input immediately after getting the content
  if (messageInput) {
    messageInput.value = "";
    messageInput.style.height = "auto";
  }
  // Clear global input text and sync to all views
  setGlobalInputText("");
  // Reset history navigation
  resetHistoryNavigation();
  // Add to input history
  if (content) {
    addToInputHistory(content);
  }

  context.clearAttachments();
  context.updateAttachmentsPreview();

  // Get selected text from PDF if available
  let selectedText = attachmentState.pendingSelectedText;

  // If no pending selected text and user hasn't cancelled the quote,
  // try to get it directly from the PDF reader
  if (!selectedText && activeReaderItem && !attachmentState.isQuoteCancelled) {
    selectedText = chatManager.getSelectedText();
    if (selectedText) {
      ztoolkit.log(
        "[SendMessage] Got selected text from PDF reader:",
        selectedText.substring(0, 50),
      );
    }
  }

  // Build attachment options (shared between global and item chat)
  const attachmentOptions = {
    selectedText: selectedText || undefined,
  };

  // Get documents from context
  const currentDocuments = context.getDocuments();

  // Get the item ID for clearing images (targetItem is already set above)
  const currentItemId = targetItem?.id ?? 0;

  // Clear images immediately when user sends message (before waiting for response)
  ztoolkit.log("[SendMessage] Clearing images for item:", currentItemId);
  clearImages(currentItemId);
  ztoolkit.log(
    "[SendMessage] Images after clear:",
    getImages(currentItemId).length,
  );
  // Clear documents after getting them
  if (currentDocuments.length > 0) {
    ztoolkit.log(
      "[SendMessage] Clearing documents, count:",
      currentDocuments.length,
    );
    context.clearDocuments();
  }
  // Update unified reference display in both containers immediately
  // Pass null to explicitly clear the display (not fetch from state)
  updateUnifiedReferenceForItem(currentItemId, null);
  ztoolkit.log("[SendMessage] Unified reference display updated");

  try {
    // Start auto-scroll for streaming
    const chatHistory = container.querySelector("#chat-history") as HTMLElement;
    if (chatHistory) {
      startStreamingScroll(chatHistory);
    }

    // Send message (unified API handles both global and item-bound chat)
    // Note: This is a fire-and-forget operation, we don't await it
    // The sending state will be reset by onMessageComplete or onError callback
    chatManager
      .sendMessage(content, {
        item: targetItem,
        attachPdf: shouldAttachPdf,
        images: currentImages.length > 0 ? currentImages : undefined,
        documents: currentDocuments.length > 0 ? currentDocuments : undefined,
        ...attachmentOptions,
      })
      .catch((error) => {
        ztoolkit.log("Error in sendMessage:", error);
        // Re-enable send button on error
        setIsSendingMessageForContainer(container, false);
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.style.opacity = "1";
          sendButton.style.cursor = "pointer";
        }
        messageInput?.focus();
      });
  } catch (error) {
    ztoolkit.log("Error in sendMessage:", error);
    // Re-enable send button on error
    setIsSendingMessageForContainer(container, false);
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.style.opacity = "1";
      sendButton.style.cursor = "pointer";
    }
    messageInput?.focus();
  }
}

/**
 * Update PDF checkbox visibility based on ACTIVE READER state
 * Checkbox is only visible when user is viewing a PDF in reader
 * This is independent of the current chat context/history
 */
export async function updatePdfCheckboxVisibilityForItem(
  container: HTMLElement,
  _item: Zotero.Item | null, // Ignored - we always check active reader
  chatManager: { hasPdfAttachment(item: Zotero.Item): Promise<boolean> },
): Promise<void> {
  const pdfLabel = container.querySelector("#chat-pdf-label") as HTMLElement;
  if (!pdfLabel) return;

  // Always check the active reader item, not the chat context
  const activeReaderItem = getActiveReaderItem();

  if (!activeReaderItem) {
    // No reader active - hide checkbox
    pdfLabel.style.display = "none";
    ztoolkit.log("PDF checkbox hidden: no active reader");
    return;
  }

  const hasPdf = await chatManager.hasPdfAttachment(activeReaderItem);
  pdfLabel.style.display = hasPdf ? "flex" : "none";
  ztoolkit.log(
    "PDF checkbox visibility based on active reader:",
    hasPdf ? "visible" : "hidden",
  );
}

/**
 * Focus the message input
 */
export function focusInput(container: HTMLElement): void {
  const messageInput = container.querySelector(
    "#chat-message-input",
  ) as HTMLTextAreaElement;
  messageInput?.focus();
}

/**
 * Update model selector display with current model
 */
export function updateModelSelectorDisplay(container: HTMLElement): void {
  const modelSelectorText = container.querySelector(
    "#chat-model-selector-text",
  ) as HTMLElement;
  if (!modelSelectorText) return;

  const modelStateManager = getModelStateManager();
  const currentModel = modelStateManager.getCurrentModel();

  // Show model name if selected, otherwise show default text
  if (currentModel) {
    // Show model name only (truncated)
    const modelShort =
      currentModel.length > 25
        ? currentModel.substring(0, 23) + "..."
        : currentModel;
    modelSelectorText.textContent = modelShort;
  } else {
    // Show default text when no model selected
    modelSelectorText.textContent = getString("chat-select-model");
  }
}

/**
 * Populate model dropdown with providers and their models
 */
function populateModelDropdown(
  container: HTMLElement,
  dropdown: HTMLElement,
  context: ChatPanelContext,
): void {
  const doc = container.ownerDocument!;
  const theme = getCurrentTheme();
  dropdown.textContent = "";

  const providerManager = getProviderManager();
  const providers = providerManager.getConfiguredProviders();
  const activeProviderId = providerManager.getActiveProviderId();
  const currentModel = getPref("model") as string;

  for (const provider of providers) {
    // Provider section header - show "Model List" instead of provider name
    // Sticky header that stays visible when scrolling
    const sectionHeader = createElement(doc, "div", {
      padding: "8px 12px",
      fontSize: "11px",
      fontWeight: "600",
      color: theme.textMuted,
      background: theme.buttonBg,
      borderBottom: `1px solid ${theme.borderColor}`,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      position: "sticky",
      top: "0",
      zIndex: "1",
    });
    sectionHeader.textContent = getString("chat-model-list-title");
    dropdown.appendChild(sectionHeader);

    // Get models for this provider
    const config = provider.config;
    const models = config.availableModels || [];
    const isActiveProvider = config.id === activeProviderId;

    if (models.length === 0) {
      // No models - show placeholder
      const noModels = createElement(doc, "div", {
        padding: "8px 12px",
        fontSize: "12px",
        color: theme.textMuted,
        fontStyle: "italic",
      });
      noModels.textContent = getString("chat-no-models");
      dropdown.appendChild(noModels);
    } else {
      // List models
      for (const model of models) {
        const isCurrentModel = isActiveProvider && model === currentModel;

        const modelItem = createElement(doc, "div", {
          padding: "8px 12px",
          fontSize: "12px",
          color: isCurrentModel ? theme.textPrimary : theme.textPrimary,
          cursor: "pointer",
          background: isCurrentModel
            ? theme.dropdownItemHoverBg
            : "transparent",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        });

        // Checkmark for current model
        if (isCurrentModel) {
          const check = createElement(doc, "span", {
            color: theme.textPrimary,
            fontWeight: "bold",
          });
          check.textContent = "✓";
          modelItem.appendChild(check);
        }

        const modelName = createElement(doc, "span", {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        });
        modelName.textContent = formatModelLabel(model);
        modelItem.appendChild(modelName);

        // Hover effect
        modelItem.addEventListener("mouseenter", () => {
          if (!isCurrentModel) {
            modelItem.style.background = theme.dropdownItemHoverBg;
          }
        });
        modelItem.addEventListener("mouseleave", () => {
          if (!isCurrentModel) {
            modelItem.style.background = "transparent";
          }
        });

        // Click to select model
        modelItem.addEventListener("click", () => {
          // Use ModelStateManager to set model (ensures synchronization)
          const modelStateManager = getModelStateManager();
          modelStateManager.setModel(model, config.id);

          // Update display and close dropdown
          updateModelSelectorDisplay(container);
          dropdown.style.display = "none";

          ztoolkit.log(`Model switched to: ${config.id}/${model}`);
        });

        dropdown.appendChild(modelItem);
      }
    }
  }

  // If no providers configured
  if (providers.length === 0) {
    const noProviders = createElement(doc, "div", {
      padding: "12px",
      fontSize: "12px",
      color: theme.textMuted,
      textAlign: "center",
    });
    noProviders.textContent = getString("chat-configure-provider");
    dropdown.appendChild(noProviders);
  }
}

/**
 * Handle dropped data from drag events
 * Supports Zotero annotation images, image files, documents, and text
 */
async function handleDroppedData(
  dataTransfer: DataTransfer,
  context: ChatPanelContext,
  messageInput: HTMLTextAreaElement | null,
): Promise<void> {
  const parsedData = await parseDataTransfer(dataTransfer);
  const currentItemId = context.getCurrentItem()?.id ?? 0;

  switch (parsedData.type) {
    case "zotero/item": {
      const { items } = parsedData;
      ztoolkit.log("[DragDrop] Adding document references:", items.length);

      // Get max documents limit from provider config
      const providerManager = getProviderManager();
      const activeProviderId = providerManager.getActiveProviderId();
      const providerConfig = providerManager.getProviderConfig(
        activeProviderId,
      ) as ApiKeyProviderConfig | null;
      const maxDocuments = providerConfig?.maxDocuments ?? 3;

      ztoolkit.log(
        "[DragDrop] Max documents limit from config:",
        maxDocuments,
        "providerId:",
        activeProviderId,
      );

      // Limit the number of documents
      const limitedItems = items.slice(0, maxDocuments);
      if (items.length > maxDocuments) {
        ztoolkit.log(
          `[DragDrop] Limited documents from ${items.length} to ${maxDocuments}`,
        );
      }

      // Convert to DocumentReference format and set documents
      const documents = limitedItems.map((item) => ({
        id: item.id,
        title: item.title,
        creators: item.creators,
        year: item.year,
      }));

      setDocuments(documents);

      // Update unified reference display to show documents
      updateUnifiedReferenceForDocuments();

      // Focus input after drop
      messageInput?.focus();

      ztoolkit.log("[DragDrop] Document references added successfully");
      break;
    }

    case "zotero/annotation-image": {
      const { image, libraryID, key, mimeType } = parsedData;
      const id = `${libraryID}/${key}`;

      ztoolkit.log(
        "[DragDrop] Adding annotation image:",
        id,
        "mimeType:",
        mimeType,
        "Image data length:",
        image.length,
      );

      addImageFromBase64(currentItemId, image, mimeType, `Figure (${id})`);

      updateUnifiedReferenceForItem(currentItemId, undefined, context);

      ztoolkit.log("[DragDrop] Annotation image added successfully");
      break;
    }

    case "image-file": {
      const { file } = parsedData;
      ztoolkit.log("[DragDrop] Adding image file:", file.name);

      await context.addImage(file);

      updateUnifiedReferenceForItem(currentItemId, undefined, context);

      ztoolkit.log("[DragDrop] Image file added successfully");
      break;
    }

    case "text/plain": {
      const { text } = parsedData;
      if (text && messageInput) {
        messageInput.value += text;
        setGlobalInputText(messageInput.value);
        messageInput.focus();
      }
      break;
    }

    default:
      ztoolkit.log("[DragDrop] Unknown drop type, ignoring");
  }
}

/**
 * Update unified reference display for documents
 * Shows document references in both sidebar and floating containers
 */
function updateUnifiedReferenceForDocuments(): void {
  const documents = getDocuments();
  const chatContainer = getChatContainer();
  const floatingContainer = getFloatingContainer();
  const theme = getCurrentTheme();

  ztoolkit.log(
    "[updateUnifiedReferenceForDocuments] documents count:",
    documents.length,
  );

  // Create handlers for document removal
  const handleRemoveDocument = (documentId: number) => {
    removeDocument(documentId);
    // Refresh display
    updateUnifiedReferenceForDocuments();
  };

  const handleCloseAll = () => {
    clearDocuments();
    // Refresh display
    updateUnifiedReferenceForDocuments();
  };

  if (chatContainer) {
    updateUnifiedReferenceDisplayForDocuments(
      chatContainer,
      {
        documents,
        onRemoveDocument: handleRemoveDocument,
        onCloseAll: handleCloseAll,
      },
      theme,
    );
  }
  if (floatingContainer) {
    updateUnifiedReferenceDisplayForDocuments(
      floatingContainer,
      {
        documents,
        onRemoveDocument: handleRemoveDocument,
        onCloseAll: handleCloseAll,
      },
      theme,
    );
  }
}

/**
 * Update unified reference display to show document references
 */
function updateUnifiedReferenceDisplayForDocuments(
  container: HTMLElement,
  options: {
    documents: Array<{
      id: number;
      title: string;
      creators?: string;
      year?: number;
    }>;
    onRemoveDocument: (documentId: number) => void;
    onCloseAll: () => void;
  },
  theme: {
    borderColor: string;
    textMuted: string;
    inputBg: string;
    referenceCloseBtnBg: string;
    referenceCloseBtnHoverBg: string;
    referenceCloseBtnColor: string;
    referenceCloseBtnHoverColor: string;
  },
): void {
  const unifiedContainer = container.querySelector(
    "#chat-unified-reference-container",
  ) as HTMLElement;

  if (!unifiedContainer) return;

  const doc = container.ownerDocument;
  if (!doc) return;

  // If no documents, hide the container
  if (options.documents.length === 0) {
    unifiedContainer.style.display = "none";
    return;
  }

  // Show the container
  unifiedContainer.style.display = "flex";

  // Clear existing content
  unifiedContainer.textContent = "";

  // Create document reference section
  const documentSection = createElement(
    doc,
    "div",
    {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      width: "100%",
    },
    { id: "chat-document-reference-section" },
  );

  // Create header with title and close button
  const header = createElement(
    doc,
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "4px",
    },
    { class: "document-reference-header" },
  );

  const title = createElement(
    doc,
    "span",
    {
      fontSize: "11px",
      fontWeight: "600",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    },
    { class: "document-reference-title" },
  );
  // Use localized string with document count
  const label = getString("chat-document-label");
  title.textContent = `${label} (${options.documents.length})`;

  const closeBtn = createElement(
    doc,
    "button",
    {
      width: "20px",
      height: "20px",
      borderRadius: "4px",
      border: "none",
      background: theme.referenceCloseBtnBg,
      color: theme.referenceCloseBtnColor,
      fontSize: "14px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      opacity: "0.7",
      transition: "opacity 0.2s ease",
    },
    { title: getString("chat-close") },
  );
  closeBtn.textContent = "×";

  closeBtn.addEventListener("click", () => {
    options.onCloseAll();
  });

  closeBtn.addEventListener("mouseenter", () => {
    closeBtn.style.opacity = "1";
    closeBtn.style.background = theme.referenceCloseBtnHoverBg;
    closeBtn.style.color = theme.referenceCloseBtnHoverColor;
  });
  closeBtn.addEventListener("mouseleave", () => {
    closeBtn.style.opacity = "0.7";
    closeBtn.style.background = theme.referenceCloseBtnBg;
    closeBtn.style.color = theme.referenceCloseBtnColor;
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create document list
  const documentList = createElement(
    doc,
    "div",
    {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    },
    { class: "document-reference-list" },
  );

  options.documents.forEach((document) => {
    const docItem = createElement(
      doc,
      "div",
      {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 8px",
        background: theme.inputBg,
        borderRadius: "6px",
        border: `1px solid ${theme.borderColor}`,
      },
      { "data-document-id": String(document.id) },
    );

    // Document info
    const docInfo = createElement(doc, "div", {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      flex: "1",
      overflow: "hidden",
    });

    // Title
    const docTitle = createElement(
      doc,
      "span",
      {
        fontSize: "12px",
        fontWeight: "500",
        color: theme.textMuted,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      { class: "document-title" },
    );
    docTitle.textContent = document.title;
    docTitle.title = document.title;

    docInfo.appendChild(docTitle);

    // Creators and year
    if (document.creators || document.year) {
      const metaInfo = createElement(
        doc,
        "span",
        {
          fontSize: "10px",
          color: theme.textMuted,
          opacity: "0.7",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
        { class: "document-meta" },
      );
      const metaParts: string[] = [];
      if (document.creators) {
        metaParts.push(document.creators);
      }
      if (document.year) {
        metaParts.push(`(${document.year})`);
      }
      metaInfo.textContent = metaParts.join(" ");
      docInfo.appendChild(metaInfo);
    }

    // Remove button
    const removeBtn = createElement(
      doc,
      "button",
      {
        width: "18px",
        height: "18px",
        borderRadius: "4px",
        border: "none",
        background: "transparent",
        color: theme.textMuted,
        fontSize: "12px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0",
        opacity: "0.6",
        transition: "opacity 0.2s ease",
        flexShrink: "0",
        marginLeft: "8px",
      },
      { title: getString("chat-delete") },
    );
    removeBtn.textContent = "×";

    removeBtn.addEventListener("click", () => {
      options.onRemoveDocument(document.id);
    });

    removeBtn.addEventListener("mouseenter", () => {
      removeBtn.style.opacity = "1";
      removeBtn.style.background = theme.referenceCloseBtnHoverBg;
      removeBtn.style.color = theme.referenceCloseBtnHoverColor;
    });
    removeBtn.addEventListener("mouseleave", () => {
      removeBtn.style.opacity = "0.6";
      removeBtn.style.background = "transparent";
      removeBtn.style.color = theme.textMuted;
    });

    docItem.appendChild(docInfo);
    docItem.appendChild(removeBtn);
    documentList.appendChild(docItem);
  });

  documentSection.appendChild(header);
  documentSection.appendChild(documentList);
  unifiedContainer.appendChild(documentSection);
}
