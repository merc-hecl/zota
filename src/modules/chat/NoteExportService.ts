/**
 * NoteExportService - Export chat history as Zotero notes
 *
 * Uses marked.js to convert Markdown to HTML
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
   * - Include quotes (selectedText) and images
   */
  generateMarkdown(
    session: ChatSession,
    imagePaths: Map<string, string>,
  ): string {
    let markdown = "";

    // Filter out system messages, but keep messages with quotes or images even if content is empty
    const validMessages = session.messages.filter((msg) => {
      if (msg.role === "system") return false;
      // Keep if has content, or has selectedText, or has images
      const hasContent = msg.content && msg.content.trim() !== "";
      const hasQuote = msg.selectedText && msg.selectedText.trim() !== "";
      const hasImages = msg.images && msg.images.length > 0;
      return hasContent || hasQuote || hasImages;
    });

    // Get session title, use first user question if not available
    let sessionTitle = session.title;
    if (!sessionTitle || sessionTitle === "未命名会话") {
      const firstUserMessage = validMessages.find((msg) => msg.role === "user");
      if (firstUserMessage) {
        const question = this.extractUserQuestion(firstUserMessage);
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
        const question = this.extractUserQuestion(message);

        if (question) {
          markdown += `## ${question}\n\n`;
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

        // Add image path hints if images exist
        if (message.images && message.images.length > 0) {
          markdown += `> 📎 **Images:**\n`;
          for (const image of message.images) {
            const filePath = imagePaths.get(image.id);
            if (filePath) {
              markdown += `> - ${filePath}\n`;
            }
          }
          markdown += `\n`;
        }
      } else if (message.role === "assistant") {
        const answer = message.content.trim();
        markdown += `${answer}\n\n---\n\n`;
      } else if (message.role === "error") {
        markdown += `> ⚠️ Error: ${message.content.trim()}\n\n---\n\n`;
      }
    }

    return markdown.trim();
  }

  /**
   * Extract user question from message content
   * Removes PDF content and selected text prefixes
   */
  private extractUserQuestion(message: ChatMessage): string {
    if (!message.content) return "";

    let question = message.content;

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

    return question;
  }

  /**
   * Save images to Zotero storage and return file paths
   */
  private async saveImages(session: ChatSession): Promise<Map<string, string>> {
    const imagePaths = new Map<string, string>();

    for (const message of session.messages) {
      if (message.images && message.images.length > 0) {
        for (const image of message.images) {
          try {
            // Decode base64 to binary
            const binaryString = atob(
              image.base64.split(",")[1] || image.base64,
            );
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }

            // Create file name
            const extension = this.getExtensionFromMimeType(image.mimeType);
            const fileName = `chat-image-${image.id}.${extension}`;

            // Get Zotero directory
            const storageDir = Zotero.getZoteroDirectory().path;
            const sessionDir = PathUtils.join(
              storageDir,
              "chat-images",
              session.id,
            );

            // Ensure directory exists
            await IOUtils.makeDirectory(sessionDir, { createAncestors: true });

            // Save file
            const filePath = PathUtils.join(sessionDir, fileName);
            await IOUtils.write(filePath, bytes);

            imagePaths.set(image.id, filePath);
          } catch (error) {
            ztoolkit.log("Error saving image:", error);
            imagePaths.set(image.id, "[Failed to save image]");
          }
        }
      }
    }

    return imagePaths;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    return mimeToExt[mimeType] || "png";
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
   */
  async generateHtml(session: ChatSession): Promise<string> {
    // Save images and get file paths
    const imagePaths = await this.saveImages(session);

    // Generate markdown with image path hints
    const markdown = this.generateMarkdown(session, imagePaths);

    return this.markdownToHtml(markdown);
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
