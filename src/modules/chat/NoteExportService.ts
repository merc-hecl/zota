/**
 * NoteExportService - Export chat history as Zotero notes
 *
 * Uses marked.js to convert Markdown to HTML
 * Images are embedded as base64 data URLs for proper display in notes
 */

import type { ChatSession, ChatMessage } from "../../types/chat";
import { marked } from "marked";

export class NoteExportService {
  /**
   * Generate Markdown content for the note
   * Structure:
   * - Session title as H1
   * - User questions as H2
   * - AI responses as content
   * - Include quotes (selectedText), images, and document references
   */
  generateMarkdown(
    session: ChatSession,
    imageData: Map<string, { base64: string; mimeType: string }>,
  ): string {
    let markdown = "";

    // Filter out system messages, but keep messages with quotes, images, or documents even if content is empty
    const validMessages = session.messages.filter((msg) => {
      if (msg.role === "system") return false;
      // Keep if has content, or has selectedText, or has images, or has documents
      const hasContent = msg.content && msg.content.trim() !== "";
      const hasQuote = msg.selectedText && msg.selectedText.trim() !== "";
      const hasImages = msg.images && msg.images.length > 0;
      const hasDocuments = msg.documents && msg.documents.length > 0;
      return hasContent || hasQuote || hasImages || hasDocuments;
    });

    // Get session title, use first user question if not available
    let sessionTitle = session.title;
    if (!sessionTitle || sessionTitle === "未命名会话") {
      const firstUserMessage = validMessages.find((msg) => msg.role === "user");
      if (firstUserMessage) {
        const { question } = this.extractUserQuestion(firstUserMessage);
        sessionTitle =
          question.length > 50 ? question.substring(0, 50) + "..." : question;
      }
    }
    if (!sessionTitle) {
      sessionTitle = "未命名会话";
    }

    markdown += `# ${sessionTitle}\n\n`;

    for (const message of validMessages) {
      if (message.role === "user") {
        const { question, documentTitles } = this.extractUserQuestion(message);

        if (question) {
          markdown += `## ${question}\n\n`;
        }

        // Add referenced documents section if exists
        if (documentTitles.length > 0) {
          markdown += `**Referenced Documents:**\n`;
          for (const title of documentTitles) {
            markdown += `- ${title}\n`;
          }
          markdown += `\n`;
        }

        // Add quoted text if exists
        if (message.selectedText && message.selectedText.trim()) {
          const quoteLines = message.selectedText
            .trim()
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          markdown += `${quoteLines}\n\n`;
        }

        // Add images as placeholders that will be replaced with HTML img tags
        if (message.images && message.images.length > 0) {
          for (const image of message.images) {
            const imgData = imageData.get(image.id);
            if (imgData) {
              // Use a unique placeholder that will be replaced with actual img tag
              markdown += `<!--IMAGE_PLACEHOLDER_${image.id}-->\n\n`;
            }
          }
        }
      } else if (message.role === "assistant") {
        // For regenerated messages, use the last version's content
        let answer = message.content;
        if (message.contentVersions && message.contentVersions.length > 0) {
          answer =
            message.contentVersions[message.contentVersions.length - 1].content;
        }
        answer = answer.trim();

        // Include reasoning content if present
        if (message.reasoningContent && message.reasoningContent.trim()) {
          markdown += `<details><summary>Thinking Process</summary>\n\n${message.reasoningContent.trim()}\n\n</details>\n\n`;
        }

        markdown += `${answer}\n\n---\n\n`;
      } else if (message.role === "error") {
        markdown += `> ⚠️ Error: ${message.content.trim()}\n\n---\n\n`;
      }
    }

    return markdown.trim();
  }

  /**
   * Extract user question from message content
   * Removes PDF content, document content, and selected text prefixes
   * Returns both the cleaned question and any document titles found
   */
  private extractUserQuestion(message: ChatMessage): {
    question: string;
    documentTitles: string[];
  } {
    const documentTitles: string[] = [];

    // If message has documents field, use that for document titles
    if (message.documents && message.documents.length > 0) {
      for (const doc of message.documents) {
        if (doc.title) {
          documentTitles.push(doc.title);
        }
      }
    }

    if (!message.content) {
      return { question: "", documentTitles };
    }

    let question = message.content;

    // Extract document titles from [Document: Title]: sections
    // This handles multi-document sessions where content includes document sections
    const documentMatches = question.matchAll(/\[Document:\s*([^\]]+)\]:/g);
    for (const match of documentMatches) {
      const title = match[1].trim();
      if (title && !documentTitles.includes(title)) {
        documentTitles.push(title);
      }
    }

    // Remove [Document: Title]: sections with their full content
    // Pattern matches: [Document: Title]:\n...content... until next section or end
    question = question.replace(
      /\[Document:\s*[^\]]+\]:[\s\S]*?(?=\[Document:|\[Question\]:|\[Selected|\[PDF Content\]:|$)/g,
      "",
    );

    // Remove PDF content section
    question = question.replace(
      /\[PDF Content\]:[\s\S]*?(?=\[Question\]:|$)/,
      "",
    );

    // Remove Selected text section (including the quoted text after it)
    // This handles multiline selected text
    question = question.replace(
      /\[Selected[^\]]*\]:\s*"?[\s\S]*?(?=\[Question\]:|$)/,
      "",
    );

    // Remove Question prefix
    question = question.replace(/^\[Question\]:\s*/, "");

    question = question.trim();

    return { question, documentTitles };
  }

  /**
   * Collect image data from session messages
   * Returns a map of image id to base64 data and mime type
   */
  private collectImageData(
    session: ChatSession,
  ): Map<string, { base64: string; mimeType: string }> {
    const imageData = new Map<string, { base64: string; mimeType: string }>();

    for (const message of session.messages) {
      if (message.images && message.images.length > 0) {
        for (const image of message.images) {
          // Ensure base64 has proper data URL prefix
          let base64Data = image.base64;
          if (!base64Data.startsWith("data:")) {
            base64Data = `data:${image.mimeType};base64,${base64Data}`;
          }
          imageData.set(image.id, {
            base64: base64Data,
            mimeType: image.mimeType,
          });
        }
      }
    }

    return imageData;
  }

  /**
   * Convert Markdown to HTML using marked.js
   * Key: Protect math expressions before conversion, restore after
   */
  private markdownToHtml(markdown: string): string {
    // Step 1: Protect math expressions (prevent underscores from being converted to italics)
    const mathExpressions: Array<{ content: string; placeholder: string }> = [];
    let mathIndex = 0;

    // Protect block math $$...$$
    let processedMarkdown = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      const placeholder = `<!--MATH_BLOCK_${mathIndex}-->`;
      mathExpressions.push({ content: match, placeholder });
      mathIndex++;
      return placeholder;
    });

    // Protect inline math $...$
    processedMarkdown = processedMarkdown.replace(
      /\$([^$\s][^$]*?)\$(?!\$)/g,
      (match) => {
        const placeholder = `<!--MATH_INLINE_${mathIndex}-->`;
        mathExpressions.push({ content: match, placeholder });
        mathIndex++;
        return placeholder;
      },
    );

    // Step 2: Configure marked and convert
    const renderer = new marked.Renderer();

    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = lang || "";
      const langClass = language ? ` class="language-${language}"` : "";
      return `<pre><code${langClass}>${this.escapeHtml(text)}</code></pre>`;
    };

    renderer.codespan = ({ text }: { text: string }) => {
      return `<code>${this.escapeHtml(text)}</code>`;
    };

    marked.setOptions({
      renderer: renderer,
      gfm: true,
      breaks: true,
    });

    let html = marked.parse(processedMarkdown) as string;

    // Step 3: Restore math expressions (in reverse order)
    for (let i = mathExpressions.length - 1; i >= 0; i--) {
      const math = mathExpressions[i];
      html = html.split(math.placeholder).join(math.content);
    }

    return html;
  }

  /**
   * Generate HTML content for the note
   * Images are embedded as base64 data URLs
   */
  async generateHtml(session: ChatSession): Promise<string> {
    // Collect image data (base64)
    const imageData = this.collectImageData(session);

    // Generate markdown with image placeholders
    const markdown = this.generateMarkdown(session, imageData);

    // Convert markdown to HTML
    let html = this.markdownToHtml(markdown);

    // Replace image placeholders with actual img tags
    for (const [id, data] of imageData) {
      const placeholder = `<!--IMAGE_PLACEHOLDER_${id}-->`;
      // The placeholder might be wrapped in <p> tags by marked, handle both cases
      const imgTag = `<img src="${data.base64}" alt="Image" style="max-width: 100%; height: auto; margin: 8px 0;" />`;
      html = html.replace(new RegExp(`<p>${placeholder}</p>`, "g"), imgTag);
      html = html.replace(new RegExp(placeholder, "g"), imgTag);
    }

    return html;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Export session as a Zotero note item
   */
  async exportSessionAsNote(
    session: ChatSession,
    itemId: number,
  ): Promise<{ success: boolean; message: string; noteItem?: Zotero.Item }> {
    try {
      let targetItem: Zotero.Item | null = null;
      let parentItem: Zotero.Item | null = null;

      if (itemId !== 0) {
        targetItem = await Zotero.Items.getAsync(itemId);
        if (targetItem) {
          if (targetItem.isAttachment()) {
            const parentId = targetItem.parentItemID;
            if (parentId) {
              parentItem = await Zotero.Items.getAsync(parentId);
            } else {
              // PDF has no parent item, create one
              parentItem = await this.createParentItem(targetItem);
            }
          } else {
            parentItem = targetItem;
          }
        }
      }

      const noteContent = await this.generateHtml(session);
      const noteTitle = session.title || "未命名会话";

      let noteItem: Zotero.Item;

      if (parentItem) {
        noteItem = new Zotero.Item("note");
        noteItem.setNote(noteContent);
        noteItem.parentID = parentItem.id;
        await noteItem.saveTx();

        ztoolkit.log(
          "Note created and attached to item:",
          parentItem.id,
          "note id:",
          noteItem.id,
        );
      } else {
        noteItem = new Zotero.Item("note");
        noteItem.setNote(noteContent);
        await noteItem.saveTx();

        ztoolkit.log("Standalone note created:", noteItem.id);
      }

      return {
        success: true,
        message: `Note created: ${noteTitle}`,
        noteItem,
      };
    } catch (error) {
      ztoolkit.log("Export note error:", error);
      return {
        success: false,
        message: `Export failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Create a parent item for a standalone PDF attachment
   */
  private async createParentItem(
    attachmentItem: Zotero.Item,
  ): Promise<Zotero.Item> {
    // Create a new book item as parent
    const parentItem = new Zotero.Item("book");

    // Use attachment filename as title (without extension)
    // Try multiple methods to get the filename
    let filename = "";
    try {
      // Method 1: getFilePath
      const filePath = attachmentItem.getFilePath();
      if (filePath) {
        const pathParts = filePath.split(/[/\\]/);
        filename = pathParts[pathParts.length - 1];
      }
    } catch (e) {
      // Ignore error
    }

    if (!filename) {
      try {
        // Method 2: attachmentFilename property

        filename = (attachmentItem as any).attachmentFilename || "";
      } catch (e) {
        // Ignore error
      }
    }

    if (!filename) {
      try {
        // Method 3: getField with attachmentFilename

        filename = (attachmentItem as any).getField("attachmentFilename") || "";
      } catch (e) {
        // Ignore error
      }
    }

    const title = filename ? filename.replace(/\.pdf$/i, "") : "Untitled";
    parentItem.setField("title", title);

    // Save the parent item
    await parentItem.saveTx();

    // Move the attachment under the new parent
    attachmentItem.parentID = parentItem.id;
    await attachmentItem.saveTx();

    ztoolkit.log(
      "Created parent item for attachment:",
      attachmentItem.id,
      "parent id:",
      parentItem.id,
    );

    return parentItem;
  }
}

// Singleton instance
let noteExportService: NoteExportService | null = null;

export function getNoteExportService(): NoteExportService {
  if (!noteExportService) {
    noteExportService = new NoteExportService();
  }
  return noteExportService;
}
