/**
 * HistoryDropdown - Chat history dropdown component with pagination
 */

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
): HTMLElement {
  const sessionItem = createElement(doc, "div", {
    padding: "12px 14px",
    borderBottom: `1px solid ${theme.borderColor}`,
    cursor: "pointer",
    transition: "background 0.2s",
    position: "relative",
  });

  // Delete button area (悬浮在右方尾部时浮现)
  const deleteBtnArea = createElement(doc, "div", {
    position: "absolute",
    right: "0",
    top: "0",
    bottom: "0",
    width: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    zIndex: "5",
  });

  // Delete button
  const deleteBtn = createElement(doc, "button", {
    width: "24px",
    height: "24px",
    background: "rgba(255, 255, 255, 0.9)",
    border: `1px solid ${theme.borderColor}`,
    borderRadius: "4px",
    cursor: "pointer",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    color: theme.textMuted,
    padding: "0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  });
  deleteBtn.textContent = "×";
  deleteBtn.title = getString("chat-delete");

  deleteBtnArea.appendChild(deleteBtn);

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

  // 悬浮区域事件 - 显示删除按钮，背景渐变从条目hover背景色开始
  deleteBtnArea.addEventListener("mouseenter", () => {
    deleteBtn.style.display = "flex";
    // 使用条目hover背景色作为渐变起点
    deleteBtnArea.style.background = `linear-gradient(to left, ${theme.dropdownItemHoverBg} 0%, ${theme.dropdownItemHoverBg} 40%, transparent 100%)`;
  });

  deleteBtnArea.addEventListener("mouseleave", () => {
    deleteBtn.style.display = "none";
    deleteBtnArea.style.background = "transparent";
  });

  // Delete button hover
  deleteBtn.addEventListener("mouseenter", () => {
    deleteBtn.style.background = "rgba(255, 0, 0, 0.1)";
    deleteBtn.style.color = "#e53935";
    deleteBtn.style.borderColor = "#e53935";
  });
  deleteBtn.addEventListener("mouseleave", () => {
    deleteBtn.style.background = "rgba(255, 255, 255, 0.9)";
    deleteBtn.style.color = theme.textMuted;
    deleteBtn.style.borderColor = theme.borderColor;
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
  sessionItem.appendChild(deleteBtnArea);

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
      createSessionItem(doc, state.allSessions[i], theme, onSelect, onDelete),
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
      renderMoreSessions(container, doc, state, theme, onSelect, onDelete);
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
    renderMoreSessions(dropdown, doc, state, theme, onSelect, onDelete);
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
