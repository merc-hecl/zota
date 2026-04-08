import type { ChatMessage } from "../../../types/chat";
import type { ThemeColors } from "./types";

export interface MessageNavigationItem {
  id: string;
  index: number;
  label: string;
}

export interface MessageNavigationAnchor {
  id: string;
  top: number;
}

const QUESTION_PREFIX = "[Question]:";
const ACTIVE_NAV_COLOR = "#4f6ef7";
const MAX_NAV_LABEL_LENGTH = 29;
const ACTIVE_TOP_OFFSET = 48;
const NAVIGATION_MIN_MESSAGE_COUNT = 3;
const NAVIGATION_COLLAPSE_DELAY_MS = 150;

type ChatHistoryWithNavigationState = HTMLElement & {
  _messageNavigationState?: {
    onScroll: () => void;
    theme: ThemeColors;
  };
};

type NavigationRailElement = HTMLElement & {
  _messageNavigationRailState?: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    theme: ThemeColors;
    expanded: boolean;
    collapseTimeout: number | null;
  };
};

export function buildMessageNavigationItems(
  messages: ChatMessage[],
): MessageNavigationItem[] {
  return messages
    .filter((message) => message.role === "user" && !message.isHidden)
    .map((message, index) => ({
      id: message.id,
      index,
      label: truncateLabel(getNavigationLabel(message)),
    }));
}

export function shouldEnableMessageNavigation(
  userMessageCount: number,
): boolean {
  return userMessageCount >= NAVIGATION_MIN_MESSAGE_COUNT;
}

export function getInactiveNavigationIndicatorColor(
  theme: ThemeColors,
): string {
  return isDarkHexColor(theme.containerBg)
    ? withAlpha(theme.textMuted, 0.62)
    : withAlpha(theme.borderColor, 0.85);
}

export function findActiveNavigationItemId(
  anchors: MessageNavigationAnchor[],
  scrollTop: number,
): string | null {
  if (anchors.length === 0) {
    return null;
  }

  const thresholdTop = scrollTop + ACTIVE_TOP_OFFSET;
  let activeId = anchors[0].id;

  for (const anchor of anchors) {
    if (anchor.top <= thresholdTop) {
      activeId = anchor.id;
      continue;
    }
    break;
  }

  return activeId;
}

export function syncMessageNavigation(
  chatHistory: HTMLElement,
  messages: ChatMessage[],
  theme: ThemeColors,
): void {
  const rail = chatHistory.parentElement?.querySelector(
    "#chat-message-nav",
  ) as NavigationRailElement | null;
  const list = rail?.querySelector(
    "#chat-message-nav-list",
  ) as HTMLElement | null;

  if (!rail || !list) {
    return;
  }

  const items = buildMessageNavigationItems(messages);
  const shouldShowNavigation = shouldEnableMessageNavigation(items.length);
  rail.style.display = shouldShowNavigation ? "block" : "none";

  if (!shouldShowNavigation) {
    list.replaceChildren();
    detachNavigationScrollSync(chatHistory as ChatHistoryWithNavigationState);
    return;
  }

  const doc = chatHistory.ownerDocument;
  if (!doc) {
    return;
  }

  ensureNavigationRailState(rail, theme);
  rail._messageNavigationRailState!.theme = theme;

  list.replaceChildren(
    ...items.map((item) => createNavigationButton(doc, item, theme, rail)),
  );

  attachNavigationScrollSync(
    chatHistory as ChatHistoryWithNavigationState,
    theme,
  );
  applyExpandedRailState(rail, theme);
  updateActiveNavigationItem(chatHistory, theme);
}

export function applyMessageNavigationTheme(
  container: HTMLElement,
  theme: ThemeColors,
): void {
  const rail = container.querySelector(
    "#chat-message-nav",
  ) as NavigationRailElement | null;
  const list = container.querySelector(
    "#chat-message-nav-list",
  ) as HTMLElement | null;
  const chatHistory = container.querySelector(
    "#chat-history",
  ) as ChatHistoryWithNavigationState | null;

  if (!rail || !list) {
    return;
  }

  if (chatHistory?._messageNavigationState) {
    chatHistory._messageNavigationState.theme = theme;
  }

  if (rail._messageNavigationRailState) {
    rail._messageNavigationRailState.theme = theme;
  }

  applyExpandedRailState(rail, theme);

  list
    .querySelectorAll(".chat-message-nav-item")
    .forEach((button) =>
      styleNavigationButton(
        button as HTMLButtonElement,
        theme,
        rail._messageNavigationRailState?.expanded ?? false,
      ),
    );
}

function createNavigationButton(
  doc: Document,
  item: MessageNavigationItem,
  theme: ThemeColors,
  rail: NavigationRailElement,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.className = "chat-message-nav-item";
  button.type = "button";
  button.dataset.messageId = item.id;
  button.dataset.active = "false";
  button.title = item.label;

  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "flex-end";
  button.style.width = "100%";
  button.style.padding = "4px 0";
  button.style.border = "none";
  button.style.background = "transparent";
  button.style.borderRadius = "999px";
  button.style.cursor = "pointer";
  button.style.gap = "10px";
  button.style.textAlign = "left";
  button.style.transition =
    "background-color 0.16s ease, color 0.16s ease, padding 0.16s ease";

  const label = doc.createElement("span");
  label.className = "chat-message-nav-label";
  label.textContent = item.label;
  label.style.flex = "1";
  label.style.minWidth = "0";
  label.style.fontSize = "12px";
  label.style.lineHeight = "1.45";
  label.style.whiteSpace = "nowrap";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  label.style.display = "none";

  const indicator = doc.createElement("span");
  indicator.className = "chat-message-nav-indicator";
  indicator.style.flexShrink = "0";
  indicator.style.width = "16px";
  indicator.style.height = "4px";
  indicator.style.borderRadius = "999px";
  indicator.style.transition =
    "background-color 0.16s ease, opacity 0.16s ease";

  button.appendChild(label);
  button.appendChild(indicator);

  button.addEventListener("mouseenter", () => {
    if (button.dataset.active !== "true") {
      const currentTheme = rail._messageNavigationRailState?.theme ?? theme;
      const expanded = rail._messageNavigationRailState?.expanded ?? false;
      if (expanded) {
        button.style.background = withAlpha(currentTheme.buttonBg, 0.45);
      }
    }
  });
  button.addEventListener("mouseleave", () => {
    if (button.dataset.active !== "true") {
      button.style.background = "transparent";
    }
  });
  button.addEventListener("click", () => {
    const chatHistory = button
      .closest("#chat-message-area")
      ?.querySelector("#chat-history") as HTMLElement | null;
    if (!chatHistory) {
      return;
    }

    const target = findElementByMessageId(
      chatHistory.querySelectorAll(
        ".chat-message.user-message[data-message-id]",
      ),
      item.id,
    );
    if (!target) {
      return;
    }

    chatHistory.scrollTo({
      top: Math.max(target.offsetTop - 8, 0),
      behavior: "smooth",
    });
    setActiveButton(chatHistory, item.id, theme);
  });

  styleNavigationButton(
    button,
    theme,
    rail._messageNavigationRailState?.expanded ?? false,
  );
  return button;
}

function getNavigationLabel(message: ChatMessage): string {
  const questionContent = extractQuestionContent(message.content);
  const fallbackContent =
    questionContent ||
    normalizeWhitespace(message.selectedText) ||
    normalizeWhitespace(message.documents?.[0]?.title) ||
    (message.images && message.images.length > 0 ? "Attached image" : "") ||
    "Untitled message";

  return fallbackContent;
}

function extractQuestionContent(content: string): string {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return "";
  }

  if (!content.includes(QUESTION_PREFIX)) {
    return normalized;
  }

  return normalizeWhitespace(content.split(QUESTION_PREFIX).pop() || "");
}

function normalizeWhitespace(value?: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

function truncateLabel(label: string): string {
  if (label.length <= MAX_NAV_LABEL_LENGTH) {
    return label;
  }

  return `${label.slice(0, MAX_NAV_LABEL_LENGTH - 3)}...`;
}

function attachNavigationScrollSync(
  chatHistory: ChatHistoryWithNavigationState,
  theme: ThemeColors,
): void {
  if (chatHistory._messageNavigationState) {
    chatHistory._messageNavigationState.theme = theme;
    return;
  }

  const onScroll = () => {
    const currentTheme = chatHistory._messageNavigationState?.theme;
    if (!currentTheme) {
      return;
    }
    updateActiveNavigationItem(chatHistory, currentTheme);
  };

  chatHistory.addEventListener("scroll", onScroll);
  chatHistory._messageNavigationState = { onScroll, theme };
}

function detachNavigationScrollSync(
  chatHistory: ChatHistoryWithNavigationState,
): void {
  const state = chatHistory._messageNavigationState;
  if (!state) {
    return;
  }

  chatHistory.removeEventListener("scroll", state.onScroll);
  delete chatHistory._messageNavigationState;
}

function updateActiveNavigationItem(
  chatHistory: HTMLElement,
  theme?: ThemeColors,
): void {
  const anchors = Array.from(
    chatHistory.querySelectorAll(".chat-message.user-message[data-message-id]"),
  ).map((element) => {
    const messageElement = element as HTMLElement;
    return {
      id: messageElement.dataset.messageId || "",
      top: messageElement.offsetTop,
    };
  });

  const activeId = findActiveNavigationItemId(anchors, chatHistory.scrollTop);
  if (!activeId) {
    return;
  }

  setActiveButton(chatHistory, activeId, theme);
}

function setActiveButton(
  chatHistory: HTMLElement,
  activeId: string,
  theme?: ThemeColors,
): void {
  const container = chatHistory.closest(
    ".chat-panel-root",
  ) as HTMLElement | null;
  const list = container?.querySelector(
    "#chat-message-nav-list",
  ) as HTMLElement | null;
  if (!list) {
    return;
  }

  list.querySelectorAll(".chat-message-nav-item").forEach((button) => {
    const navButton = button as HTMLButtonElement;
    navButton.dataset.active =
      navButton.dataset.messageId === activeId ? "true" : "false";
    if (theme) {
      const rail = list.closest(
        "#chat-message-nav",
      ) as NavigationRailElement | null;
      styleNavigationButton(
        navButton,
        theme,
        rail?._messageNavigationRailState?.expanded ?? false,
      );
    }
  });

  const activeButton = findElementByMessageId(
    list.querySelectorAll(".chat-message-nav-item[data-message-id]"),
    activeId,
  ) as HTMLButtonElement | null;
  activeButton?.scrollIntoView({ block: "nearest" });
}

function styleNavigationButton(
  button: HTMLButtonElement,
  theme: ThemeColors,
  expanded: boolean,
): void {
  const isActive = button.dataset.active === "true";
  const label = button.querySelector(
    ".chat-message-nav-label",
  ) as HTMLElement | null;
  const indicator = button.querySelector(
    ".chat-message-nav-indicator",
  ) as HTMLElement | null;

  button.style.justifyContent = expanded ? "space-between" : "flex-end";
  button.style.padding = expanded ? "8px 10px" : "4px 0";
  button.style.borderRadius = expanded ? "10px" : "999px";
  button.style.background =
    expanded && isActive ? withAlpha(ACTIVE_NAV_COLOR, 0.08) : "transparent";
  button.style.color = isActive ? ACTIVE_NAV_COLOR : theme.textMuted;

  if (label) {
    label.style.display = expanded ? "block" : "none";
    label.style.color = isActive ? ACTIVE_NAV_COLOR : theme.textMuted;
    label.style.fontWeight = isActive ? "600" : "500";
  }

  if (indicator) {
    indicator.style.width = expanded ? "16px" : isActive ? "24px" : "14px";
    indicator.style.background = isActive
      ? ACTIVE_NAV_COLOR
      : getInactiveNavigationIndicatorColor(theme);
    indicator.style.opacity = isActive ? "1" : "0.7";
  }
}

function withAlpha(color: string, alpha: number): string {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) {
    return color;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function isDarkHexColor(color: string): boolean {
  const normalized = color.replace("#", "");
  if (normalized.length !== 6) {
    return false;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

function ensureNavigationRailState(
  rail: NavigationRailElement,
  theme: ThemeColors,
): void {
  if (rail._messageNavigationRailState) {
    return;
  }

  const expand = () => {
    const state = rail._messageNavigationRailState;
    if (!state) {
      return;
    }

    if (state.collapseTimeout !== null) {
      const win = rail.ownerDocument.defaultView;
      win?.clearTimeout(state.collapseTimeout);
      state.collapseTimeout = null;
    }

    state.expanded = true;
    applyExpandedRailState(rail, state.theme);
  };

  const collapse = () => {
    const state = rail._messageNavigationRailState;
    if (!state) {
      return;
    }

    const win = rail.ownerDocument.defaultView;
    if (!win) {
      state.expanded = false;
      applyExpandedRailState(rail, state.theme);
      return;
    }

    if (state.collapseTimeout !== null) {
      win.clearTimeout(state.collapseTimeout);
    }

    state.collapseTimeout = win.setTimeout(() => {
      state.expanded = false;
      state.collapseTimeout = null;
      applyExpandedRailState(rail, state.theme);
    }, NAVIGATION_COLLAPSE_DELAY_MS);
  };

  rail.addEventListener("mouseenter", expand);
  rail.addEventListener("mouseleave", collapse);
  rail._messageNavigationRailState = {
    onMouseEnter: expand,
    onMouseLeave: collapse,
    theme,
    expanded: false,
    collapseTimeout: null,
  };
}

function applyExpandedRailState(
  rail: NavigationRailElement,
  theme: ThemeColors,
): void {
  const expanded = rail._messageNavigationRailState?.expanded ?? false;
  const list = rail.querySelector(
    "#chat-message-nav-list",
  ) as HTMLElement | null;

  rail.style.width = expanded ? "156px" : "28px";
  rail.style.padding = expanded ? "10px 8px" : "8px 6px";
  rail.style.borderRadius = "16px";
  rail.style.background = expanded
    ? withAlpha(theme.containerBg, 0.96)
    : "transparent";
  rail.style.border = expanded
    ? `1px solid ${withAlpha(theme.borderColor, 0.92)}`
    : "1px solid transparent";
  rail.style.boxShadow = expanded
    ? "0 8px 24px rgba(15, 23, 42, 0.12)"
    : "none";

  if (!list) {
    return;
  }

  list.style.background = "transparent";
  list.style.justifyContent = "center";
  list.style.alignItems = expanded ? "stretch" : "flex-end";
  list.style.gap = expanded ? "6px" : "10px";

  list.querySelectorAll(".chat-message-nav-item").forEach((button) => {
    styleNavigationButton(button as HTMLButtonElement, theme, expanded);
  });
}

function findElementByMessageId(
  elements: NodeListOf<Element>,
  messageId: string,
): HTMLElement | null {
  for (const element of elements) {
    if ((element as HTMLElement).dataset.messageId === messageId) {
      return element as HTMLElement;
    }
  }

  return null;
}
