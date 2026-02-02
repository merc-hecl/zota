/**
 * MarkdownRenderer - Convert markdown to DOM elements (XHTML-safe)
 */

import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import katex from "katex";
import { chatColors } from "../../../utils/colors";
import { HTML_NS } from "./types";
import { isDarkMode } from "./ChatPanelTheme";
import { copyToClipboard } from "./ChatPanelBuilder";
import { getString } from "../../../utils/locale";

// Initialize markdown-it with XHTML output
const md = new MarkdownIt({
  html: true,
  breaks: true,
  xhtmlOut: true,
  typographer: true,
  linkify: true,
});

// Configure markdown-it to handle math blocks
md.block.ruler.before(
  "fence",
  "math_block",
  (state, startLine, endLine, silent) => {
    const marker = state.src
      .slice(
        state.bMarks[startLine] + state.tShift[startLine],
        state.eMarks[startLine],
      )
      .trim();

    // Check for display math: $$...$$ or \[ ... \]
    if (marker.startsWith("$$")) {
      if (silent) return true;

      let nextLine = startLine;
      let content = "";
      let found = false;

      // Single line math
      if (marker.endsWith("$$") && marker.length > 4) {
        content = marker.slice(2, -2);
        found = true;
        nextLine = startLine + 1;
      } else {
        // Multi-line math
        content = marker.slice(2);
        nextLine = startLine + 1;

        while (nextLine < endLine) {
          const line = state.src.slice(
            state.bMarks[nextLine] + state.tShift[nextLine],
            state.eMarks[nextLine],
          );
          if (line.trim().endsWith("$$")) {
            content += "\n" + line.slice(0, line.lastIndexOf("$$"));
            found = true;
            nextLine++;
            break;
          }
          content += "\n" + line;
          nextLine++;
        }
      }

      if (!found) return false;

      const token = state.push("math_block", "div", 0);
      token.content = content.trim();
      token.map = [startLine, nextLine];
      token.markup = "$$";
      state.line = nextLine;
      return true;
    } else if (marker.startsWith("\\[")) {
      // LaTeX style display math: \[ ... \]
      if (silent) return true;

      let nextLine = startLine;
      let content = "";
      let found = false;

      // Single line math
      if (marker.endsWith("\\]") && marker.length > 4) {
        content = marker.slice(2, -2);
        found = true;
        nextLine = startLine + 1;
      } else {
        // Multi-line math
        content = marker.slice(2);
        nextLine = startLine + 1;

        while (nextLine < endLine) {
          const line = state.src.slice(
            state.bMarks[nextLine] + state.tShift[nextLine],
            state.eMarks[nextLine],
          );
          if (line.trim().endsWith("\\]")) {
            content += "\n" + line.slice(0, line.lastIndexOf("\\]"));
            found = true;
            nextLine++;
            break;
          }
          content += "\n" + line;
          nextLine++;
        }
      }

      if (!found) return false;

      const token = state.push("math_block", "div", 0);
      token.content = content.trim();
      token.map = [startLine, nextLine];
      token.markup = "\\[";
      state.line = nextLine;
      return true;
    }

    return false;
  },
);

// Configure markdown-it to handle inline math
md.inline.ruler.after("escape", "math_inline", (state, silent) => {
  const pos = state.pos;
  const marker = state.src.slice(pos, pos + 1);

  // Check for inline math: $...$ or \( ... \)
  if (marker === "$") {
    // Standard LaTeX: $...$
    if (state.src.charCodeAt(pos + 1) === 0x24) {
      return false; // $$ is for block math
    }

    const endMarker = "$";
    let endPos = pos + 1;

    while (endPos < state.posMax) {
      if (state.src.slice(endPos, endPos + 1) === endMarker) {
        // Skip escaped dollar signs
        if (state.src.charCodeAt(endPos - 1) === 0x5c) {
          endPos++;
          continue;
        }
        break;
      }
      endPos++;
    }

    if (endPos >= state.posMax) return false;

    if (silent) return true;

    const content = state.src.slice(pos + 1, endPos);
    const token = state.push("math_inline", "span", 0);
    token.content = content;
    token.markup = "$";
    state.pos = endPos + 1;
    return true;
  } else if (marker === "\\" && state.src.slice(pos + 1, pos + 2) === "(") {
    // LaTeX style: \( ... \)
    let endPos = pos + 2;

    while (endPos < state.posMax - 1) {
      if (
        state.src.slice(endPos, endPos + 2) === "\\)" &&
        state.src.charCodeAt(endPos - 1) !== 0x5c
      ) {
        break;
      }
      endPos++;
    }

    if (endPos >= state.posMax - 1) return false;

    if (silent) return true;

    const content = state.src.slice(pos + 2, endPos);
    const token = state.push("math_inline", "span", 0);
    token.content = content;
    token.markup = "\\(";
    state.pos = endPos + 2;
    return true;
  }

  return false;
});

/**
 * Render LaTeX math to HTML using KaTeX
 */
function renderMathToHTML(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    // Fallback: return the original LaTeX as text
    return displayMode ? `$$${latex}$$` : `$${latex}$`;
  }
}

/**
 * Render markdown content to DOM elements directly
 * This avoids XHTML parsing issues by building elements programmatically
 */
export function renderMarkdownToElement(
  element: HTMLElement,
  markdownContent: string,
): void {
  element.textContent = "";
  const doc = element.ownerDocument;
  if (!doc) return;

  const tokens = md.parse(markdownContent, {});
  const container = buildDOMFromTokens(doc, tokens);

  while (container.firstChild) {
    element.appendChild(container.firstChild);
  }
}

/**
 * Build DOM elements from markdown-it tokens
 */
export function buildDOMFromTokens(
  doc: Document,
  tokens: ReturnType<typeof md.parse>,
): HTMLElement {
  const container = doc.createElementNS(HTML_NS, "div") as HTMLElement;
  const stack: HTMLElement[] = [container];

  for (const token of tokens) {
    const parent = stack[stack.length - 1];

    switch (token.type) {
      case "paragraph_open": {
        const p = doc.createElementNS(HTML_NS, "p") as HTMLElement;
        parent.appendChild(p);
        stack.push(p);
        break;
      }
      case "paragraph_close":
        stack.pop();
        break;

      case "heading_open": {
        const h = doc.createElementNS(HTML_NS, token.tag) as HTMLElement;
        parent.appendChild(h);
        stack.push(h);
        break;
      }
      case "heading_close":
        stack.pop();
        break;

      case "bullet_list_open": {
        const ul = doc.createElementNS(HTML_NS, "ul") as HTMLElement;
        parent.appendChild(ul);
        stack.push(ul);
        break;
      }
      case "bullet_list_close":
        stack.pop();
        break;

      case "ordered_list_open": {
        const ol = doc.createElementNS(HTML_NS, "ol") as HTMLElement;
        parent.appendChild(ol);
        stack.push(ol);
        break;
      }
      case "ordered_list_close":
        stack.pop();
        break;

      case "list_item_open": {
        const li = doc.createElementNS(HTML_NS, "li") as HTMLElement;
        parent.appendChild(li);
        stack.push(li);
        break;
      }
      case "list_item_close":
        stack.pop();
        break;

      case "blockquote_open": {
        const bq = doc.createElementNS(HTML_NS, "blockquote") as HTMLElement;
        bq.style.borderLeft = `3px solid ${chatColors.blockquoteBorder}`;
        bq.style.paddingLeft = "10px";
        bq.style.margin = "10px 0";
        bq.style.color = chatColors.blockquoteText;
        parent.appendChild(bq);
        stack.push(bq);
        break;
      }
      case "blockquote_close":
        stack.pop();
        break;

      case "code_block":
      case "fence": {
        const pre = doc.createElementNS(HTML_NS, "pre") as HTMLElement;
        const code = doc.createElementNS(HTML_NS, "code") as HTMLElement;

        // Get language from fence info (e.g., ```javascript)
        const lang = token.info?.trim() || "";

        // Apply dark/light theme styles
        const dark = isDarkMode();
        pre.style.background = dark ? "#1e1e1e" : "#f6f8fa";
        pre.style.color = dark ? "#d4d4d4" : "#24292e";
        pre.style.padding = "12px";
        pre.style.borderRadius = "6px";
        pre.style.overflow = "auto";
        pre.style.fontSize = "13px";
        pre.style.fontFamily =
          "'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
        pre.style.lineHeight = "1.45";
        pre.style.margin = "8px 0";

        // Try to highlight with language detection
        try {
          let highlighted: string;
          if (lang && hljs.getLanguage(lang)) {
            highlighted = hljs.highlight(token.content, {
              language: lang,
            }).value;
          } else {
            highlighted = hljs.highlightAuto(token.content).value;
          }
          // Safely convert highlight.js HTML to DOM elements
          renderHighlightedCode(doc, code, highlighted, dark);
        } catch {
          // Fallback to plain text if highlighting fails
          code.textContent = token.content;
        }

        pre.appendChild(code);
        parent.appendChild(pre);
        break;
      }

      case "hr": {
        const hr = doc.createElementNS(HTML_NS, "hr") as HTMLElement;
        hr.style.border = "none";
        hr.style.borderTop = `1px solid ${chatColors.hrBorder}`;
        hr.style.margin = "15px 0";
        parent.appendChild(hr);
        break;
      }

      case "table_open": {
        // Create a wrapper for the table with copy button
        const tableWrapper = doc.createElementNS(HTML_NS, "div") as HTMLElement;
        tableWrapper.style.position = "relative";
        tableWrapper.style.margin = "10px 0";
        parent.appendChild(tableWrapper);

        const table = doc.createElementNS(HTML_NS, "table") as HTMLElement;
        table.style.borderCollapse = "collapse";
        table.style.width = "100%";
        table.style.fontSize = "12px";
        tableWrapper.appendChild(table);
        stack.push(table);

        // Store reference to wrapper for adding copy button later
        (table as any)._wrapper = tableWrapper;
        break;
      }
      case "table_close": {
        const table = stack[stack.length - 1];
        stack.pop();

        // Add copy button to table wrapper
        const tableWrapper = (table as any)._wrapper as HTMLElement;
        if (tableWrapper) {
          addTableCopyButton(doc, tableWrapper, table);
        }
        break;
      }

      case "thead_open": {
        const thead = doc.createElementNS(HTML_NS, "thead") as HTMLElement;
        parent.appendChild(thead);
        stack.push(thead);
        break;
      }
      case "thead_close":
        stack.pop();
        break;

      case "tbody_open": {
        const tbody = doc.createElementNS(HTML_NS, "tbody") as HTMLElement;
        parent.appendChild(tbody);
        stack.push(tbody);
        break;
      }
      case "tbody_close":
        stack.pop();
        break;

      case "tr_open": {
        const tr = doc.createElementNS(HTML_NS, "tr") as HTMLElement;
        parent.appendChild(tr);
        stack.push(tr);
        break;
      }
      case "tr_close":
        stack.pop();
        break;

      case "th_open": {
        const th = doc.createElementNS(HTML_NS, "th") as HTMLElement;
        th.style.border = `1px solid ${chatColors.tableBorder}`;
        th.style.padding = "8px";
        th.style.background = chatColors.tableBg;
        th.style.fontWeight = "bold";
        th.style.textAlign = "left";
        parent.appendChild(th);
        stack.push(th);
        break;
      }
      case "th_close":
        stack.pop();
        break;

      case "td_open": {
        const td = doc.createElementNS(HTML_NS, "td") as HTMLElement;
        td.style.border = `1px solid ${chatColors.tableBorder}`;
        td.style.padding = "8px";
        parent.appendChild(td);
        stack.push(td);
        break;
      }
      case "td_close":
        stack.pop();
        break;

      case "math_block": {
        // Render display math (block-level)
        const mathHtml = renderMathToHTML(token.content, true);
        const wrapper = doc.createElementNS(HTML_NS, "div") as HTMLElement;
        wrapper.style.margin = "10px 0";
        wrapper.style.overflow = "auto";
        renderMathHTMLToDOM(doc, wrapper, mathHtml);
        parent.appendChild(wrapper);
        break;
      }

      case "inline":
        if (token.children) {
          renderInlineTokens(doc, parent, token.children);
        }
        break;

      case "softbreak":
        parent.appendChild(doc.createTextNode(" "));
        break;

      case "hardbreak":
        parent.appendChild(doc.createElementNS(HTML_NS, "br"));
        break;
    }
  }

  return container;
}

/**
 * Render inline tokens (text, bold, italic, code, links, math, etc.)
 */
export function renderInlineTokens(
  doc: Document,
  parent: HTMLElement,
  tokens: ReturnType<typeof md.parse>,
): void {
  const stack: HTMLElement[] = [parent];

  for (const token of tokens) {
    const current = stack[stack.length - 1];

    switch (token.type) {
      case "text":
        current.appendChild(doc.createTextNode(token.content));
        break;

      case "strong_open": {
        const strong = doc.createElementNS(HTML_NS, "strong") as HTMLElement;
        current.appendChild(strong);
        stack.push(strong);
        break;
      }
      case "strong_close":
        stack.pop();
        break;

      case "em_open": {
        const em = doc.createElementNS(HTML_NS, "em") as HTMLElement;
        current.appendChild(em);
        stack.push(em);
        break;
      }
      case "em_close":
        stack.pop();
        break;

      case "s_open": {
        const s = doc.createElementNS(HTML_NS, "s") as HTMLElement;
        current.appendChild(s);
        stack.push(s);
        break;
      }
      case "s_close":
        stack.pop();
        break;

      case "code_inline": {
        const codeInline = doc.createElementNS(HTML_NS, "code") as HTMLElement;
        codeInline.style.background = chatColors.codeInlineBg;
        codeInline.style.padding = "2px 6px";
        codeInline.style.borderRadius = "3px";
        codeInline.style.fontFamily = "monospace";
        codeInline.style.fontSize = "0.9em";
        codeInline.textContent = token.content;
        current.appendChild(codeInline);
        break;
      }

      case "link_open": {
        const a = doc.createElementNS(HTML_NS, "a") as HTMLAnchorElement;
        const href = token.attrGet("href");
        if (href) a.href = href;
        a.style.color = chatColors.markdownLink;
        a.style.textDecoration = "underline";
        current.appendChild(a);
        stack.push(a);
        break;
      }
      case "link_close":
        stack.pop();
        break;

      case "math_inline": {
        // Render inline math
        const mathHtml = renderMathToHTML(token.content, false);
        const span = doc.createElementNS(HTML_NS, "span") as HTMLElement;
        renderMathHTMLToDOM(doc, span, mathHtml);
        current.appendChild(span);
        break;
      }

      case "softbreak":
        current.appendChild(doc.createTextNode(" "));
        break;

      case "hardbreak":
        current.appendChild(doc.createElementNS(HTML_NS, "br"));
        break;
    }
  }
}

/**
 * Render KaTeX HTML output to DOM elements
 * This parses the HTML string and builds DOM elements manually to avoid innerHTML
 */
function renderMathHTMLToDOM(
  doc: Document,
  parent: HTMLElement,
  html: string,
): void {
  // Use a stack-based parser to handle nested HTML tags
  const stack: Array<{ element: HTMLElement; tagName: string }> = [
    { element: parent, tagName: "root" },
  ];

  let pos = 0;
  const len = html.length;

  while (pos < len) {
    const current = stack[stack.length - 1];

    // Check for closing tag
    if (html.startsWith("</", pos)) {
      const closeMatch = html.slice(pos).match(/^<\/([a-zA-Z][a-zA-Z0-9]*)>/);
      if (closeMatch) {
        const tagName = closeMatch[1].toLowerCase();
        // Pop until we find the matching opening tag
        while (
          stack.length > 1 &&
          stack[stack.length - 1].tagName !== tagName
        ) {
          stack.pop();
        }
        if (stack.length > 1) {
          stack.pop();
        }
        pos += closeMatch[0].length;
        continue;
      }
    }

    // Check for opening tag
    if (html[pos] === "<") {
      const openMatch = html
        .slice(pos)
        .match(/^<([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/);
      if (openMatch) {
        const tagName = openMatch[1].toLowerCase();
        const attrs = openMatch[2];

        // Skip self-closing tags and special elements
        if (tagName === "annotation" || tagName === "semantics") {
          // Find the closing tag and skip everything in between
          const closeTag = `</${tagName}>`;
          const closePos = html.indexOf(closeTag, pos + openMatch[0].length);
          if (closePos !== -1) {
            pos = closePos + closeTag.length;
          } else {
            pos += openMatch[0].length;
          }
          continue;
        }

        // Create the element
        const element = doc.createElementNS(HTML_NS, tagName) as HTMLElement;

        // Parse attributes
        const classMatch = attrs.match(/class="([^"]*)"/);
        if (classMatch) {
          element.setAttribute("class", classMatch[1]);
        }
        const styleMatch = attrs.match(/style="([^"]*)"/);
        if (styleMatch) {
          element.setAttribute("style", styleMatch[1]);
        }
        const ariaMatch = attrs.match(/aria-hidden="([^"]*)"/);
        if (ariaMatch) {
          element.setAttribute("aria-hidden", ariaMatch[1]);
        }

        current.element.appendChild(element);

        // Check if self-closing
        if (
          attrs.endsWith("/") ||
          html[pos + openMatch[0].length - 2] === "/"
        ) {
          pos += openMatch[0].length;
          continue;
        }

        // Push to stack for nested content
        stack.push({ element, tagName });
        pos += openMatch[0].length;
        continue;
      }
    }

    // Check for HTML entities
    if (html[pos] === "&") {
      const entityMatch = html
        .slice(pos)
        .match(/^&(amp|lt|gt|quot|#39|#x27|nbsp|#[0-9]+|#x[0-9a-fA-F]+);/);
      if (entityMatch) {
        const entity = entityMatch[1];
        let char = "";
        switch (entity) {
          case "amp":
            char = "&";
            break;
          case "lt":
            char = "<";
            break;
          case "gt":
            char = ">";
            break;
          case "quot":
            char = '"';
            break;
          case "#39":
          case "#x27":
            char = "'";
            break;
          case "nbsp":
            char = "\u00A0";
            break;
          default:
            if (entity.startsWith("#x")) {
              char = String.fromCharCode(parseInt(entity.slice(2), 16));
            } else if (entity.startsWith("#")) {
              char = String.fromCharCode(parseInt(entity.slice(1), 10));
            } else {
              char = entityMatch[0];
            }
        }
        current.element.appendChild(doc.createTextNode(char));
        pos += entityMatch[0].length;
        continue;
      }
    }

    // Collect text content
    let textEnd = pos;
    while (textEnd < len && html[textEnd] !== "<" && html[textEnd] !== "&") {
      textEnd++;
    }
    if (textEnd > pos) {
      current.element.appendChild(doc.createTextNode(html.slice(pos, textEnd)));
      pos = textEnd;
    } else {
      // Skip unknown character
      pos++;
    }
  }
}

/**
 * Highlight.js color themes for syntax highlighting
 */
const highlightColors = {
  light: {
    keyword: "#d73a49", // red - if, const, return
    string: "#032f62", // dark blue - "strings"
    number: "#005cc5", // blue - 123
    comment: "#6a737d", // gray - // comments
    function: "#6f42c1", // purple - function names
    class: "#6f42c1", // purple - class names
    variable: "#e36209", // orange - variables
    operator: "#d73a49", // red - =, +, -
    punctuation: "#24292e", // black - {, }, (, )
    property: "#005cc5", // blue - object properties
    builtin: "#005cc5", // blue - built-in functions
    attr: "#22863a", // green - attributes
    tag: "#22863a", // green - HTML tags
    selector: "#6f42c1", // purple - CSS selectors
    type: "#d73a49", // red - type names
    literal: "#005cc5", // blue - true, false, null
    meta: "#6a737d", // gray - meta info
    regexp: "#032f62", // dark blue - regex
    symbol: "#e36209", // orange - symbols
  },
  dark: {
    keyword: "#ff7b72", // red - if, const, return
    string: "#a5d6ff", // light blue - "strings"
    number: "#79c0ff", // blue - 123
    comment: "#8b949e", // gray - // comments
    function: "#d2a8ff", // purple - function names
    class: "#d2a8ff", // purple - class names
    variable: "#ffa657", // orange - variables
    operator: "#ff7b72", // red - =, +, -
    punctuation: "#c9d1d9", // light gray - {, }, (, )
    property: "#79c0ff", // blue - object properties
    builtin: "#79c0ff", // blue - built-in functions
    attr: "#7ee787", // green - attributes
    tag: "#7ee787", // green - HTML tags
    selector: "#d2a8ff", // purple - CSS selectors
    type: "#ff7b72", // red - type names
    literal: "#79c0ff", // blue - true, false, null
    meta: "#8b949e", // gray - meta info
    regexp: "#a5d6ff", // light blue - regex
    symbol: "#ffa657", // orange - symbols
  },
} as const;

/**
 * Map highlight.js class names to color keys
 */
const classToColorKey: Record<string, keyof typeof highlightColors.light> = {
  "hljs-keyword": "keyword",
  "hljs-string": "string",
  "hljs-number": "number",
  "hljs-comment": "comment",
  "hljs-function": "function",
  "hljs-class": "class",
  "hljs-variable": "variable",
  "hljs-operator": "operator",
  "hljs-punctuation": "punctuation",
  "hljs-property": "property",
  "hljs-built_in": "builtin",
  "hljs-attr": "attr",
  "hljs-tag": "tag",
  "hljs-selector-tag": "selector",
  "hljs-selector-class": "selector",
  "hljs-selector-id": "selector",
  "hljs-type": "type",
  "hljs-literal": "literal",
  "hljs-meta": "meta",
  "hljs-regexp": "regexp",
  "hljs-symbol": "symbol",
  "hljs-title": "function",
  "hljs-title.function_": "function",
  "hljs-title.class_": "class",
  "hljs-params": "variable",
  "hljs-name": "tag",
  "hljs-attribute": "attr",
  "hljs-doctag": "keyword",
  "hljs-template-variable": "variable",
  "hljs-template-tag": "tag",
  "hljs-subst": "variable",
  "hljs-section": "function",
  "hljs-link": "string",
  "hljs-bullet": "punctuation",
  "hljs-addition": "attr",
  "hljs-deletion": "keyword",
  "hljs-quote": "comment",
  "hljs-selector-attr": "attr",
  "hljs-selector-pseudo": "selector",
  "hljs-strong": "keyword",
  "hljs-emphasis": "comment",
  "hljs-code": "string",
};

/**
 * Safely render highlight.js HTML output to DOM elements
 * This parses the HTML string and builds DOM elements manually to avoid innerHTML
 */
function renderHighlightedCode(
  doc: Document,
  parent: HTMLElement,
  html: string,
  dark: boolean,
): void {
  const colors = dark ? highlightColors.dark : highlightColors.light;

  // Simple regex-based parser for highlight.js output
  // highlight.js only outputs: text, <span class="hljs-xxx">text</span>, and nested spans
  let pos = 0;
  const len = html.length;

  while (pos < len) {
    // Check for span tag
    if (html.startsWith("<span", pos)) {
      const classMatch = html.slice(pos).match(/^<span class="([^"]+)">/);
      if (classMatch) {
        const className = classMatch[1];
        const openTagEnd = pos + classMatch[0].length;

        // Find the matching closing tag (handle nesting)
        let depth = 1;
        let closePos = openTagEnd;
        while (depth > 0 && closePos < len) {
          if (html.startsWith("<span", closePos)) {
            depth++;
            const innerMatch = html.slice(closePos).match(/^<span[^>]*>/);
            closePos += innerMatch ? innerMatch[0].length : 5;
          } else if (html.startsWith("</span>", closePos)) {
            depth--;
            if (depth > 0) closePos += 7;
          } else {
            closePos++;
          }
        }

        // Extract inner content and create span
        const innerHtml = html.slice(openTagEnd, closePos);
        const span = doc.createElementNS(HTML_NS, "span") as HTMLElement;

        // Apply color based on class
        const colorKey = classToColorKey[className];
        if (colorKey && colors[colorKey]) {
          span.style.color = colors[colorKey];
        }

        // Recursively render inner content
        renderHighlightedCode(doc, span, innerHtml, dark);
        parent.appendChild(span);

        pos = closePos + 7; // Skip past </span>
        continue;
      }
    }

    // Check for HTML entities
    if (html[pos] === "&") {
      const entityMatch = html
        .slice(pos)
        .match(/^&(amp|lt|gt|quot|#39|#x27|nbsp);/);
      if (entityMatch) {
        const entity = entityMatch[1];
        let char = "";
        switch (entity) {
          case "amp":
            char = "&";
            break;
          case "lt":
            char = "<";
            break;
          case "gt":
            char = ">";
            break;
          case "quot":
            char = '"';
            break;
          case "#39":
          case "#x27":
            char = "'";
            break;
          case "nbsp":
            char = "\u00A0";
            break;
          default:
            char = entityMatch[0];
        }
        parent.appendChild(doc.createTextNode(char));
        pos += entityMatch[0].length;
        continue;
      }
    }

    // Regular text - collect until next tag or entity
    let textEnd = pos;
    while (textEnd < len && html[textEnd] !== "<" && html[textEnd] !== "&") {
      textEnd++;
    }
    if (textEnd > pos) {
      parent.appendChild(doc.createTextNode(html.slice(pos, textEnd)));
      pos = textEnd;
    } else {
      // Single character that's not part of a tag or entity
      parent.appendChild(doc.createTextNode(html[pos]));
      pos++;
    }
  }
}

/**
 * Extract table content as markdown format for copying
 */
function extractTableContent(table: HTMLElement): string {
  const rows: string[] = [];

  // Get all rows from thead and tbody
  const allRows = table.querySelectorAll("tr");

  allRows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("th, td");
    const cellContents: string[] = [];

    cells.forEach((cell) => {
      // Get text content, preserving line breaks as spaces
      let content = cell.textContent?.replace(/\n/g, " ").trim() || "";
      // Escape pipe characters
      content = content.replace(/\|/g, "\\|");
      cellContents.push(content);
    });

    rows.push("| " + cellContents.join(" | ") + " |");

    // Add separator after header row (first row)
    if (rowIndex === 0) {
      const separators = cellContents.map(() => "---");
      rows.push("| " + separators.join(" | ") + " |");
    }
  });

  return rows.join("\n");
}

/**
 * Add a copy button to table wrapper
 */
function addTableCopyButton(
  doc: Document,
  tableWrapper: HTMLElement,
  table: HTMLElement,
): void {
  // Create copy button
  const copyBtn = doc.createElementNS(HTML_NS, "button") as HTMLButtonElement;
  copyBtn.style.position = "absolute";
  copyBtn.style.top = "4px";
  copyBtn.style.right = "4px";
  copyBtn.style.padding = "4px 8px";
  copyBtn.style.background = "rgba(255, 255, 255, 0.9)";
  copyBtn.style.border = "1px solid #ddd";
  copyBtn.style.borderRadius = "4px";
  copyBtn.style.cursor = "pointer";
  copyBtn.style.fontSize = "11px";
  copyBtn.style.opacity = "0";
  copyBtn.style.transition = "opacity 0.2s ease";
  copyBtn.style.zIndex = "10";
  copyBtn.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
  copyBtn.textContent = getString("chat-copy-table");

  // Show button on hover
  tableWrapper.addEventListener("mouseenter", () => {
    copyBtn.style.opacity = "1";
  });
  tableWrapper.addEventListener("mouseleave", () => {
    copyBtn.style.opacity = "0";
  });

  // Copy functionality
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const tableContent = extractTableContent(table);
    copyToClipboard(tableContent);

    // Show success feedback
    copyBtn.textContent = "✓";
    copyBtn.style.fontWeight = "600";

    setTimeout(() => {
      copyBtn.style.opacity = "0";
      setTimeout(() => {
        copyBtn.textContent = getString("chat-copy-table");
        copyBtn.style.fontWeight = "normal";
      }, 200);
    }, 800);
  });

  tableWrapper.appendChild(copyBtn);
}
