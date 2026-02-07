/**
 * ChatPanelTheme - Theme management and dark mode support
 */

import type { ThemeColors } from "./types";

// Light theme colors - Minimal Neutral Theme
export const lightTheme: ThemeColors = {
  containerBg: "#f7f9fb",
  chatHistoryBg: "#f7f9fb",
  toolbarBg: "#fff",
  inputAreaBg: "#fff",
  inputBg: "#fff",
  userBubbleBg: "#e5e7eb",
  assistantBubbleBg: "#fff",
  attachmentPreviewBg: "#f3f4f6",
  buttonBg: "#f0f4f8",
  buttonHoverBg: "#e1e8f0",
  dropdownBg: "#fff",
  dropdownItemHoverBg: "#f0f4f8",
  borderColor: "#d0dce8",
  inputBorderColor: "#cbd5e0",
  inputFocusBorderColor: "#6b7280",
  textPrimary: "#1a202c",
  textSecondary: "#4a5568",
  textMuted: "#718096",
  inlineCodeBg: "#f0f0f0",
  inlineCodeColor: "#e83e8c",
  codeBlockBg: "#1e1e1e",
  codeBlockColor: "#d4d4d4",
  scrollbarThumb: "#c1c1c1",
  scrollbarThumbHover: "#a1a1a1",
  copyBtnBg: "rgba(0,0,0,0.1)",
  // Reference section colors
  referenceLabelColor: "#6b7280",
  referenceBg: "rgba(107, 114, 128, 0.08)",
  referenceCloseBtnBg: "rgba(107, 114, 128, 0.15)",
  referenceCloseBtnHoverBg: "rgba(107, 114, 128, 0.25)",
  referenceCloseBtnColor: "#6b7280",
  referenceCloseBtnHoverColor: "#4b5563",
  // Send button colors
  sendButtonColor: "#1a1a1a",
  sendButtonHoverColor: "#333333",
};

// Dark theme colors - Modern Dark Theme (GitHub Dark inspired)
export const darkTheme: ThemeColors = {
  // Base backgrounds - layered from dark to lighter
  containerBg: "#0d1117", // Main background (darkest)
  chatHistoryBg: "#0d1117", // Chat area background
  toolbarBg: "#161b22", // Toolbar (slightly lighter)
  inputAreaBg: "#161b22", // Input area
  inputBg: "#21262d", // Input field background

  // Message bubbles
  userBubbleBg: "#30363d", // User message - subtle gray (not blue)
  assistantBubbleBg: "#21262d", // Assistant message - subtle card bg

  // Components
  attachmentPreviewBg: "#161b22",
  buttonBg: "#21262d",
  buttonHoverBg: "#30363d",
  dropdownBg: "#161b22",
  dropdownItemHoverBg: "#21262d",

  // Borders - subtle but visible
  borderColor: "#30363d",
  inputBorderColor: "#30363d",
  inputFocusBorderColor: "#58a6ff",

  // Text colors - good contrast hierarchy
  textPrimary: "#f0f6fc", // Primary text (almost white)
  textSecondary: "#c9d1d9", // Secondary text
  textMuted: "#8b949e", // Muted/placeholder text

  // Code
  inlineCodeBg: "#343942",
  inlineCodeColor: "#ff7b72",
  codeBlockBg: "#161b22",
  codeBlockColor: "#c9d1d9",

  // Scrollbar
  scrollbarThumb: "#30363d",
  scrollbarThumbHover: "#484f58",

  // Copy button
  copyBtnBg: "rgba(240,246,252,0.1)",

  // Reference section colors - cohesive with the theme
  referenceLabelColor: "#8b949e",
  referenceBg: "rgba(48, 54, 61, 0.6)",
  referenceCloseBtnBg: "rgba(139, 148, 158, 0.15)",
  referenceCloseBtnHoverBg: "rgba(139, 148, 158, 0.25)",
  referenceCloseBtnColor: "#8b949e",
  referenceCloseBtnHoverColor: "#f0f6fc",

  // Send button colors - inverted from light mode
  sendButtonColor: "#e5e7eb",
  sendButtonHoverColor: "#ffffff",
};

// Current theme state
let currentTheme: ThemeColors = lightTheme;

/**
 * Check if dark mode is enabled
 * 使用多种方法检测，因为 matchMedia 在启动时可能不准确
 */
export function isDarkMode(): boolean {
  const win = Zotero.getMainWindow();
  if (!win) return false;
  const mediaQuery = win.matchMedia?.("(prefers-color-scheme: dark)");
  return mediaQuery?.matches ?? false;
}

/**
 * Get the current cached theme
 */
export function getCurrentTheme(): ThemeColors {
  return currentTheme;
}

/**
 * Update the cached theme
 */
export function updateCurrentTheme(): ThemeColors {
  currentTheme = isDarkMode() ? darkTheme : lightTheme;
  return currentTheme;
}

/**
 * Apply theme colors to container and its children
 */
export function applyThemeToContainer(container: HTMLElement): void {
  const theme = currentTheme;

  // Main container
  container.style.backgroundColor = theme.containerBg;
  container.style.borderLeftColor = theme.borderColor;

  // Chat history
  const chatHistory = container.querySelector("#chat-history") as HTMLElement;
  if (chatHistory) {
    chatHistory.style.background = theme.chatHistoryBg;
  }

  // Empty state
  const emptyState = container.querySelector(
    "#chat-empty-state",
  ) as HTMLElement;
  if (emptyState) {
    emptyState.style.color = theme.textMuted;
  }

  // Toolbar
  const toolbar = container.querySelector("#chat-toolbar") as HTMLElement;
  if (toolbar) {
    toolbar.style.background = theme.toolbarBg;
    toolbar.style.borderTopColor = theme.borderColor;
  }

  // PDF label
  const pdfLabel = container.querySelector("#chat-pdf-label") as HTMLElement;
  if (pdfLabel) {
    pdfLabel.style.color = theme.textSecondary;
  }

  // Toolbar buttons
  container
    .querySelectorAll("#chat-new, #chat-history-btn")
    .forEach((btn: Element) => {
      const el = btn as HTMLElement;
      el.style.background = theme.buttonBg;
      el.style.borderColor = theme.inputBorderColor;
      el.style.color = theme.textPrimary;
    });

  // Attachments preview
  const attachmentsPreview = container.querySelector(
    "#chat-attachments-preview",
  ) as HTMLElement;
  if (attachmentsPreview) {
    attachmentsPreview.style.background = theme.attachmentPreviewBg;
    attachmentsPreview.style.borderTopColor = theme.borderColor;
  }

  // Input area (parent of input wrapper)
  const inputWrapper = container.querySelector(
    "#chat-input-wrapper",
  ) as HTMLElement;
  if (inputWrapper) {
    const inputArea = inputWrapper.parentElement as HTMLElement;
    if (inputArea) {
      inputArea.style.background = theme.inputAreaBg;
      inputArea.style.borderTopColor = theme.borderColor;
    }
    // Input wrapper background and border
    inputWrapper.style.background = theme.inputBg;
    inputWrapper.style.borderColor = theme.inputBorderColor;
  }

  // Message input
  const messageInput = container.querySelector(
    "#chat-message-input",
  ) as HTMLElement;
  if (messageInput) {
    messageInput.style.color = theme.textPrimary;
  }

  // Model selector button
  const modelSelectorBtn = container.querySelector(
    "#chat-model-selector-btn",
  ) as HTMLElement;
  if (modelSelectorBtn) {
    modelSelectorBtn.style.background = theme.buttonBg;
    modelSelectorBtn.style.borderColor = theme.inputBorderColor;
    modelSelectorBtn.style.color = theme.textSecondary;
  }

  // Model dropdown
  const modelDropdown = container.querySelector(
    "#chat-model-dropdown",
  ) as HTMLElement;
  if (modelDropdown) {
    modelDropdown.style.background = theme.dropdownBg;
    modelDropdown.style.borderColor = theme.borderColor;
  }

  // History dropdown
  const historyDropdown = container.querySelector(
    "#chat-history-dropdown",
  ) as HTMLElement;
  if (historyDropdown) {
    historyDropdown.style.background = theme.dropdownBg;
    historyDropdown.style.borderColor = theme.borderColor;
  }

  // Update existing message bubbles
  container
    .querySelectorAll(".assistant-message .chat-bubble")
    .forEach((bubble: Element) => {
      const el = bubble as HTMLElement;
      el.style.background = theme.assistantBubbleBg;
      el.style.color = theme.textPrimary;
      el.style.borderColor = theme.borderColor;
    });

  // Update user message bubbles
  container
    .querySelectorAll(".user-message .chat-bubble")
    .forEach((bubble: Element) => {
      const el = bubble as HTMLElement;
      el.style.background = theme.userBubbleBg;
      el.style.color = theme.textPrimary;
    });

  // Update copy buttons
  container.querySelectorAll(".copy-btn").forEach((btn: Element) => {
    const el = btn as HTMLElement;
    el.style.background = theme.copyBtnBg;
  });

  // Update send button
  const sendButton = container.querySelector(
    "#chat-send-button",
  ) as HTMLElement;
  if (sendButton) {
    sendButton.style.color = theme.sendButtonColor;
  }

  // Update reference section
  const unifiedReferenceContainer = container.querySelector(
    "#chat-unified-reference-container",
  ) as HTMLElement;
  if (unifiedReferenceContainer) {
    unifiedReferenceContainer.style.background = theme.referenceBg;
  }

  // Update text quote content
  const textQuoteContent = container.querySelector(
    "#chat-text-quote-content",
  ) as HTMLElement;
  if (textQuoteContent) {
    textQuoteContent.style.background = theme.inputBg;
    textQuoteContent.style.borderColor = theme.borderColor;
    textQuoteContent.style.color = theme.textPrimary;
  }
}

/**
 * Setup theme change listener
 * @returns cleanup function to remove the listener
 */
export function setupThemeListener(onThemeChange: () => void): () => void {
  const win = Zotero.getMainWindow();
  if (!win?.matchMedia) {
    return () => {};
  }

  const mediaQuery = win.matchMedia("(prefers-color-scheme: dark)");
  if (!mediaQuery) {
    return () => {};
  }

  const handler = () => {
    updateCurrentTheme();
    onThemeChange();
  };

  mediaQuery.addEventListener("change", handler);

  return () => {
    mediaQuery.removeEventListener("change", handler);
  };
}
