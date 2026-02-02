/**
 * PdfExtractor - PDF内容提取工具
 */

export class PdfExtractor {
  // 存储当前划选的文本
  private currentSelectedText: string | null = null;
  // 是否已注册事件监听
  private isEventListenerRegistered: boolean = false;

  constructor() {
    this.registerSelectionListener();
  }

  /**
   * 注册划选文字监听事件
   * 参考 zotero-pdf-translate 的实现方式
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
            ztoolkit.log(
              "[PdfExtractor] Text selected:",
              this.currentSelectedText.substring(0, 50),
            );
          }
        },
        // 使用一个唯一的标识符
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
   * 获取当前划选的PDF文本
   * 获取后会清空存储的文本，避免重复发送
   */
  getSelectedTextFromReader(): string | null {
    // 确保事件监听已注册
    if (!this.isEventListenerRegistered) {
      this.registerSelectionListener();
    }

    const text = this.currentSelectedText;
    if (text) {
      ztoolkit.log(
        "[PdfExtractor] Getting selected text:",
        text.substring(0, 50),
      );
      // 获取后清空，避免重复发送
      this.currentSelectedText = null;
      return text;
    }
    return null;
  }

  /**
   * 查找Item的PDF附件
   * 统一的PDF附件查找逻辑，避免重复代码
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
   * 获取Item的PDF附件文本
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
   * 检查是否有PDF附件
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
   * 获取PDF附件信息
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
   * ArrayBuffer转Base64
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
