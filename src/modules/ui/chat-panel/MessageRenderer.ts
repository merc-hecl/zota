/**
 * MessageRenderer - Create and manage message bubble elements
 */

import type { ChatMessage } from "../../chat";
import { chatColors } from "../../../utils/colors";
import type { ThemeColors } from "./types";
import { HTML_NS, SVG_NS } from "./types";
import { renderMarkdownToElement } from "./MarkdownRenderer";
import { createElement, copyToClipboard } from "./ChatPanelBuilder";
import { getString } from "../../../utils/locale";

/**
 * Format timestamp to "yy/mm/dd hh:mm:ss" format
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Create a copy button element with text content
 */
function createCopyButton(doc: Document, content: string): HTMLElement {
  const copyBtn = createElement(
    doc,
    "button",
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "16px",
      padding: "0",
      margin: "0",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      opacity: "0.6",
      transition: "opacity 0.2s ease",
    },
    { class: "chat-copy-btn", title: getString("chat-copy-message") },
  );

  // Copy icon SVG
  const copyIcon = doc.createElementNS(SVG_NS, "svg");
  copyIcon.setAttribute("width", "14");
  copyIcon.setAttribute("height", "14");
  copyIcon.setAttribute("viewBox", "0 0 24 24");
  copyIcon.setAttribute("fill", "none");
  copyIcon.setAttribute("stroke", "currentColor");
  copyIcon.setAttribute("stroke-width", "2");
  copyIcon.setAttribute("stroke-linecap", "round");
  copyIcon.setAttribute("stroke-linejoin", "round");

  // Copy icon paths
  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "9");
  rect.setAttribute("y", "9");
  rect.setAttribute("width", "13");
  rect.setAttribute("height", "13");
  rect.setAttribute("rx", "2");
  rect.setAttribute("ry", "2");

  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  );

  copyIcon.appendChild(rect);
  copyIcon.appendChild(path);
  copyBtn.appendChild(copyIcon);

  // Hover effect
  copyBtn.addEventListener("mouseenter", () => {
    copyBtn.style.opacity = "1";
  });
  copyBtn.addEventListener("mouseleave", () => {
    copyBtn.style.opacity = "0.6";
  });

  // Click handler with animation
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    copyToClipboard(content);

    // Replace SVG with checkmark text
    copyBtn.textContent = "✓";
    copyBtn.style.opacity = "1";
    copyBtn.style.fontSize = "12px";
    copyBtn.style.fontWeight = "600";

    // Revert after 0.8 seconds
    setTimeout(() => {
      // Fade out
      copyBtn.style.transition = "opacity 0.15s ease";
      copyBtn.style.opacity = "0";

      setTimeout(() => {
        // Restore copy icon
        copyBtn.textContent = "";
        copyBtn.appendChild(copyIcon);
        copyBtn.style.opacity = "0.6";
        copyBtn.style.transition = "opacity 0.2s ease";
      }, 150);
    }, 800);
  });

  return copyBtn;
}

/**
 * Create a message element for display in chat history
 */
export function createMessageElement(
  doc: Document,
  msg: ChatMessage,
  theme: ThemeColors,
  isLastAssistant: boolean = false,
  isGloballyStreaming: boolean = false,
): HTMLElement {
  const wrapper = createElement(
    doc,
    "div",
    {
      display: "block",
      margin: "10px 0",
      textAlign: msg.role === "user" ? "right" : "left",
    },
    { class: `chat-message ${msg.role}-message` },
  );

  // 根据角色设置气泡样式
  let bubbleStyle: Record<string, string>;
  if (msg.role === "user") {
    bubbleStyle = {
      background: chatColors.userBubble,
      color: chatColors.userBubbleText,
      borderBottomRightRadius: "4px",
    };
  } else if (msg.role === "error") {
    bubbleStyle = {
      background: chatColors.errorBubbleBg,
      color: chatColors.errorBubbleText,
      border: `1px solid ${chatColors.errorBubbleBorder}`,
      borderBottomLeftRadius: "4px",
    };
  } else {
    bubbleStyle = {
      background: theme.assistantBubbleBg,
      color: theme.textPrimary,
      border: `1px solid ${theme.borderColor}`,
      borderBottomLeftRadius: "4px",
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.08)",
    };
  }

  const bubble = createElement(
    doc,
    "div",
    {
      position: "relative",
      display: "inline-block",
      maxWidth: "85%",
      padding: "12px 16px",
      borderRadius: "14px",
      wordWrap: "break-word",
      textAlign: "left",
      ...bubbleStyle,
    },
    { class: "chat-bubble" },
  );

  const contentAttrs: Record<string, string> = { class: "chat-content" };
  if (msg.role === "assistant" && isLastAssistant) {
    contentAttrs.id = "chat-streaming-content";
  }

  const content = createElement(
    doc,
    "div",
    {
      fontSize: "14px",
      lineHeight: "1.6",
      whiteSpace: "pre-wrap",
      userSelect: "text",
      cursor: "text",
    },
    contentAttrs,
  );

  // Store raw content for copying
  let rawContent = msg.content;

  if (msg.role === "user") {
    // Extract question content
    const questionContent = msg.content.includes("[Question]:")
      ? msg.content.split("[Question]:").pop()?.trim() || msg.content
      : msg.content;

    // If there's selected text, create a styled quote section
    if (msg.selectedText) {
      // Create container for quote + question
      const userContentContainer = createElement(doc, "div", {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      });

      // Create quote card with subtle background
      const quoteCard = createElement(doc, "div", {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "10px 12px",
        background: "rgba(255, 255, 255, 0.15)",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.2)",
      });

      // Quote header with icon and label
      const quoteHeader = createElement(doc, "div", {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "10px",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        opacity: "0.85",
      });

      // Quote icon
      const quoteIcon = createElement(doc, "span", {
        fontSize: "14px",
        fontWeight: "bold",
        lineHeight: "1",
      });
      quoteIcon.textContent = "❝";

      const quoteLabel = createElement(doc, "span", {});
      quoteLabel.textContent = getString("chat-quote-label");

      quoteHeader.appendChild(quoteIcon);
      quoteHeader.appendChild(quoteLabel);

      // Quote text content with italic style
      const quoteText = createElement(doc, "div", {
        fontSize: "12px",
        lineHeight: "1.5",
        opacity: "0.95",
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "-webkit-box",
        webkitLineClamp: "3",
        webkitBoxOrient: "vertical",
        fontStyle: "italic",
        paddingLeft: "4px",
      });
      quoteText.textContent = msg.selectedText;

      quoteCard.appendChild(quoteHeader);
      quoteCard.appendChild(quoteText);

      // Question text with slightly larger font
      const questionText = createElement(doc, "div", {
        fontSize: "14px",
        lineHeight: "1.5",
      });
      questionText.textContent = questionContent;

      userContentContainer.appendChild(quoteCard);
      userContentContainer.appendChild(questionText);

      content.appendChild(userContentContainer);
      rawContent = questionContent;
    } else {
      // No selected text, just show question
      content.textContent = questionContent;
      rawContent = questionContent;
    }
  } else if (msg.role === "error") {
    // 错误消息显示为纯文本，带警告图标
    // 尝试解析 JSON 错误消息以获取更友好的显示
    let errorDisplay = msg.content;
    try {
      // 尝试从 "API Error: 403 - {json}" 格式中提取错误信息
      const jsonMatch = msg.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const errorJson = JSON.parse(jsonMatch[0]);
        if (errorJson.error?.message) {
          errorDisplay = errorJson.error.message;
        }
      }
    } catch {
      // 解析失败，使用原始内容
    }
    content.textContent = `⚠️ ${errorDisplay}`;
    rawContent = errorDisplay;
  } else {
    // Render assistant message as markdown
    renderMarkdownToElement(content, msg.content);
  }

  bubble.appendChild(content);
  wrapper.appendChild(bubble);

  // Create metadata row (timestamp + copy button)
  const metaRow = createElement(
    doc,
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
      gap: "8px",
      marginTop: "4px",
      padding: "0 4px",
    },
    { class: "chat-message-meta" },
  );

  if (msg.role === "assistant") {
    // For assistant messages: copy button first, then timestamp
    // Only show copy button and timestamp if:
    // 1. Not the last assistant message (historical message), OR
    // 2. The last assistant message but not currently streaming globally AND has content
    const isComplete =
      !isLastAssistant ||
      (!isGloballyStreaming && rawContent.trim().length > 0);

    if (isComplete) {
      // Copy button
      const copyBtn = createCopyButton(doc, rawContent);
      metaRow.appendChild(copyBtn);

      // Timestamp - only show when message is complete
      const timestamp = createElement(
        doc,
        "span",
        {
          fontSize: "11px",
          color: theme.textMuted,
          userSelect: "none",
        },
        { class: "chat-timestamp" },
      );
      timestamp.textContent = formatTimestamp(msg.timestamp);
      metaRow.appendChild(timestamp);
    }
  } else {
    // For user/error messages: only timestamp
    const timestamp = createElement(
      doc,
      "span",
      {
        fontSize: "11px",
        color: theme.textMuted,
        userSelect: "none",
      },
      { class: "chat-timestamp" },
    );
    timestamp.textContent = formatTimestamp(msg.timestamp);
    metaRow.appendChild(timestamp);
  }

  wrapper.appendChild(metaRow);
  return wrapper;
}

/**
 * Render all messages to the chat history element
 */
export function renderMessages(
  chatHistory: HTMLElement,
  emptyState: HTMLElement | null,
  messages: ChatMessage[],
  theme: ThemeColors,
  isGloballyStreaming: boolean = false,
): void {
  const doc = chatHistory.ownerDocument;
  if (!doc) return;

  ztoolkit.log("renderMessages called, count:", messages.length);

  // Remove only message elements, preserve emptyState
  const messageElements = chatHistory.querySelectorAll(
    ".chat-message, .message-wrapper",
  );
  messageElements.forEach((el) => el.remove());

  if (messages.length === 0) {
    if (emptyState) {
      // Ensure emptyState is in the DOM
      if (!emptyState.parentElement) {
        chatHistory.appendChild(emptyState);
      }
      emptyState.style.display = "flex";
    }
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  // Find the last assistant message index for streaming content ID
  let lastAssistantIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIndex = i;
      break;
    }
  }

  // Render each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLastAssistant = i === lastAssistantIndex;
    chatHistory.appendChild(
      createMessageElement(
        doc,
        msg,
        theme,
        isLastAssistant,
        isGloballyStreaming,
      ),
    );
  }

  // Note: Scrolling is now handled by AutoScrollManager
  // Only scroll here if not in streaming mode
  const scrollManager = (chatHistory as any)._scrollManager;
  if (!scrollManager || !scrollManager.isAutoScrolling()) {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }
}
