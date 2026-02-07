/**
 * HistoryDropdown - Chat history dropdown component with pagination
 */

import { config } from "../../../../package.json";
import { getString } from "../../../utils/locale";
import { chatColors } from "../../../utils/colors";
import type { ThemeColors, SessionInfo } from "./types";
import { createElement } from "./ChatPanelBuilder";

// Number of sessions to show per page
export const SESSIONS_PER_PAGE = 20;

/**
 * Create a session item element for the history dropdown
 */
export function createSessionItem(
  doc: Document,
  session: SessionInfo,
  theme: ThemeColors,
  onSelect: (session: SessionInfo) => void,
  onDelete?: (session: SessionInfo) => void,
  onExport?: (session: SessionInfo) => void,
): HTMLElement {
  const sessionItem = createElement(doc, "div", {
    padding: "12px 14px",
    borderBottom: `1px solid ${theme.borderColor}`,
    cursor: "pointer",
    transition: "background 0.2s",
    position: "relative",
  });

  // Button area (悬浮在右方尾部时浮现导出和删除按钮)
  const buttonArea = createElement(doc, "div", {
    position: "absolute",
    right: "0",
    top: "0",
    bottom: "0",
    width: "70px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    background: "transparent",
    zIndex: "5",
    paddingRight: "8px",
  });

  // Export button - use theme-aware background
  const exportBtn = createElement(doc, "button", {
    width: "24px",
    height: "24px",
    background: theme.buttonBg,
    border: `1px solid ${theme.borderColor}`,
    borderRadius: "4px",
    cursor: "pointer",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    flexShrink: "0",
  });
  exportBtn.title = getString("chat-export-note");

  // Export icon
  const exportIcon = createElement(doc, "img", {
    width: "14px",
    height: "14px",
    opacity: "0.7",
  });
  (exportIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/note-export.svg`;
  exportBtn.appendChild(exportIcon);

  // Delete button - use theme-aware background
  const deleteBtn = createElement(doc, "button", {
    width: "24px",
    height: "24px",
    background: theme.buttonBg,
    border: `1px solid ${theme.borderColor}`,
    borderRadius: "4px",
    cursor: "pointer",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    flexShrink: "0",
  });
  deleteBtn.title = getString("chat-delete");

  // Delete icon
  const deleteIcon = createElement(doc, "img", {
    width: "14px",
    height: "14px",
    opacity: "0.7",
  });
  (deleteIcon as HTMLImageElement).src =
    `chrome://${config.addonRef}/content/icons/history-delete.svg`;
  deleteBtn.appendChild(deleteIcon);

  buttonArea.appendChild(exportBtn);
  buttonArea.appendChild(deleteBtn);

  // Content wrapper (全宽，不再预留删除按钮空间)
  const contentWrapper = createElement(doc, "div", {
    paddingRight: "8px",
  });

  // Row 1: Session Title (AI生成的会话标题)
  const titleContainer = createElement(doc, "div", {
    fontSize: "13px",
    fontWeight: "500",
    color: theme.textPrimary,
    overflow: "hidden",
    whiteSpace: "nowrap",
    marginBottom: "4px",
    lineHeight: "1.4",
    position: "relative",
  });

  const titleEl = createElement(doc, "div", {
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    transition: "transform 0.3s ease",
  });
  titleEl.textContent =
    session.sessionTitle || (session.isEmpty ? "" : "未命名会话");

  titleContainer.appendChild(titleEl);

  // 标题悬停滚动效果
  let scrollTimeout: number | null = null;
  titleContainer.addEventListener("mouseenter", () => {
    const containerWidth = titleContainer.offsetWidth;
    const titleWidth = titleEl.scrollWidth;

    if (titleWidth > containerWidth) {
      const scrollDistance = titleWidth - containerWidth;
      // 延迟后开始滚动
      scrollTimeout = window.setTimeout(() => {
        titleEl.style.transition = "transform 2s linear";
        titleEl.style.transform = `translateX(-${scrollDistance}px)`;
      }, 300);
    }
  });

  titleContainer.addEventListener("mouseleave", () => {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
    titleEl.style.transition = "transform 0.3s ease";
    titleEl.style.transform = "translateX(0)";
  });

  // Row 2: Meta info (消息条数)
  const metaEl = createElement(doc, "div", {
    fontSize: "11px",
    color: theme.textMuted,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  });

  const msgCount = createElement(doc, "span", {});
  msgCount.textContent = getString("chat-message-count", {
    args: { count: session.messageCount },
  });

  metaEl.appendChild(msgCount);

  contentWrapper.appendChild(titleContainer);
  contentWrapper.appendChild(metaEl);

  // 时间信息 - 绝对定位到最右端
  const timeEl = createElement(doc, "span", {
    position: "absolute",
    right: "14px",
    bottom: "12px",
    fontSize: "11px",
    color: theme.textMuted,
    zIndex: "1",
  });
  const date = new Date(session.lastUpdated);
  const now = new Date();
  const isThisYear = date.getFullYear() === now.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  timeEl.textContent = isThisYear
    ? `${month}/${day} ${hours}:${minutes}`
    : `${date.getFullYear()}/${month}/${day} ${hours}:${minutes}`;

  // 悬浮区域事件 - 显示导出和删除按钮，背景渐变从条目hover背景色开始
  buttonArea.addEventListener("mouseenter", () => {
    exportBtn.style.display = "flex";
    deleteBtn.style.display = "flex";
    // 使用条目hover背景色作为渐变起点
    buttonArea.style.background = `linear-gradient(to left, ${theme.dropdownItemHoverBg} 0%, ${theme.dropdownItemHoverBg} 40%, transparent 100%)`;
  });

  buttonArea.addEventListener("mouseleave", () => {
    exportBtn.style.display = "none";
    deleteBtn.style.display = "none";
    buttonArea.style.background = "transparent";
  });

  // Export button hover
  exportBtn.addEventListener("mouseenter", () => {
    exportBtn.style.background = "rgba(0, 128, 0, 0.1)";
    exportBtn.style.borderColor = "#2e7d32";
    const icon = exportBtn.querySelector("img");
    if (icon) icon.style.opacity = "1";
  });
  exportBtn.addEventListener("mouseleave", () => {
    exportBtn.style.background = theme.buttonBg;
    exportBtn.style.borderColor = theme.borderColor;
    const icon = exportBtn.querySelector("img");
    if (icon) icon.style.opacity = "0.7";
  });

  // Export button click with visual feedback
  exportBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    // Show loading state
    exportBtn.textContent = "...";
    exportBtn.style.cursor = "wait";
    exportBtn.setAttribute("disabled", "true");

    try {
      // Call export callback
      await onExport?.(session);

      // Show success checkmark
      exportBtn.textContent = "✓";
      exportBtn.style.color = "#2e7d32";
      exportBtn.style.borderColor = "#2e7d32";
      exportBtn.style.background = "rgba(0, 128, 0, 0.15)";

      // Restore original icon after delay
      setTimeout(() => {
        exportBtn.textContent = "";
        const newIcon = createElement(doc, "img", {
          width: "14px",
          height: "14px",
          opacity: "0.7",
        });
        (newIcon as HTMLImageElement).src =
          `chrome://${config.addonRef}/content/icons/note-export.svg`;
        exportBtn.appendChild(newIcon);
        exportBtn.style.borderColor = theme.borderColor;
        exportBtn.style.background = theme.buttonBg;
        exportBtn.style.cursor = "pointer";
        exportBtn.removeAttribute("disabled");
      }, 600);
    } catch {
      // Show error state
      exportBtn.textContent = "✗";
      exportBtn.style.color = "#e53935";
      exportBtn.style.borderColor = "#e53935";
      exportBtn.style.background = "rgba(255, 0, 0, 0.15)";

      // Restore original icon after delay
      setTimeout(() => {
        exportBtn.textContent = "";
        const newIcon = createElement(doc, "img", {
          width: "14px",
          height: "14px",
          opacity: "0.7",
        });
        (newIcon as HTMLImageElement).src =
          `chrome://${config.addonRef}/content/icons/note-export.svg`;
        exportBtn.appendChild(newIcon);
        exportBtn.style.borderColor = theme.borderColor;
        exportBtn.style.background = theme.buttonBg;
        exportBtn.style.cursor = "pointer";
        exportBtn.removeAttribute("disabled");
      }, 600);
    }
  });

  // Delete button hover
  deleteBtn.addEventListener("mouseenter", () => {
    deleteBtn.style.background = "rgba(255, 0, 0, 0.1)";
    deleteBtn.style.borderColor = "#e53935";
    const icon = deleteBtn.querySelector("img");
    if (icon) icon.style.opacity = "1";
  });
  deleteBtn.addEventListener("mouseleave", () => {
    deleteBtn.style.background = theme.buttonBg;
    deleteBtn.style.borderColor = theme.borderColor;
    const icon = deleteBtn.querySelector("img");
    if (icon) icon.style.opacity = "0.7";
  });

  // Delete button click
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete?.(session);
  });

  // Session item hover effect
  sessionItem.addEventListener("mouseenter", () => {
    sessionItem.style.background = theme.dropdownItemHoverBg;
  });
  sessionItem.addEventListener("mouseleave", () => {
    sessionItem.style.background = "transparent";
  });

  sessionItem.appendChild(contentWrapper);
  sessionItem.appendChild(timeEl);
  sessionItem.appendChild(buttonArea);

  // Click handler
  sessionItem.addEventListener("click", () => {
    onSelect(session);
  });

  return sessionItem;
}

/**
 * State for history dropdown pagination
 */
export interface HistoryDropdownState {
  allSessions: SessionInfo[];
  displayedCount: number;
}

/**
 * Create initial state for history dropdown
 */
export function createHistoryDropdownState(): HistoryDropdownState {
  return {
    allSessions: [],
    displayedCount: 0,
  };
}

/**
 * Render more sessions with pagination (appends to container)
 */
export function renderMoreSessions(
  container: HTMLElement,
  doc: Document,
  state: HistoryDropdownState,
  theme: ThemeColors,
  onSelect: (session: SessionInfo) => void,
  onDelete?: (session: SessionInfo) => void,
  onExport?: (session: SessionInfo) => void,
): void {
  const endIndex = Math.min(
    state.displayedCount + SESSIONS_PER_PAGE,
    state.allSessions.length,
  );

  // Remove existing "load more" button if any
  const existingLoadMore = container.querySelector(".load-more-btn");
  if (existingLoadMore) {
    existingLoadMore.remove();
  }

  // Add session items
  for (let i = state.displayedCount; i < endIndex; i++) {
    container.appendChild(
      createSessionItem(
        doc,
        state.allSessions[i],
        theme,
        onSelect,
        onDelete,
        onExport,
      ),
    );
  }
  state.displayedCount = endIndex;

  // Add "load more" button if there are more sessions
  if (state.displayedCount < state.allSessions.length) {
    const loadMoreBtn = createElement(doc, "div", {
      padding: "12px 14px",
      textAlign: "center",
      color: chatColors.historyAccent,
      cursor: "pointer",
      fontWeight: "500",
      fontSize: "13px",
    });
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = getString("chat-show-more", {
      args: { count: state.allSessions.length - state.displayedCount },
    });

    loadMoreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      renderMoreSessions(
        container,
        doc,
        state,
        theme,
        onSelect,
        onDelete,
        onExport,
      );
    });
    loadMoreBtn.addEventListener("mouseenter", () => {
      loadMoreBtn.style.background = chatColors.loadMoreBg;
    });
    loadMoreBtn.addEventListener("mouseleave", () => {
      loadMoreBtn.style.background = "transparent";
    });

    container.appendChild(loadMoreBtn);
  }
}

/**
 * Create document name header for history dropdown
 */
function createDocumentHeader(
  doc: Document,
  documentName: string,
  theme: ThemeColors,
): HTMLElement {
  const header = createElement(doc, "div", {
    padding: "10px 14px",
    borderBottom: `1px solid ${theme.borderColor}`,
    background: theme.buttonBg,
    fontWeight: "600",
    fontSize: "14px",
    color: theme.textPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    position: "sticky",
    top: "0",
    zIndex: "10",
  });
  header.textContent = documentName;
  return header;
}

/**
 * Populate the history dropdown with sessions
 */
export function populateHistoryDropdown(
  dropdown: HTMLElement,
  doc: Document,
  sessions: SessionInfo[],
  state: HistoryDropdownState,
  theme: ThemeColors,
  onSelect: (session: SessionInfo) => void,
  onDelete?: (session: SessionInfo) => void,
  documentName?: string,
  onExport?: (session: SessionInfo) => void,
): void {
  // Reset state
  state.allSessions = sessions;
  state.displayedCount = 0;

  dropdown.textContent = "";

  if (sessions.length === 0) {
    const emptyMsg = createElement(doc, "div", {
      padding: "20px",
      textAlign: "center",
      color: chatColors.emptyText,
      fontSize: "13px",
    });
    emptyMsg.textContent = getString("chat-no-history");
    dropdown.appendChild(emptyMsg);
  } else {
    // Add document name header at the top if provided
    if (documentName) {
      const header = createDocumentHeader(doc, documentName, theme);
      dropdown.appendChild(header);
    }

    // Render first page
    renderMoreSessions(
      dropdown,
      doc,
      state,
      theme,
      onSelect,
      onDelete,
      onExport,
    );
  }
}

/**
 * Toggle history dropdown visibility
 */
export function toggleHistoryDropdown(dropdown: HTMLElement): boolean {
  const isVisible = dropdown.style.display !== "none";
  if (isVisible) {
    dropdown.style.display = "none";
    return false;
  }
  dropdown.style.display = "block";
  return true;
}

/**
 * Setup click-outside handler to close dropdown
 */
export function setupClickOutsideHandler(
  container: HTMLElement,
  dropdown: HTMLElement,
  historyBtn: HTMLElement,
): void {
  container.addEventListener("click", (e) => {
    if (dropdown.style.display !== "none") {
      if (
        !historyBtn.contains(e.target as Node) &&
        !dropdown.contains(e.target as Node)
      ) {
        dropdown.style.display = "none";
      }
    }
  });
}
