import { HTML_NS } from "./types";
import { isDarkMode } from "./ChatPanelTheme";
import { ensureOverlayCopyButton, getCodeCopyButtonTitle } from "./CopyButton";

type MermaidModule = typeof import("mermaid");

type MermaidThemeVariables = {
  darkMode: boolean;
  background: string;
  primaryColor: string;
  primaryBorderColor: string;
  primaryTextColor: string;
  secondaryColor: string;
  secondaryBorderColor: string;
  tertiaryColor: string;
  tertiaryBorderColor: string;
  lineColor: string;
  textColor: string;
  mainBkg: string;
  nodeBorder: string;
  clusterBkg: string;
  clusterBorder: string;
  edgeLabelBackground: string;
  defaultLinkColor: string;
  titleColor: string;
  fontFamily: string;
};

export type MermaidThemeConfig = {
  theme: "base";
  themeVariables: MermaidThemeVariables;
};

const MERMAID_WRAPPER_CLASS = "chat-mermaid-diagram";
const MERMAID_RENDERED_ATTR = "data-mermaid-rendered";
const MERMAID_SOURCE_ATTR = "data-mermaid-source";
const MERMAID_PENDING_ATTR = "data-mermaid-pending";

let mermaidModulePromise: Promise<MermaidModule> | null = null;
let mermaidRenderCounter = 0;

function getMermaidModule(): Promise<MermaidModule> {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid");
  }
  return mermaidModulePromise;
}

function getFirstMeaningfulLine(source: string): string {
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("%%")) continue;
    return trimmed;
  }
  return "";
}

export function isMermaidFlowchartFence(
  fenceInfo: string | null | undefined,
  source: string,
): boolean {
  if ((fenceInfo ?? "").trim().toLowerCase() !== "mermaid") {
    return false;
  }

  const firstMeaningfulLine = getFirstMeaningfulLine(source).toLowerCase();
  return (
    firstMeaningfulLine.startsWith("flowchart ") ||
    firstMeaningfulLine === "flowchart" ||
    firstMeaningfulLine.startsWith("graph ") ||
    firstMeaningfulLine === "graph"
  );
}

export function buildMermaidThemeConfig(dark: boolean): MermaidThemeConfig {
  if (dark) {
    return {
      theme: "base",
      themeVariables: {
        darkMode: true,
        background: "#21262d",
        primaryColor: "#30363d",
        primaryBorderColor: "#58a6ff",
        primaryTextColor: "#f0f6fc",
        secondaryColor: "#161b22",
        secondaryBorderColor: "#484f58",
        tertiaryColor: "#0d1117",
        tertiaryBorderColor: "#30363d",
        lineColor: "#8b949e",
        textColor: "#f0f6fc",
        mainBkg: "#21262d",
        nodeBorder: "#58a6ff",
        clusterBkg: "#161b22",
        clusterBorder: "#30363d",
        edgeLabelBackground: "#0d1117",
        defaultLinkColor: "#8b949e",
        titleColor: "#f0f6fc",
        fontFamily:
          "'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      },
    };
  }

  return {
    theme: "base",
    themeVariables: {
      darkMode: false,
      background: "#ffffff",
      primaryColor: "#f8fafc",
      primaryBorderColor: "#6b7280",
      primaryTextColor: "#1a202c",
      secondaryColor: "#ffffff",
      secondaryBorderColor: "#94a3b8",
      tertiaryColor: "#f1f5f9",
      tertiaryBorderColor: "#cbd5e1",
      lineColor: "#475569",
      textColor: "#1a202c",
      mainBkg: "#ffffff",
      nodeBorder: "#6b7280",
      clusterBkg: "#f8fafc",
      clusterBorder: "#cbd5e1",
      edgeLabelBackground: "#ffffff",
      defaultLinkColor: "#475569",
      titleColor: "#1a202c",
      fontFamily: "'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    },
  };
}

function createMermaidSvgHost(doc: Document): HTMLElement {
  const host = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  host.style.display = "block";
  host.style.width = "100%";
  host.style.overflowX = "auto";
  host.style.overflowY = "hidden";
  host.style.padding = "8px 4px 0 4px";
  host.style.boxSizing = "border-box";
  host.style.textAlign = "center";
  return host;
}

function appendSvgToHost(doc: Document, host: HTMLElement, svgMarkup: string) {
  const svgDoc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svgNode = svgDoc.documentElement;
  if (!svgNode || svgNode.nodeName.toLowerCase() !== "svg") {
    throw new Error("Invalid mermaid svg output");
  }

  const imported = doc.importNode(svgNode, true) as SVGElement;
  imported.style.maxWidth = "100%";
  imported.style.height = "auto";
  imported.style.display = "inline-block";
  host.appendChild(imported);
}

function clearChildren(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

async function renderMermaidSvg(
  source: string,
  dark: boolean,
): Promise<string> {
  const mermaid = await getMermaidModule();
  const moduleValue = (mermaid as any).default ?? mermaid;
  const themeConfig = buildMermaidThemeConfig(dark);

  moduleValue.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    flowchart: {
      htmlLabels: false,
      useMaxWidth: false,
    },
    ...themeConfig,
  });

  const renderId = `zota-mermaid-${++mermaidRenderCounter}`;
  const result = await moduleValue.render(renderId, source);
  return typeof result === "string" ? result : result.svg;
}

async function renderIntoWrapper(wrapper: HTMLElement): Promise<void> {
  const source = wrapper.getAttribute(MERMAID_SOURCE_ATTR);
  if (!source || wrapper.getAttribute(MERMAID_PENDING_ATTR) === "true") {
    return;
  }

  wrapper.setAttribute(MERMAID_PENDING_ATTR, "true");

  try {
    const svgMarkup = await renderMermaidSvg(source, isDarkMode());
    const host = createMermaidSvgHost(wrapper.ownerDocument);
    appendSvgToHost(wrapper.ownerDocument, host, svgMarkup);
    clearChildren(wrapper);
    wrapper.appendChild(host);
    ensureMermaidCopyButton(wrapper.ownerDocument, wrapper);
    wrapper.setAttribute(MERMAID_RENDERED_ATTR, "true");
  } catch {
    // Keep the existing fallback code block when render fails.
    wrapper.setAttribute(MERMAID_RENDERED_ATTR, "false");
  } finally {
    wrapper.removeAttribute(MERMAID_PENDING_ATTR);
  }
}

export function mountMermaidFlowchart(
  wrapper: HTMLElement,
  source: string,
): void {
  wrapper.classList.add(MERMAID_WRAPPER_CLASS);
  wrapper.setAttribute(MERMAID_SOURCE_ATTR, source);
  wrapper.setAttribute(MERMAID_RENDERED_ATTR, "false");
  void renderIntoWrapper(wrapper);
}

export function ensureMermaidCopyButton(
  doc: Document,
  wrapper: HTMLElement,
): void {
  ensureOverlayCopyButton(doc, wrapper, {
    title: getCodeCopyButtonTitle(),
    getContent: () => wrapper.getAttribute(MERMAID_SOURCE_ATTR) ?? "",
  });
}

export function refreshMermaidDiagrams(container: HTMLElement): void {
  const diagrams = container.querySelectorAll(
    `.${MERMAID_WRAPPER_CLASS}[${MERMAID_SOURCE_ATTR}]`,
  );
  diagrams.forEach((diagram) => {
    void renderIntoWrapper(diagram as HTMLElement);
  });
}
