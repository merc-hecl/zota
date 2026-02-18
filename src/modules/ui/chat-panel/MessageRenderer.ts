/**
 * MessageRenderer - Create and manage message bubble elements
 */

import { config } from "../../../../package.json";
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

  // Copy icon
  const copyIcon = createElement(doc, "img", {
    width: "14px",
    height: "14px",
  });
  (copyIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/copy.svg`;
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

    // Replace with copy-check icon
    copyBtn.textContent = "";
    const checkIcon = createElement(doc, "img", {
      width: "14px",
      height: "14px",
    });
    (checkIcon as HTMLImageElement).src =
      `chrome://${config.addonRef}/content/icons/copy-check.svg`;
    copyBtn.appendChild(checkIcon);
    copyBtn.style.opacity = "1";

    // Revert after 0.8 seconds
    setTimeout(() => {
      // Fade out
      copyBtn.style.transition = "opacity 0.15s ease";
      copyBtn.style.opacity = "0";

      setTimeout(() => {
        // Restore copy icon
        copyBtn.textContent = "";
        const newCopyIcon = createElement(doc, "img", {
          width: "14px",
          height: "14px",
        });
        (newCopyIcon as HTMLImageElement).src =
          `chrome://${config.addonRef}/content/icons/copy.svg`;
        copyBtn.appendChild(newCopyIcon);
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

  // Set bubble style based on role
  let bubbleStyle: Record<string, string>;
  if (msg.role === "user") {
    bubbleStyle = {
      background: theme.userBubbleBg,
      color: theme.textPrimary,
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

    // Create container for all user content
    const userContentContainer = createElement(doc, "div", {
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    });

    // If there's selected text, create a styled quote section
    if (msg.selectedText) {
      // Create quote card with subtle background (adapts to user bubble color)
      const quoteCard = createElement(doc, "div", {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "10px 12px",
        background: "rgba(255, 255, 255, 0.12)",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.18)",
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
      userContentContainer.appendChild(quoteCard);
    }

    // Display images if present
    if (msg.images && msg.images.length > 0) {
      // Create image card with similar design to quote card
      const imageCard = createElement(doc, "div", {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "10px 12px",
        background: "rgba(255, 255, 255, 0.12)",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        marginTop: msg.selectedText ? "8px" : "0",
      });

      // Image header with icon and label
      const imageHeader = createElement(doc, "div", {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "10px",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        opacity: "0.85",
      });

      // Image icon
      const imageIcon = createElement(doc, "span", {
        fontSize: "12px",
        lineHeight: "1",
      });
      imageIcon.textContent = "🖼️";

      const imageLabel = createElement(doc, "span", {});
      imageLabel.textContent = getString("chat-image-label");

      imageHeader.appendChild(imageIcon);
      imageHeader.appendChild(imageLabel);
      imageCard.appendChild(imageHeader);

      // Images container
      const imagesContainer = createElement(doc, "div", {
        display: "flex",
        flexWrap: "wrap",
        gap: "6px",
      });

      for (const image of msg.images) {
        const imgWrapper = createElement(doc, "div", {
          width: "80px",
          height: "80px",
          borderRadius: "6px",
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          flexShrink: "0",
        });

        const img = createElement(doc, "img", {
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
        }) as HTMLImageElement;
        img.src = `data:${image.mimeType};base64,${image.base64}`;
        img.alt = "Attached image";

        imgWrapper.appendChild(img);
        imagesContainer.appendChild(imgWrapper);
      }

      imageCard.appendChild(imagesContainer);
      userContentContainer.appendChild(imageCard);
    }

    // Display documents if present
    if (msg.documents && msg.documents.length > 0) {
      // Create document card with similar design to quote card
      const documentCard = createElement(doc, "div", {
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "10px 12px",
        background: "rgba(255, 255, 255, 0.12)",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        marginTop:
          msg.selectedText || (msg.images && msg.images.length > 0)
            ? "8px"
            : "0",
      });

      // Document header with icon and label
      const documentHeader = createElement(doc, "div", {
        display: "flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "10px",
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: "0.4px",
        opacity: "0.85",
      });

      // Document icon
      const documentIcon = createElement(doc, "span", {
        fontSize: "12px",
        lineHeight: "1",
      });
      documentIcon.textContent = "📄";

      const documentLabel = createElement(doc, "span", {});
      documentLabel.textContent = getString("chat-document-label");

      documentHeader.appendChild(documentIcon);
      documentHeader.appendChild(documentLabel);
      documentCard.appendChild(documentHeader);

      // Document list container
      const documentListContainer = createElement(doc, "div", {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      });

      for (const document of msg.documents) {
        const docItem = createElement(
          doc,
          "div",
          {
            fontSize: "12px",
            lineHeight: "1.4",
            opacity: "0.95",
            paddingLeft: "4px",
          },
          { class: "document-item" },
        );

        // Build display text: title (creators, year)
        let displayText = document.title;
        const metaParts: string[] = [];
        if (document.creators) {
          metaParts.push(document.creators);
        }
        if (document.year) {
          metaParts.push(`(${document.year})`);
        }
        if (metaParts.length > 0) {
          displayText += ` ${metaParts.join(" ")}`;
        }

        docItem.textContent = displayText;
        documentListContainer.appendChild(docItem);
      }

      documentCard.appendChild(documentListContainer);
      userContentContainer.appendChild(documentCard);
    }

    // Question text with slightly larger font
    if (questionContent) {
      const questionText = createElement(doc, "div", {
        fontSize: "14px",
        lineHeight: "1.5",
        marginTop:
          msg.selectedText ||
          (msg.images && msg.images.length > 0) ||
          (msg.documents && msg.documents.length > 0)
            ? "8px"
            : "0",
      });
      questionText.textContent = questionContent;
      userContentContainer.appendChild(questionText);
    }

    content.appendChild(userContentContainer);
    rawContent = questionContent;
  } else if (msg.role === "error") {
    // Error messages display as plain text with warning icon
    // Try to parse JSON error message for friendlier display
    let errorDisplay = msg.content;
    try {
      // Try to extract error info from "API Error: 403 - {json}" format
      const jsonMatch = msg.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const errorJson = JSON.parse(jsonMatch[0]);
        if (errorJson.error?.message) {
          errorDisplay = errorJson.error.message;
        }
      }
    } catch {
      // Parse failed, use original content
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
