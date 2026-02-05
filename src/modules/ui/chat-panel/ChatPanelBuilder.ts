/**
 * ChatPanelBuilder - Build all DOM elements for the chat panel
 */

import { config } from "../../../../package.json";
import { getString } from "../../../utils/locale";
import { chatColors } from "../../../utils/colors";
import type { ThemeColors } from "./types";
import { HTML_NS, SVG_NS } from "./types";

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
      fontSize: "14px",
      color: theme.textMuted,
    },
    { id: "chat-close-btn", title: getString("chat-close") },
  );
  closeBtn.textContent = "✕";

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

  // Text Selection Quote Box - appears between toolbar and input area
  const quoteBox = createElement(
    doc,
    "div",
    {
      display: "none",
      flexDirection: "column",
      padding: "12px 16px",
      background: "rgba(59, 130, 246, 0.08)",
      borderTop: `1px solid ${theme.borderColor}`,
      borderBottom: `1px solid ${theme.borderColor}`,
      position: "relative",
    },
    { id: "chat-quote-box" },
  );

  // Quote box header with label and close button
  const quoteBoxHeader = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  });

  // Quote label with icon
  const quoteLabel = createElement(doc, "div", {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "11px",
    color: "#3b82f6",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.3px",
  });

  // Quote icon (quotation mark)
  const quoteIcon = createElement(doc, "span", {
    fontSize: "16px",
    color: "#3b82f6",
    fontWeight: "bold",
    lineHeight: "1",
  });
  quoteIcon.textContent = "❝";

  const quoteLabelText = createElement(doc, "span", {});
  quoteLabelText.textContent = getString("chat-quote-label");

  quoteLabel.appendChild(quoteIcon);
  quoteLabel.appendChild(quoteLabelText);

  // Close button
  const quoteCloseBtn = createElement(
    doc,
    "button",
    {
      width: "20px",
      height: "20px",
      background: "rgba(0, 0, 0, 0.06)",
      border: "none",
      borderRadius: "50%",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      fontSize: "12px",
      color: theme.textMuted,
      transition: "all 0.2s ease",
    },
    { id: "chat-quote-close-btn", title: "Remove quote" },
  );
  quoteCloseBtn.textContent = "✕";

  // Hover effect for close button
  quoteCloseBtn.addEventListener("mouseenter", () => {
    quoteCloseBtn.style.background = "rgba(0, 0, 0, 0.1)";
    quoteCloseBtn.style.color = theme.textPrimary;
  });
  quoteCloseBtn.addEventListener("mouseleave", () => {
    quoteCloseBtn.style.background = "rgba(0, 0, 0, 0.06)";
    quoteCloseBtn.style.color = theme.textMuted;
  });

  quoteBoxHeader.appendChild(quoteLabel);
  quoteBoxHeader.appendChild(quoteCloseBtn);

  // Quote content container with card style
  const quoteContent = createElement(
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
    },
    { id: "chat-quote-content" },
  );

  quoteBox.appendChild(quoteBoxHeader);
  quoteBox.appendChild(quoteContent);

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

  // Send button - paper plane shaped button
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
      color: "#1a1a1a",
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

  // Paper plane SVG icon - larger size, fold line from tail center
  const sendIcon = doc.createElementNS(SVG_NS, "svg");
  sendIcon.setAttribute("width", "25");
  sendIcon.setAttribute("height", "40");
  sendIcon.setAttribute("viewBox", "0 0 24 24");
  sendIcon.setAttribute("fill", "currentColor");
  sendIcon.style.display = "block";
  sendIcon.style.marginTop = "18px";
  sendIcon.style.marginRight = "0px";

  // 3 speed lines behind plane - horizontally aligned with plane center
  const speedLineTop = doc.createElementNS(SVG_NS, "rect");
  speedLineTop.setAttribute("x", "0");
  speedLineTop.setAttribute("y", "8");
  speedLineTop.setAttribute("width", "3");
  speedLineTop.setAttribute("height", "1.5");
  speedLineTop.setAttribute("rx", "0.75");
  speedLineTop.setAttribute("fill", "currentColor");
  speedLineTop.setAttribute("opacity", "0.5");
  sendIcon.appendChild(speedLineTop);

  const speedLineMiddle = doc.createElementNS(SVG_NS, "rect");
  speedLineMiddle.setAttribute("x", "2");
  speedLineMiddle.setAttribute("y", "11");
  speedLineMiddle.setAttribute("width", "3");
  speedLineMiddle.setAttribute("height", "1.5");
  speedLineMiddle.setAttribute("rx", "0.75");
  speedLineMiddle.setAttribute("fill", "currentColor");
  speedLineMiddle.setAttribute("opacity", "0.7");
  sendIcon.appendChild(speedLineMiddle);

  const speedLineBottom = doc.createElementNS(SVG_NS, "rect");
  speedLineBottom.setAttribute("x", "0");
  speedLineBottom.setAttribute("y", "14");
  speedLineBottom.setAttribute("width", "3");
  speedLineBottom.setAttribute("height", "1.5");
  speedLineBottom.setAttribute("rx", "0.75");
  speedLineBottom.setAttribute("fill", "currentColor");
  speedLineBottom.setAttribute("opacity", "0.5");
  sendIcon.appendChild(speedLineBottom);

  // Main plane body - all rounded corners, pointing right
  const planeBody = doc.createElementNS(SVG_NS, "path");
  planeBody.setAttribute(
    "d",
    "M21.5 12C21.5 12.3 21.3 12.6 21 12.7L6.5 17.5C6 17.7 5.5 17.3 5.7 16.8L7.5 12L5.7 7.2C5.5 6.7 6 6.3 6.5 6.5L21 11.3C21.3 11.4 21.5 11.7 21.5 12Z",
  );
  sendIcon.appendChild(planeBody);

  // Center fold line - starts from tail center
  const foldLine = doc.createElementNS(SVG_NS, "path");
  foldLine.setAttribute("d", "M7.5 12L13 12");
  foldLine.setAttribute("stroke", "#fff");
  foldLine.setAttribute("stroke-width", "1.2");
  foldLine.setAttribute("stroke-linecap", "round");
  foldLine.setAttribute("fill", "none");
  sendIcon.appendChild(foldLine);

  sendButton.appendChild(sendIcon);

  // Hover effect via event listeners
  sendButton.addEventListener("mouseenter", () => {
    sendButton.style.color = "#333333";
    sendButton.style.transform = "translateY(-1px) scale(1.1)";
  });

  sendButton.addEventListener("mouseleave", () => {
    sendButton.style.color = "#1a1a1a";
    sendButton.style.transform = "translateY(0) scale(1)";
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

  // Pin icon (text)
  const pinIcon = createElement(doc, "span", {
    fontSize: "16px",
    opacity: "0.6",
  });
  pinIcon.textContent = "📌";
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
  root.appendChild(quoteBox);
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
