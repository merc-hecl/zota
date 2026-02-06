/**
 * PdfExtractor - PDF content extraction utility
 */

export class PdfExtractor {
  // Stores currently selected text
  private currentSelectedText: string | null = null;
  // Whether event listener is registered
  private isEventListenerRegistered: boolean = false;
  // Current document ID for document isolation
  private currentDocumentId: number | null = null;
  // Text selection callback function
  private onTextSelectedCallback:
    | ((text: string, documentId: number) => void)
    | null = null;
  // Last processed text for deduplication
  private lastProcessedText: string | null = null;
  // Last processed timestamp for deduplication
  private lastProcessedTime: number = 0;
  // Deduplication time window (milliseconds)
  private static DEDUPLICATION_WINDOW = 100;

  constructor() {
    this.registerSelectionListener();
  }

  /**
   * Set callback for text selection events
   */
  setOnTextSelectedCallback(
    callback: (text: string, documentId: number) => void,
  ): void {
    this.onTextSelectedCallback = callback;
  }

  /**
   * Get current document ID
   */
  getCurrentDocumentId(): number | null {
    return this.currentDocumentId;
  }

  /**
   * Register text selection listener
   * Reference: zotero-pdf-translate implementation approach
   */
  private registerSelectionListener(): void {
    if (this.isEventListenerRegistered) return;

    try {
      Zotero.Reader.registerEventListener(
        "renderTextSelectionPopup",
        (event) => {
          const { params } = event;
          if (params?.annotation?.text) {
            this.currentSelectedText = params.annotation.text.trim();

            // Get current document ID from reader
            const mainWindow = Zotero.getMainWindow() as Window & {
              Zotero_Tabs?: { selectedID: string };
            };
            const tabs = mainWindow.Zotero_Tabs;
            if (tabs) {
              const reader = Zotero.Reader.getByTabID(tabs.selectedID);
              if (reader?.itemID) {
                this.currentDocumentId = reader.itemID;
              }
            }

            // Check for duplicate events (same text within short time window)
            const now = Date.now();
            const isDuplicate =
              this.currentSelectedText === this.lastProcessedText &&
              now - this.lastProcessedTime < PdfExtractor.DEDUPLICATION_WINDOW;

            if (!isDuplicate) {
              this.lastProcessedText = this.currentSelectedText;
              this.lastProcessedTime = now;

              ztoolkit.log(
                "[PdfExtractor] Text selected:",
                this.currentSelectedText.substring(0, 50),
                "Document ID:",
                this.currentDocumentId,
              );

              // Trigger callback if set
              if (
                this.onTextSelectedCallback &&
                this.currentSelectedText &&
                this.currentDocumentId
              ) {
                this.onTextSelectedCallback(
                  this.currentSelectedText,
                  this.currentDocumentId,
                );
              }
            }
          }
        },
        // Use a unique identifier
        "zota-pdf-extractor",
      );
      this.isEventListenerRegistered = true;
      ztoolkit.log("[PdfExtractor] Selection listener registered");
    } catch (error) {
      ztoolkit.log(
        "[PdfExtractor] Failed to register selection listener:",
        error,
      );
    }
  }

  /**
   * Get currently selected PDF text
   * Clears stored text after retrieval to avoid duplicate sending
   */
  getSelectedTextFromReader(): string | null {
    // Ensure event listener is registered
    if (!this.isEventListenerRegistered) {
      this.registerSelectionListener();
    }

    const text = this.currentSelectedText;
    if (text) {
      ztoolkit.log(
        "[PdfExtractor] Getting selected text:",
        text.substring(0, 50),
      );
      // Clear after retrieval to avoid duplicate sending
      this.currentSelectedText = null;
      return text;
    }
    return null;
  }

  /**
   * Find PDF attachment for an item
   * Unified PDF attachment lookup logic to avoid code duplication
   */
  private async findPdfAttachment(
    item: Zotero.Item,
  ): Promise<Zotero.Item | null> {
    // Check if the item itself is a PDF attachment
    if (
      item.isAttachment() &&
      item.attachmentContentType === "application/pdf"
    ) {
      return item;
    }

    // Otherwise, look for PDF attachments on the item
    const attachments = item.getAttachments();
    for (const attachmentID of attachments) {
      const attachment = await Zotero.Items.getAsync(attachmentID);
      if (attachment?.attachmentContentType === "application/pdf") {
        return attachment;
      }
    }

    return null;
  }

  /**
   * Extract text from item's PDF attachment
   */
  async extractPdfText(item: Zotero.Item): Promise<string | null> {
    try {
      const pdfAttachment = await this.findPdfAttachment(item);
      if (!pdfAttachment) return null;

      const text = await pdfAttachment.attachmentText;
      if (text) {
        ztoolkit.log("PDF text extracted, length:", text.length);
        return text;
      }
      return null;
    } catch (error) {
      ztoolkit.log("Error extracting PDF:", error);
      return null;
    }
  }

  /**
   * Check if item has PDF attachment
   */
  async hasPdfAttachment(item: Zotero.Item): Promise<boolean> {
    try {
      const pdfAttachment = await this.findPdfAttachment(item);
      return pdfAttachment !== null;
    } catch (error) {
      ztoolkit.log("Error checking PDF attachment:", error);
      return false;
    }
  }

  /**
   * Get PDF attachment information
   */
  async getPdfInfo(
    item: Zotero.Item,
  ): Promise<{ name: string; size: number } | null> {
    try {
      const pdfAttachment = await this.findPdfAttachment(item);
      if (!pdfAttachment) return null;

      const path = await pdfAttachment.getFilePathAsync();
      if (!path) return null;

      const info = await IOUtils.stat(path);
      return {
        name: pdfAttachment.attachmentFilename || "document.pdf",
        size: info.size ?? 0,
      };
    } catch (error) {
      ztoolkit.log("Error getting PDF info:", error);
      return null;
    }
  }

  /**
   * Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
