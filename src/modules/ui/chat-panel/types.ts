/**
 * Chat Panel Types - Shared interfaces for chat panel modules
 */

import type { ChatManager, ChatMessage } from "../../chat";

// Theme colors interface
export interface ThemeColors {
  // Backgrounds
  containerBg: string;
  chatHistoryBg: string;
  toolbarBg: string;
  inputAreaBg: string;
  inputBg: string;
  userBubbleBg: string;
  assistantBubbleBg: string;
  attachmentPreviewBg: string;
  buttonBg: string;
  buttonHoverBg: string;
  dropdownBg: string;
  dropdownItemHoverBg: string;
  // Borders
  borderColor: string;
  inputBorderColor: string;
  inputFocusBorderColor: string;
  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Code
  inlineCodeBg: string;
  inlineCodeColor: string;
  codeBlockBg: string;
  codeBlockColor: string;
  // Other
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  copyBtnBg: string;
}

// Session info for history dropdown
export interface SessionInfo {
  sessionId: string;
  itemId: number;
  itemName: string;
  messageCount: number;
  lastMessage: string;
  lastUpdated: number;
  isEmpty: boolean;
  sessionTitle?: string; // AI生成的会话标题
}

// Attachment state for pending uploads
export interface AttachmentState {
  pendingSelectedText: string | null;
  pendingSelectedTextDocumentId: number | null;
  isQuoteCancelled: boolean;
}

// Context passed to event handlers
export interface ChatPanelContext {
  container: HTMLElement;
  chatManager: ChatManager;
  getCurrentItem: () => Zotero.Item | null;
  setCurrentItem: (item: Zotero.Item | null) => void;
  getTheme: () => ThemeColors;
  getAttachmentState: () => AttachmentState;
  clearAttachments: (cancelled?: boolean) => void;
  updateAttachmentsPreview: () => void;
  updatePdfCheckboxVisibility: (item: Zotero.Item | null) => Promise<void>;
  renderMessages: (messages: ChatMessage[]) => void;
  appendError: (errorMessage: string) => void;
}

// HTML namespace for XHTML environment
export const HTML_NS = "http://www.w3.org/1999/xhtml";

// SVG namespace for SVG elements
export const SVG_NS = "http://www.w3.org/2000/svg";
