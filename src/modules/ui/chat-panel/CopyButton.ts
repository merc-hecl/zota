import { config } from "../../../../package.json";
import { getString } from "../../../utils/locale";
import { isDarkMode } from "./ChatPanelTheme";
import { copyToClipboard, createElement } from "./ChatPanelBuilder";
import { HTML_NS } from "./types";

type CopyButtonElement = HTMLButtonElement & {
  _getCopyContent?: () => string;
  _clickBound?: boolean;
};

type CopyButtonOptions = {
  title: string;
  getContent: () => string;
};

const COPY_BUTTON_CLASS = "chat-copy-overlay-btn";
const HOVER_BOUND_ATTR = "data-copy-hover-bound";

function findCopyButton(wrapper: HTMLElement): CopyButtonElement | null {
  for (const child of Array.from(wrapper.children)) {
    if (
      child.tagName.toLowerCase() === "button" &&
      child.classList.contains(COPY_BUTTON_CLASS)
    ) {
      return child as CopyButtonElement;
    }
  }
  return null;
}

function setButtonIcon(
  doc: Document,
  button: HTMLButtonElement,
  iconName: "copy" | "copy-check",
  opacity?: string,
): void {
  button.textContent = "";
  const icon = createElement(doc, "img", {
    width: "14px",
    height: "14px",
    ...(opacity ? { opacity } : {}),
  }) as HTMLImageElement;
  icon.src = `chrome://${config.addonRef}/content/icons/${iconName}.svg`;
  button.appendChild(icon);
}

function applyButtonTheme(button: HTMLButtonElement): void {
  const dark = isDarkMode();
  button.style.background = dark
    ? "rgba(48, 54, 61, 0.9)"
    : "rgba(255, 255, 255, 0.9)";
  button.style.border = dark ? "1px solid #484f58" : "1px solid #ddd";
  button.style.boxShadow = dark
    ? "0 1px 3px rgba(0,0,0,0.3)"
    : "0 1px 3px rgba(0,0,0,0.1)";
}

function ensureHoverBehavior(wrapper: HTMLElement): void {
  if (wrapper.getAttribute(HOVER_BOUND_ATTR) === "true") {
    return;
  }

  wrapper.setAttribute(HOVER_BOUND_ATTR, "true");
  wrapper.addEventListener("mouseenter", () => {
    const button = findCopyButton(wrapper);
    if (button) {
      button.style.opacity = "1";
    }
  });
  wrapper.addEventListener("mouseleave", () => {
    const button = findCopyButton(wrapper);
    if (button) {
      button.style.opacity = "0";
    }
  });
}

export function ensureOverlayCopyButton(
  doc: Document,
  wrapper: HTMLElement,
  options: CopyButtonOptions,
): HTMLButtonElement {
  let button = findCopyButton(wrapper);
  if (!button) {
    button = doc.createElementNS(HTML_NS, "button") as CopyButtonElement;
    button.classList.add(COPY_BUTTON_CLASS);
    button.style.position = "absolute";
    button.style.top = "4px";
    button.style.right = "4px";
    button.style.width = "28px";
    button.style.height = "28px";
    button.style.borderRadius = "4px";
    button.style.cursor = "pointer";
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.padding = "0";
    button.style.opacity = "0";
    button.style.transition = "opacity 0.2s ease";
    button.style.zIndex = "10";
    wrapper.appendChild(button);
  }

  button._getCopyContent = options.getContent;
  button.title = options.title;
  applyButtonTheme(button);
  setButtonIcon(doc, button, "copy", "0.8");
  ensureHoverBehavior(wrapper);

  if (!button._clickBound) {
    button._clickBound = true;
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      const content = button?._getCopyContent?.() ?? "";
      copyToClipboard(content);

      setButtonIcon(doc, button!, "copy-check");

      setTimeout(() => {
        button!.style.opacity = "0";
        setTimeout(() => {
          setButtonIcon(doc, button!, "copy", "0.8");
        }, 200);
      }, 800);
    });
  }

  return button;
}

export function getCodeCopyButtonTitle(): string {
  try {
    return getString("chat-copy-code");
  } catch {
    return "Copy code";
  }
}

export function getTableCopyButtonTitle(): string {
  try {
    return getString("chat-copy-table");
  } catch {
    return "Copy table";
  }
}
