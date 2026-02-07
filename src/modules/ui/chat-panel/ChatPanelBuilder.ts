/**
 * ChatPanelBuilder - Build all DOM elements for the chat panel
 */

import { config } from "../../../../package.json";
import { getString } from "../../../utils/locale";
import { chatColors } from "../../../utils/colors";
import type { ThemeColors } from "./types";
import { HTML_NS, SVG_NS } from "./types";
import { getCurrentTheme } from "./ChatPanelTheme";

/**
 * Helper to create an element with styles (using proper HTML namespace for XHTML)
 */
export function createElement(
  doc: Document,
  tag: string,
  styles: Partial<CSSStyleDeclaration> = {},
  attrs: Record<string, string> = {},
): HTMLElement {
  const el = doc.createElementNS(HTML_NS, tag) as HTMLElement;
  Object.assign(el.style, styles);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

/**
 * Create the chat container element using DOM API
 */
export function createChatContainer(
  doc: Document,
  theme: ThemeColors,
): HTMLElement {
  // Main container
  const container = createElement(
    doc,
    "div",
    {
      display: "none",
      position: "fixed",
      backgroundColor: theme.containerBg,
      overflow: "hidden",
      borderLeft: `1px solid ${theme.borderColor}`,
      zIndex: "10000",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: "13px",
      pointerEvents: "auto",
    },
    { id: `${config.addonRef}-chat-container` },
  );

  // Root wrapper
  const root = createElement(
    doc,
    "div",
    {
      display: "flex",
      flexDirection: "column",
      height: "100%",
    },
    { class: "chat-panel-root" },
  );

  // Drag bar (only visible in floating mode)
  const dragBar = createElement(
    doc,
    "div",
    {
      display: "none",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      background: theme.toolbarBg,
      borderBottom: `1px solid ${theme.borderColor}`,
      cursor: "move",
      userSelect: "none",
    },
    { id: "chat-drag-bar" },
  );

  const dragTitle = createElement(doc, "span", {
    fontSize: "13px",
    fontWeight: "600",
    color: theme.textPrimary,
    pointerEvents: "none",
  });
  dragTitle.textContent = "Zota";

  const closeBtn = createElement(
    doc,
    "button",
    {
      width: "20px",
      height: "20px",
      background: "transparent",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      color: theme.textMuted,
    },
    { id: "chat-close-btn", title: getString("chat-close") },
  );

  // Close icon
  const closeIcon = createElement(doc, "img", {
    width: "14px",
    height: "14px",
    opacity: "0.7",
  });
  (closeIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/close.svg`;
  closeBtn.appendChild(closeIcon);

  dragBar.appendChild(dragTitle);
  dragBar.appendChild(closeBtn);

  // Chat History
  const chatHistory = createElement(
    doc,
    "div",
    {
      flex: "1",
      overflowY: "auto",
      overflowX: "hidden",
      padding: "14px",
      background: theme.chatHistoryBg,
    },
    { id: "chat-history" },
  );

  // Empty State - Quote display
  const emptyState = createElement(
    doc,
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      minHeight: "280px",
      padding: "48px",
      textAlign: "center",
      boxSizing: "border-box",
    },
    { id: "chat-empty-state", class: "chat-empty-state" },
  );

  // Quote container with quotation mark decoration
  const quoteContainer = createElement(
    doc,
    "div",
    {
      position: "relative",
      maxWidth: "480px",
      padding: "32px 40px",
    },
    { class: "chat-quote-container" },
  );

  // Opening quotation mark
  const openQuote = createElement(
    doc,
    "span",
    {
      position: "absolute",
      top: "0",
      left: "0",
      fontSize: "64px",
      fontFamily: '"Georgia", "Times New Roman", serif',
      color: "rgba(45, 90, 135, 0.2)",
      lineHeight: "1",
      userSelect: "none",
    },
    { class: "chat-quote-mark open" },
  );
  openQuote.textContent = "\u201C";

  // Quote text
  const quoteText = createElement(
    doc,
    "p",
    {
      fontSize: "20px",
      fontFamily: '"Georgia", "Times New Roman", "Songti SC", serif',
      fontWeight: "400",
      color: "#3a4a5c",
      lineHeight: "1.8",
      margin: "0 0 16px 0",
      textAlign: "center",
      letterSpacing: "0.5px",
    },
    { class: "chat-quote-text" },
  );
  quoteText.textContent = getString("chat-empty-title");

  // Quote subtitle (attribution)
  const quoteSubtitle = createElement(
    doc,
    "p",
    {
      fontSize: "14px",
      fontFamily: '"Georgia", "Times New Roman", "Songti SC", serif',
      fontWeight: "400",
      color: "#5a6a7c",
      lineHeight: "1.5",
      margin: "0",
      textAlign: "right",
      letterSpacing: "0.3px",
      fontStyle: "italic",
    },
    { class: "chat-quote-subtitle" },
  );
  quoteSubtitle.textContent = getString("chat-empty-subtitle");

  // Closing quotation mark
  const closeQuote = createElement(
    doc,
    "span",
    {
      position: "absolute",
      bottom: "-16px",
      right: "0",
      fontSize: "64px",
      fontFamily: '"Georgia", "Times New Roman", serif',
      color: "rgba(45, 90, 135, 0.2)",
      lineHeight: "1",
      userSelect: "none",
    },
    { class: "chat-quote-mark close" },
  );
  closeQuote.textContent = "\u201D";

  quoteContainer.appendChild(openQuote);
  quoteContainer.appendChild(quoteText);
  quoteContainer.appendChild(quoteSubtitle);
  quoteContainer.appendChild(closeQuote);
  emptyState.appendChild(quoteContainer);
  chatHistory.appendChild(emptyState);

  // Toolbar
  const toolbar = createElement(
    doc,
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "10px 14px",
      background: theme.toolbarBg,
      borderTop: `1px solid ${theme.borderColor}`,
      flexWrap: "wrap",
      gap: "10px",
    },
    { id: "chat-toolbar" },
  );

  // PDF checkbox
  const pdfLabel = createElement(
    doc,
    "label",
    {
      display: "none",
      alignItems: "center",
      gap: "6px",
      fontSize: "12px",
      color: theme.textSecondary,
      cursor: "pointer",
    },
    { id: "chat-pdf-label" },
  );

  const pdfCheckbox = createElement(
    doc,
    "input",
    {
      margin: "0",
      cursor: "pointer",
    },
    { type: "checkbox", id: "chat-attach-pdf" },
  ) as HTMLInputElement;

  const pdfText = createElement(doc, "span", {});
  pdfText.textContent = getString("chat-attach-pdf");

  const pdfStatus = createElement(
    doc,
    "span",
    {
      fontSize: "11px",
      color: theme.textMuted,
      marginLeft: "4px",
    },
    { id: "chat-pdf-status" },
  );

  pdfLabel.appendChild(pdfCheckbox);
  pdfLabel.appendChild(pdfText);
  pdfLabel.appendChild(pdfStatus);

  // Toolbar buttons
  const toolbarButtons = createElement(doc, "div", {
    display: "flex",
    gap: "6px",
  });

  const btnStyle: Partial<CSSStyleDeclaration> = {
    background: theme.buttonBg,
    border: `1px solid ${theme.inputBorderColor}`,
    borderRadius: "4px",
    padding: "5px 10px",
    cursor: "pointer",
    fontSize: "15px",
    color: theme.textPrimary,
  };

  const iconStyle: Partial<CSSStyleDeclaration> = {
    width: "16px",
    height: "16px",
  };

  // New chat button
  const newChatBtn = createElement(doc, "button", btnStyle, {
    id: "chat-new",
    title: getString("chat-new-chat"),
  });
  const newChatIcon = createElement(doc, "img", iconStyle, {
    src: `chrome://${config.addonRef}/content/icons/newlybuild.svg`,
  });
  newChatBtn.appendChild(newChatIcon);

  // History button
  const historyBtn = createElement(doc, "button", btnStyle, {
    id: "chat-history-btn",
    title: getString("chat-history"),
  });
  const historyIcon = createElement(doc, "img", iconStyle, {
    src: `chrome://${config.addonRef}/content/icons/history.svg`,
  });
  historyBtn.appendChild(historyIcon);

  toolbarButtons.appendChild(newChatBtn);
  toolbarButtons.appendChild(historyBtn);

  toolbar.appendChild(pdfLabel);
  toolbar.appendChild(toolbarButtons);

  // Attachments Preview
  const attachmentsPreview = createElement(
    doc,
    "div",
    {
      display: "none",
      flexWrap: "wrap",
      gap: "8px",
      padding: "10px 14px",
      background: theme.attachmentPreviewBg,
      borderTop: `1px solid ${theme.borderColor}`,
    },
    { id: "chat-attachments-preview" },
  );

  // Unified Reference Container - combines text quote and image preview
  // Using neutral gray tone to match the panel style
  const unifiedReferenceContainer = createElement(
    doc,
    "div",
    {
      display: "none",
      flexDirection: "column",
      padding: "12px 16px",
      background: theme.referenceBg,
      borderTop: `1px solid ${theme.borderColor}`,
      borderBottom: `1px solid ${theme.borderColor}`,
      position: "relative",
      animation: "fadeIn 0.3s ease-out",
    },
    { id: "chat-unified-reference-container" },
  );

  // Add fade-in animation keyframes
  const styleEl = doc.createElementNS(HTML_NS, "style") as HTMLStyleElement;
  styleEl.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  doc.head?.appendChild(styleEl);

  // Unified header with label and close button
  const unifiedHeader = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "10px",
  });

  // Reference label with icon - using theme color
  const referenceLabel = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    color: theme.referenceLabelColor,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.3px",
  });

  // Reference icon
  const referenceIcon = createElement(doc, "span", {
    fontSize: "14px",
    color: theme.referenceLabelColor,
    fontWeight: "bold",
    lineHeight: "1",
  });
  referenceIcon.textContent = "❝";

  const referenceLabelText = createElement(doc, "span", {});
  referenceLabelText.textContent = getString("chat-reference-label");

  referenceLabel.appendChild(referenceIcon);
  referenceLabel.appendChild(referenceLabelText);

  // Close button for entire reference container
  const referenceCloseBtn = createElement(
    doc,
    "button",
    {
      width: "20px",
      height: "20px",
      background: theme.referenceCloseBtnBg,
      border: "none",
      borderRadius: "50%",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      fontSize: "12px",
      color: theme.referenceCloseBtnColor,
      transition: "all 0.2s ease",
    },
    { id: "chat-reference-close-btn", title: "Remove all references" },
  );
  referenceCloseBtn.textContent = "✕";

  // Hover effect for close button
  referenceCloseBtn.addEventListener("mouseenter", () => {
    referenceCloseBtn.style.background = theme.referenceCloseBtnHoverBg;
    referenceCloseBtn.style.color = theme.referenceCloseBtnHoverColor;
  });
  referenceCloseBtn.addEventListener("mouseleave", () => {
    referenceCloseBtn.style.background = theme.referenceCloseBtnBg;
    referenceCloseBtn.style.color = theme.referenceCloseBtnColor;
  });

  unifiedHeader.appendChild(referenceLabel);
  unifiedHeader.appendChild(referenceCloseBtn);

  // Text quote section
  const textQuoteSection = createElement(
    doc,
    "div",
    {
      display: "none",
      flexDirection: "column",
      marginBottom: "10px",
    },
    { id: "chat-text-quote-section" },
  );

  // Text quote header
  const textQuoteHeader = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "6px",
  });

  const textQuoteLabel = createElement(doc, "span", {
    fontSize: "10px",
    color: theme.referenceLabelColor,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: "0.2px",
  });
  textQuoteLabel.textContent = getString("chat-text-quote-label");

  // Close button for text quote only
  const textQuoteCloseBtn = createElement(
    doc,
    "button",
    {
      width: "16px",
      height: "16px",
      background: "transparent",
      border: "none",
      borderRadius: "50%",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      fontSize: "10px",
      color: theme.referenceCloseBtnColor,
      opacity: "0.7",
      transition: "all 0.2s ease",
    },
    { id: "chat-text-quote-close-btn", title: "Remove text quote" },
  );
  textQuoteCloseBtn.textContent = "✕";

  textQuoteCloseBtn.addEventListener("mouseenter", () => {
    textQuoteCloseBtn.style.opacity = "1";
    textQuoteCloseBtn.style.background = theme.referenceCloseBtnBg;
  });
  textQuoteCloseBtn.addEventListener("mouseleave", () => {
    textQuoteCloseBtn.style.opacity = "0.7";
    textQuoteCloseBtn.style.background = "transparent";
  });

  textQuoteHeader.appendChild(textQuoteLabel);
  textQuoteHeader.appendChild(textQuoteCloseBtn);

  // Text quote content
  const textQuoteContent = createElement(
    doc,
    "div",
    {
      fontSize: "13px",
      color: theme.textPrimary,
      lineHeight: "1.6",
      maxHeight: "72px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      display: "-webkit-box",
      webkitLineClamp: "3",
      webkitBoxOrient: "vertical",
      padding: "10px 14px",
      background: theme.inputBg,
      borderRadius: "8px",
      border: `1px solid ${theme.borderColor}`,
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
      fontStyle: "italic",
      userSelect: "text",
      webkitUserSelect: "text",
      cursor: "text",
    },
    { id: "chat-text-quote-content" },
  );

  textQuoteSection.appendChild(textQuoteHeader);
  textQuoteSection.appendChild(textQuoteContent);

  // Image preview section
  const imagePreviewSection = createElement(
    doc,
    "div",
    {
      display: "none",
      flexDirection: "column",
    },
    { id: "chat-image-preview-section" },
  );

  // Image preview header
  const imagePreviewHeader = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "6px",
  });

  const imagePreviewLabel = createElement(doc, "span", {
    fontSize: "10px",
    color: theme.referenceLabelColor,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: "0.2px",
  });
  imagePreviewLabel.textContent = getString("chat-image-label");

  imagePreviewHeader.appendChild(imagePreviewLabel);

  // Images grid container
  const imagesGrid = createElement(
    doc,
    "div",
    {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      padding: "10px 14px",
      background: theme.inputBg,
      borderRadius: "8px",
      border: `1px solid ${theme.borderColor}`,
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
    },
    { id: "chat-images-grid" },
  );

  imagePreviewSection.appendChild(imagePreviewHeader);
  imagePreviewSection.appendChild(imagesGrid);

  unifiedReferenceContainer.appendChild(unifiedHeader);
  unifiedReferenceContainer.appendChild(textQuoteSection);
  unifiedReferenceContainer.appendChild(imagePreviewSection);

  // Input Area - ChatBox style with vertical layout
  const inputArea = createElement(doc, "div", {
    display: "flex",
    flexDirection: "column",
    padding: "14px",
    background: theme.inputAreaBg,
    borderTop: `1px solid ${theme.borderColor}`,
  });

  // Input wrapper - contains textarea and send button
  const inputWrapper = createElement(
    doc,
    "div",
    {
      display: "flex",
      position: "relative",
      border: `1px solid ${theme.inputBorderColor}`,
      borderRadius: "12px",
      background: theme.inputBg,
      overflow: "hidden",
    },
    { id: "chat-input-wrapper" },
  );

  const messageInput = createElement(
    doc,
    "textarea",
    {
      flex: "1",
      minHeight: "60px",
      maxHeight: "140px",
      padding: "12px 48px 12px 14px",
      border: "none",
      fontFamily: "inherit",
      fontSize: "14px",
      resize: "none",
      outline: "none",
      background: "transparent",
      color: theme.textPrimary,
      boxSizing: "border-box",
    },
    {
      id: "chat-message-input",
      rows: "3",
      placeholder: getString("chat-input-placeholder"),
    },
  ) as HTMLTextAreaElement;

  // Send button
  const sendButton = createElement(
    doc,
    "button",
    {
      position: "absolute",
      right: "6px",
      bottom: "6px",
      width: "32px",
      height: "32px",
      background: "transparent",
      border: "none",
      borderRadius: "0",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      padding: "0",
      zIndex: "1",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    },
    { id: "chat-send-button" },
  );

  // Send icon
  const sendIcon = createElement(doc, "img", {
    width: "20px",
    height: "20px",
    opacity: "0.8",
  });
  (sendIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/send.svg`;
  sendButton.appendChild(sendIcon);

  // Hover effect via event listeners
  sendButton.addEventListener("mouseenter", () => {
    sendButton.style.transform = "translateY(-1px) scale(1.1)";
    const icon = sendButton.querySelector("img");
    if (icon) icon.style.opacity = "1";
  });

  sendButton.addEventListener("mouseleave", () => {
    sendButton.style.transform = "translateY(0) scale(1)";
    const icon = sendButton.querySelector("img");
    if (icon) icon.style.opacity = "0.8";
  });

  sendButton.addEventListener("mousedown", () => {
    sendButton.style.transform = "translateY(0) scale(0.95)";
  });

  sendButton.addEventListener("mouseup", () => {
    sendButton.style.transform = "translateY(-1px) scale(1.05)";
  });

  inputWrapper.appendChild(messageInput);
  inputWrapper.appendChild(sendButton);

  // Bottom bar - model selector + settings on left, send button on right
  const inputBottomBar = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "10px",
  });

  // Left side container (model selector + settings button)
  const leftContainer = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });

  // Model selector container
  const modelSelectorContainer = createElement(doc, "div", {
    position: "relative",
  });

  // Model selector button
  const modelSelectorBtn = createElement(
    doc,
    "button",
    {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 12px",
      background: theme.buttonBg,
      border: `1px solid ${theme.inputBorderColor}`,
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "12px",
      color: theme.textSecondary,
      maxWidth: "200px",
    },
    { id: "chat-model-selector-btn" },
  );

  const modelSelectorText = createElement(
    doc,
    "span",
    {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    { id: "chat-model-selector-text" },
  );
  modelSelectorText.textContent = getString("chat-select-model");

  const modelSelectorArrow = createElement(doc, "span", {
    fontSize: "10px",
    opacity: "0.6",
  });
  modelSelectorArrow.textContent = "▼";

  modelSelectorBtn.appendChild(modelSelectorText);
  modelSelectorBtn.appendChild(modelSelectorArrow);

  // Model dropdown
  const modelDropdown = createElement(
    doc,
    "div",
    {
      display: "none",
      position: "absolute",
      bottom: "100%",
      left: "0",
      marginBottom: "4px",
      minWidth: "220px",
      maxWidth: "300px",
      maxHeight: "300px",
      overflowY: "auto",
      background: theme.dropdownBg,
      border: `1px solid ${theme.borderColor}`,
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      zIndex: "10002",
    },
    { id: "chat-model-dropdown" },
  );

  modelSelectorContainer.appendChild(modelSelectorBtn);
  modelSelectorContainer.appendChild(modelDropdown);

  // Settings button (gear icon)
  const settingsBtn = createElement(
    doc,
    "button",
    {
      width: "28px",
      height: "28px",
      background: "transparent",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
    },
    { id: "chat-settings-btn" },
  );
  settingsBtn.title = getString("chat-open-settings");

  // Settings icon (SVG)
  const settingsIcon = createElement(doc, "img", {
    width: "16px",
    height: "16px",
    opacity: "0.6",
  });
  (settingsIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/config.svg`;
  settingsBtn.appendChild(settingsIcon);

  // Pin button - toggle window always on top
  const pinBtn = createElement(
    doc,
    "button",
    {
      width: "28px",
      height: "28px",
      background: "transparent",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
    },
    { id: "chat-pin-btn" },
  );
  pinBtn.title = getString("chat-pin");

  // Pin icon
  const pinIcon = createElement(doc, "img", {
    width: "16px",
    height: "16px",
    opacity: "0.6",
  });
  (pinIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/pin.svg`;
  pinIcon.id = "chat-pin-icon";
  pinBtn.appendChild(pinIcon);

  // Panel mode toggle button (sidebar/floating)
  const panelModeBtn = createElement(
    doc,
    "button",
    {
      width: "28px",
      height: "28px",
      background: "transparent",
      border: "none",
      borderRadius: "6px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
    },
    { id: "chat-panel-mode-btn" },
  );
  panelModeBtn.title = getString("chat-toggle-panel-mode");

  // Panel mode icon (SVG image)
  const panelModeIcon = createElement(
    doc,
    "img",
    {
      width: "16px",
      height: "16px",
      opacity: "0.6",
    },
    { id: "chat-panel-mode-icon" },
  );
  // Default: sidebar mode, show split icon (click to switch to floating)
  (panelModeIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/split.svg`;
  panelModeBtn.appendChild(panelModeIcon);

  leftContainer.appendChild(modelSelectorContainer);
  leftContainer.appendChild(settingsBtn);
  leftContainer.appendChild(pinBtn);
  leftContainer.appendChild(panelModeBtn);

  inputBottomBar.appendChild(leftContainer);

  inputArea.appendChild(inputWrapper);
  inputArea.appendChild(inputBottomBar);

  // History dropdown panel - append to container for proper positioning
  const historyDropdown = createElement(
    doc,
    "div",
    {
      display: "none",
      position: "absolute",
      bottom: "120px",
      right: "10px",
      width: "300px",
      maxHeight: "350px",
      overflowY: "auto",
      background: theme.dropdownBg,
      border: `1px solid ${theme.borderColor}`,
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      zIndex: "10001",
    },
    { id: "chat-history-dropdown" },
  );

  // Assemble
  root.appendChild(dragBar);
  root.appendChild(chatHistory);
  root.appendChild(toolbar);
  root.appendChild(attachmentsPreview);
  root.appendChild(unifiedReferenceContainer);
  root.appendChild(inputArea);
  root.appendChild(historyDropdown);
  container.appendChild(root);

  doc.documentElement?.appendChild(container);
  return container;
}

/**
 * Copy text to clipboard using Zotero-compatible method
 */
export function copyToClipboard(text: string): void {
  try {
    const win = Zotero.getMainWindow() as Window & {
      navigator?: Navigator;
      document: Document;
    };

    // Use XPCOM clipboard
    const clipboardHelper = (
      Components.classes as Record<
        string,
        { getService(iface: unknown): { copyString(text: string): void } }
      >
    )["@mozilla.org/widget/clipboardhelper;1"]?.getService(
      (Components.interfaces as unknown as Record<string, unknown>)
        .nsIClipboardHelper,
    );

    if (clipboardHelper) {
      clipboardHelper.copyString(text);
      ztoolkit.log("Copied to clipboard via nsIClipboardHelper");
      return;
    }

    // Fallback: try native clipboard API
    if (win.navigator?.clipboard?.writeText) {
      win.navigator.clipboard.writeText(text);
      ztoolkit.log("Copied to clipboard via navigator.clipboard");
      return;
    }

    // Fallback: use execCommand
    const textarea = win.document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    win.document.body?.appendChild(textarea);
    textarea.select();
    win.document.execCommand("copy");
    win.document.body?.removeChild(textarea);
    ztoolkit.log("Copied to clipboard via execCommand");
  } catch (e) {
    ztoolkit.log("Copy to clipboard failed:", e);
  }
}

/**
 * Create an image preview element for the input area
 */
export function createImagePreviewElement(
  doc: Document,
  imageData: { id: string; base64: string; mimeType: string },
  onRemove: (imageId: string) => void,
  theme: { borderColor: string; textMuted: string },
): HTMLElement {
  const container = createElement(
    doc,
    "div",
    {
      position: "relative",
      width: "64px",
      height: "64px",
      borderRadius: "8px",
      overflow: "hidden",
      border: `1px solid ${theme.borderColor}`,
      flexShrink: "0",
    },
    { "data-image-id": imageData.id },
  );

  // Image element
  const img = createElement(doc, "img", {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  }) as HTMLImageElement;
  img.src = `data:${imageData.mimeType};base64,${imageData.base64}`;
  img.alt = "Uploaded image";

  // Remove button
  const removeBtn = createElement(
    doc,
    "button",
    {
      position: "absolute",
      top: "2px",
      right: "2px",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      border: "none",
      background: "rgba(0, 0, 0, 0.5)",
      color: "#fff",
      fontSize: "12px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      lineHeight: "1",
      opacity: "0.8",
      transition: "opacity 0.2s ease",
    },
    { title: "Remove image" },
  );
  removeBtn.textContent = "×";

  // Hover effects
  removeBtn.addEventListener("mouseenter", () => {
    removeBtn.style.opacity = "1";
    removeBtn.style.background = "rgba(0, 0, 0, 0.7)";
  });
  removeBtn.addEventListener("mouseleave", () => {
    removeBtn.style.opacity = "0.8";
    removeBtn.style.background = "rgba(0, 0, 0, 0.5)";
  });

  // Click handler
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onRemove(imageData.id);
  });

  container.appendChild(img);
  container.appendChild(removeBtn);

  return container;
}

/**
 * Update unified reference container display
 * Shows/hides text quote and image sections based on content
 */
export function updateUnifiedReferenceDisplay(
  container: HTMLElement,
  options: {
    textQuote: string | null;
    images: Array<{ id: string; base64: string; mimeType: string }>;
    onRemoveImage: (imageId: string) => void;
    onCloseTextQuote: () => void;
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
  const textQuoteSection = container.querySelector(
    "#chat-text-quote-section",
  ) as HTMLElement;
  const textQuoteContent = container.querySelector(
    "#chat-text-quote-content",
  ) as HTMLElement;
  const imagePreviewSection = container.querySelector(
    "#chat-image-preview-section",
  ) as HTMLElement;
  const imagesGrid = container.querySelector(
    "#chat-images-grid",
  ) as HTMLElement;

  if (!unifiedContainer) return;

  const doc = container.ownerDocument;
  if (!doc) return;

  // Update text quote section
  if (options.textQuote && textQuoteSection && textQuoteContent) {
    textQuoteContent.textContent = options.textQuote;
    textQuoteSection.style.display = "flex";

    // Setup close button for text quote
    const textQuoteCloseBtn = textQuoteSection.querySelector(
      "#chat-text-quote-close-btn",
    ) as HTMLButtonElement;
    if (textQuoteCloseBtn) {
      // Remove old listeners by cloning
      const newCloseBtn = textQuoteCloseBtn.cloneNode(
        true,
      ) as HTMLButtonElement;
      textQuoteCloseBtn.parentNode?.replaceChild(
        newCloseBtn,
        textQuoteCloseBtn,
      );

      newCloseBtn.addEventListener("click", () => {
        options.onCloseTextQuote();
      });

      // Re-apply hover effects
      newCloseBtn.addEventListener("mouseenter", () => {
        newCloseBtn.style.opacity = "1";
        newCloseBtn.style.background = theme.referenceCloseBtnBg;
      });
      newCloseBtn.addEventListener("mouseleave", () => {
        newCloseBtn.style.opacity = "0.7";
        newCloseBtn.style.background = "transparent";
      });
    }
  } else if (textQuoteSection) {
    textQuoteSection.style.display = "none";
  }

  // Update image preview section
  if (imagesGrid) {
    imagesGrid.textContent = "";

    if (options.images.length > 0) {
      options.images.forEach((imageData) => {
        const previewEl = createImagePreviewElement(
          doc,
          imageData,
          options.onRemoveImage,
          theme,
        );
        imagesGrid.appendChild(previewEl);
      });

      if (imagePreviewSection) {
        imagePreviewSection.style.display = "flex";
      }
    } else if (imagePreviewSection) {
      imagePreviewSection.style.display = "none";
    }
  }

  // Setup close all button
  const referenceCloseBtn = unifiedContainer.querySelector(
    "#chat-reference-close-btn",
  ) as HTMLButtonElement;
  if (referenceCloseBtn) {
    // Remove old listeners by cloning
    const newCloseBtn = referenceCloseBtn.cloneNode(true) as HTMLButtonElement;
    referenceCloseBtn.parentNode?.replaceChild(newCloseBtn, referenceCloseBtn);

    newCloseBtn.addEventListener("click", () => {
      options.onCloseAll();
    });

    // Re-apply hover effects
    newCloseBtn.addEventListener("mouseenter", () => {
      newCloseBtn.style.background = theme.referenceCloseBtnHoverBg;
      newCloseBtn.style.color = theme.referenceCloseBtnHoverColor;
    });
    newCloseBtn.addEventListener("mouseleave", () => {
      newCloseBtn.style.background = theme.referenceCloseBtnBg;
      newCloseBtn.style.color = theme.referenceCloseBtnColor;
    });
  }

  // Show/hide entire container based on whether there's any content
  const hasTextQuote = !!options.textQuote;
  const hasImages = options.images.length > 0;

  if (hasTextQuote || hasImages) {
    unifiedContainer.style.display = "flex";
  } else {
    unifiedContainer.style.display = "none";
  }
}
