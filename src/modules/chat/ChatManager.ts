/**
 * ChatManager - 聊天会话管理核心类
 * 支持一个文档多个会话的管理
 */

import type {
  ChatMessage,
  ChatSession,
  SendMessageOptions,
  StreamCallbacks,
} from "../../types/chat";
import type { ApiKeyProviderConfig } from "../../types/provider";
import { StorageService } from "./StorageService";
import { PdfExtractor } from "./PdfExtractor";
import { getProviderManager } from "../providers";
import { getString } from "../../utils/locale";

export class ChatManager {
  // 内存缓存：itemId -> 当前活动会话
  private activeSessions: Map<number, ChatSession> = new Map();
  private activeItemId: number | null = null;
  private storageService: StorageService;
  private pdfExtractor: PdfExtractor;

  // UI回调
  private onMessageUpdate?: (itemId: number, messages: ChatMessage[]) => void;
  private onStreamingUpdate?: (itemId: number, content: string) => void;
  private onError?: (error: Error) => void;
  private onPdfAttached?: () => void;
  private onMessageComplete?: () => void;

  constructor() {
    this.storageService = new StorageService();
    this.pdfExtractor = new PdfExtractor();
  }

  /**
   * Get the active AI provider
   */
  private getActiveProvider() {
    return getProviderManager().getActiveProvider();
  }

  /**
   * 设置UI回调
   */
  setCallbacks(callbacks: {
    onMessageUpdate?: (itemId: number, messages: ChatMessage[]) => void;
    onStreamingUpdate?: (itemId: number, content: string) => void;
    onError?: (error: Error) => void;
    onPdfAttached?: () => void;
    onMessageComplete?: () => void;
  }): void {
    this.onMessageUpdate = callbacks.onMessageUpdate;
    this.onStreamingUpdate = callbacks.onStreamingUpdate;
    this.onError = callbacks.onError;
    this.onPdfAttached = callbacks.onPdfAttached;
    this.onMessageComplete = callbacks.onMessageComplete;
  }

  /**
   * 获取当前活动的会话
   * 先检查内存缓存，如果没有则从存储加载
   */
  async getActiveSession(itemId: number): Promise<ChatSession | null> {
    // 先检查内存缓存
    if (this.activeSessions.has(itemId)) {
      return this.activeSessions.get(itemId)!;
    }
    // 从存储加载活动会话
    const session = await this.storageService.getActiveSession(itemId);
    if (session) {
      this.activeSessions.set(itemId, session);
      return session;
    }
    return null;
  }

  /**
   * 设置当前活动的Item
   */
  setActiveItem(itemId: number): void {
    this.activeItemId = itemId;
  }

  /**
   * 获取当前全局活动会话
   */
  getCurrentActiveSession(): ChatSession | null {
    if (this.activeItemId && this.activeSessions.has(this.activeItemId)) {
      return this.activeSessions.get(this.activeItemId)!;
    }
    return null;
  }

  /**
   * 显示错误消息到聊天界面
   */
  async showErrorMessage(content: string, itemId: number = 0): Promise<void> {
    const session = await this.getOrCreateSession(itemId);
    const errorMessage: ChatMessage = {
      id: this.generateId(),
      role: "assistant",
      content,
      timestamp: Date.now(),
    };
    session.messages.push(errorMessage);
    this.onMessageUpdate?.(itemId, session.messages);
    await this.storageService.saveSession(session);
  }

  /**
   * 发送消息（统一方法，支持全局聊天和绑定 Item 的聊天）
   * @param content 消息内容
   * @param options 选项，包含可选的 item（为 null 或 item.id === 0 时为全局聊天）
   */
  async sendMessage(
    content: string,
    options: SendMessageOptions & { item?: Zotero.Item | null } = {},
  ): Promise<void> {
    const item = options.item;
    const itemId = item?.id ?? 0;
    const isGlobalChat = !item || item.id === 0;

    ztoolkit.log(
      "[ChatManager] sendMessage called, itemId:",
      itemId,
      "isGlobal:",
      isGlobalChat,
    );

    // 获取或创建会话
    const session = await this.getOrCreateSession(itemId);

    // 获取活动的 AI 提供商
    const provider = this.getActiveProvider();
    ztoolkit.log(
      "[ChatManager] provider:",
      provider?.getName(),
      "isReady:",
      provider?.isReady(),
    );

    if (!provider || !provider.isReady()) {
      ztoolkit.log("[ChatManager] Provider not ready, showing error in chat");
      const errorMessage: ChatMessage = {
        id: this.generateId(),
        role: "assistant",
        content: getString(
          "chat-error-no-provider" as Parameters<typeof getString>[0],
        ),
        timestamp: Date.now(),
      };
      session.messages.push(errorMessage);
      this.onMessageUpdate?.(itemId, session.messages);
      await this.storageService.saveSession(session);
      return;
    }

    // Debug: log options
    ztoolkit.log("[ChatManager] sendMessage options:", {
      attachPdf: options.attachPdf,
      hasSelectedText: !!options.selectedText,
    });

    // 构建最终消息内容的各个部分
    const messageParts: string[] = [];
    let pdfWasAttached = false;

    // 1. 处理 PDF 内容（仅在勾选附加 PDF 且会话中尚未附加时）
    if (!isGlobalChat && options.attachPdf && item) {
      // 检查当前会话是否已经附加了 PDF 内容
      const isPdfAlreadyInContext = session.pdfAttached && session.pdfContent;

      if (!isPdfAlreadyInContext) {
        const pdfInfo = await this.pdfExtractor.getPdfInfo(item);
        ztoolkit.log("[PDF Attach] Checkbox checked, attempting to attach PDF");
        ztoolkit.log(
          "[PDF Attach] PDF info:",
          pdfInfo
            ? `name=${pdfInfo.name}, size=${pdfInfo.size} bytes`
            : "No PDF found",
        );

        // 优先尝试文本提取
        const pdfText = await this.pdfExtractor.extractPdfText(item);
        if (pdfText) {
          session.pdfContent = pdfText;
          session.pdfAttached = true;
          pdfWasAttached = true;
          ztoolkit.log(
            "[PDF Attach] PDF text extracted successfully, text length:",
            pdfText.length,
          );

          // 获取 PDF 最大字符数配置（默认 50000，-1 表示无限制）
          const providerManager = getProviderManager();
          const activeProviderId = providerManager.getActiveProviderId();
          const providerConfig = providerManager.getProviderConfig(
            activeProviderId,
          ) as ApiKeyProviderConfig | null;
          const pdfMaxChars = providerConfig?.pdfMaxChars ?? 50000;

          // 根据配置截断或完整上传
          const truncatedText =
            pdfMaxChars > 0 ? pdfText.substring(0, pdfMaxChars) : pdfText;

          ztoolkit.log(
            "[PDF Attach] pdfMaxChars config:",
            pdfMaxChars,
            "using text length:",
            truncatedText.length,
          );

          messageParts.push(`[PDF Content]:\n${truncatedText}`);
        } else {
          ztoolkit.log("[PDF Attach] Text extraction failed");
        }
      } else {
        ztoolkit.log(
          "[PDF Attach] PDF already in session context, skipping re-attachment",
        );
      }
    }

    // 2. 处理选中文本
    if (options.selectedText) {
      const prefix = isGlobalChat
        ? "[Selected text]"
        : "[Selected text from PDF]";
      messageParts.push(`${prefix}:\n"${options.selectedText}"`);
    }

    // 3. 添加用户问题
    if (content) {
      messageParts.push(`[Question]:\n${content}`);
    }

    // 组合最终消息内容
    const finalContent = messageParts.join("\n\n");

    // 创建用户消息
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: "user",
      content: finalContent,
      timestamp: Date.now(),
      pdfContext: options.attachPdf,
      selectedText: options.selectedText,
      images: options.images,
    };

    session.messages.push(userMessage);
    session.updatedAt = Date.now();

    // 保存会话以确保用户消息被持久化
    await this.storageService.saveSession(session);
    this.onMessageUpdate?.(itemId, session.messages);

    // 创建 AI 消息占位
    const assistantMessage: ChatMessage = {
      id: this.generateId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    session.messages.push(assistantMessage);
    this.onMessageUpdate?.(itemId, session.messages);

    // Log API request info
    ztoolkit.log("[API Request] Sending to provider:", provider.getName());
    ztoolkit.log("[API Request] Message count:", session.messages.length - 1);
    ztoolkit.log(
      "[API Request] Has images:",
      options.images ? options.images.length : 0,
    );

    // 调用 API
    const attemptRequest = async (): Promise<void> => {
      return new Promise((resolve) => {
        const callbacks: StreamCallbacks = {
          onChunk: (chunk: string) => {
            assistantMessage.content += chunk;
            this.onStreamingUpdate?.(itemId, assistantMessage.content);
          },
          onComplete: async (fullContent: string) => {
            assistantMessage.content = fullContent;
            assistantMessage.timestamp = Date.now();
            session.updatedAt = Date.now();

            // 如果是第一轮对话且没有标题，生成AI标题
            const validMessages = session.messages.filter(
              (msg) => msg.content && msg.content.trim() !== "",
            );
            if (!session.title && validMessages.length <= 2) {
              await this.generateSessionTitle(session, itemId);
            }

            await this.storageService.saveSession(session);
            this.onMessageUpdate?.(itemId, session.messages);

            if (pdfWasAttached) {
              this.onPdfAttached?.();
            }
            this.onMessageComplete?.();
            resolve();
          },
          onError: async (error: Error) => {
            ztoolkit.log("[API Error]", error.message);

            // 显示错误消息
            session.messages.pop();

            const errorMessage: ChatMessage = {
              id: this.generateId(),
              role: "error",
              content: error.message,
              timestamp: Date.now(),
            };
            session.messages.push(errorMessage);

            this.onError?.(error);
            this.onMessageUpdate?.(itemId, session.messages);
            await this.storageService.saveSession(session);
            resolve();
          },
        };

        provider.streamChatCompletion(session.messages.slice(0, -1), callbacks);
      });
    };

    await attemptRequest();
  }

  /**
   * 获取或创建会话（支持全局聊天 itemId=0）
   * 如果存在活动会话则返回，否则创建新会话
   */
  async getOrCreateSession(itemId: number): Promise<ChatSession> {
    // 先检查内存缓存
    if (this.activeSessions.has(itemId)) {
      return this.activeSessions.get(itemId)!;
    }

    // 尝试从存储加载活动会话
    const activeSession = await this.storageService.getActiveSession(itemId);
    if (activeSession) {
      this.activeSessions.set(itemId, activeSession);
      return activeSession;
    }

    // 创建新会话
    const newSession = await this.storageService.createNewSession(itemId);
    this.activeSessions.set(itemId, newSession);
    return newSession;
  }

  /**
   * 创建新会话（用于新建聊天按钮）
   */
  async createNewSession(itemId: number): Promise<ChatSession> {
    const newSession = await this.storageService.createNewSession(itemId);
    this.activeSessions.set(itemId, newSession);
    return newSession;
  }

  /**
   * 切换到指定会话
   */
  async switchSession(
    itemId: number,
    sessionId: string,
  ): Promise<ChatSession | null> {
    const session = await this.storageService.loadSession(itemId, sessionId);
    if (session) {
      this.activeSessions.set(itemId, session);
      this.activeItemId = itemId;
      await this.storageService.setActiveSession(itemId, sessionId);
      return session;
    }
    return null;
  }

  /**
   * 获取文档的所有会话
   */
  async getSessionsForItem(itemId: number): Promise<
    Array<{
      sessionId: string;
      itemId: number;
      itemName: string;
      messageCount: number;
      lastMessage: string;
      lastUpdated: number;
      isEmpty: boolean;
    }>
  > {
    const sessions = await this.storageService.listSessions(itemId, true);
    return sessions.map((meta) => ({
      sessionId: meta.sessionId,
      itemId: meta.itemId,
      itemName: meta.itemName,
      messageCount: meta.messageCount,
      lastMessage: meta.lastMessagePreview,
      lastUpdated: meta.lastUpdated,
      isEmpty: meta.isEmpty,
    }));
  }

  /**
   * 清空当前活动会话（创建新会话，保留历史）
   */
  async clearCurrentSession(itemId: number): Promise<ChatSession> {
    // 创建新会话作为当前活动会话
    const newSession = await this.createNewSession(itemId);
    this.onMessageUpdate?.(itemId, newSession.messages);
    return newSession;
  }

  /**
   * 删除特定会话
   */
  async deleteSession(itemId: number, sessionId: string): Promise<void> {
    await this.storageService.deleteSession(itemId, sessionId);

    // 如果删除的是当前活动会话，切换到其他会话或创建新会话
    const currentSession = this.activeSessions.get(itemId);
    if (currentSession && currentSession.id === sessionId) {
      // 尝试获取该文档的其他会话
      const remainingSessions = await this.getSessionsForItem(itemId);
      const nonEmptySessions = remainingSessions.filter((s) => !s.isEmpty);

      if (nonEmptySessions.length > 0) {
        // 切换到最新的非空会话
        await this.switchSession(itemId, nonEmptySessions[0].sessionId);
      } else {
        // 创建新会话
        await this.createNewSession(itemId);
      }
    }
  }

  /**
   * 清空文档的所有会话（完全删除）
   */
  async clearAllSessionsForItem(itemId: number): Promise<void> {
    await this.storageService.deleteAllSessionsForItem(itemId);
    this.activeSessions.delete(itemId);
  }

  /**
   * 检查是否有PDF附件
   */
  async hasPdfAttachment(item: Zotero.Item): Promise<boolean> {
    return this.pdfExtractor.hasPdfAttachment(item);
  }

  /**
   * 获取选中的PDF文本
   */
  getSelectedText(): string | null {
    return this.pdfExtractor.getSelectedTextFromReader();
  }

  /**
   * 获取PDF提取器
   */
  getPdfExtractor(): PdfExtractor {
    return this.pdfExtractor;
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * System prompt for generating chat titles
   * Instructs the AI to create concise, descriptive titles in the same language as the user's message
   */
  private readonly TITLE_GENERATION_SYSTEM_PROMPT =
    "You are a chat naming assistant. Given a user's message, generate a short, descriptive title for the conversation.\n\n" +
    "Rules:\n" +
    "- Keep it under 50 characters\n" +
    "- Be concise and descriptive\n" +
    "- Don't use quotes or special formatting\n" +
    "- Focus on the main topic or intent\n" +
    "- Use title case\n" +
    "- IMPORTANT: The title MUST be in the SAME LANGUAGE as the user's message\n\n" +
    "Respond with ONLY the title, nothing else.";

  /**
   * 生成会话标题
   * 基于第一轮对话内容使用AI生成简短标题
   */
  private async generateSessionTitle(
    session: ChatSession,
    itemId: number,
  ): Promise<void> {
    try {
      const provider = this.getActiveProvider();
      if (!provider || !provider.isReady()) return;

      // 获取第一轮对话内容
      const validMessages = session.messages.filter(
        (msg) => msg.content && msg.content.trim() !== "",
      );
      if (validMessages.length < 2) return;

      const firstUserMessage = validMessages.find((msg) => msg.role === "user");
      const firstAssistantMessage = validMessages.find(
        (msg) => msg.role === "assistant",
      );

      if (!firstUserMessage || !firstAssistantMessage) return;

      // 提取用户的纯问题内容（去掉PDF内容等前缀）
      const userContent = firstUserMessage.content;
      const questionMatch = userContent.match(/\[Question\]:\s*(.+)/s);
      let userQuestion = questionMatch
        ? questionMatch[1].trim()
        : userContent
            .replace(/\[PDF Content\]:[\s\S]*?(?=\[Question\]:|$)/, "")
            .replace(/\[Selected[^\]]*\]:\s*/g, "")
            .trim();

      // 去掉开头的 "[Selected]:" 等标记
      userQuestion = userQuestion.replace(/^\[[^\]]*\]:\s*/, "").trim();

      if (!userQuestion) return;

      // Use AI to generate a descriptive title
      const titleMessages: ChatMessage[] = [
        {
          id: this.generateId(),
          role: "system",
          content: this.TITLE_GENERATION_SYSTEM_PROMPT,
          timestamp: Date.now(),
        },
        {
          id: this.generateId(),
          role: "user",
          content: userQuestion,
          timestamp: Date.now(),
        },
      ];

      const generatedTitle = await provider.chatCompletion(titleMessages);
      const title = generatedTitle.trim().slice(0, 100);

      if (title) {
        session.title = title;
        ztoolkit.log("Generated session title:", title);
      }
    } catch (error) {
      ztoolkit.log("Error generating session title:", error);
      // Fallback: use first 30 characters of user question as title
      try {
        const userContent = session.messages.find(
          (m) => m.role === "user",
        )?.content;
        if (userContent) {
          const questionMatch = userContent.match(/\[Question\]:\s*(.+)/s);
          const userQuestion = questionMatch
            ? questionMatch[1].trim()
            : userContent
                .replace(/\[PDF Content\]:[\s\S]*?(?=\[Question\]:|$)/, "")
                .replace(/\[Selected[^\]]*\]:\s*/g, "")
                .trim();
          const fallbackTitle =
            userQuestion.substring(0, 30) +
            (userQuestion.length > 30 ? "..." : "");
          if (fallbackTitle) {
            session.title = fallbackTitle;
            ztoolkit.log("Using fallback session title:", fallbackTitle);
          }
        }
      } catch {
        // Ignore fallback errors
      }
    }
  }

  /**
   * 获取所有会话列表（带item信息）
   * 用于历史记录下拉框，默认过滤空会话
   */
  async getAllSessions(): Promise<
    Array<{
      sessionId: string;
      itemId: number;
      itemName: string;
      messageCount: number;
      lastMessage: string;
      lastUpdated: number;
      isEmpty: boolean;
      sessionTitle?: string;
    }>
  > {
    const storedSessions = await this.storageService.listSessions(
      undefined,
      false,
    );

    // 索引已经包含所有需要的信息，直接映射返回
    return storedSessions.map((meta) => ({
      sessionId: meta.sessionId,
      itemId: meta.itemId,
      itemName: meta.itemName,
      messageCount: meta.messageCount,
      lastMessage: meta.lastMessagePreview,
      lastUpdated: meta.lastUpdated,
      isEmpty: meta.isEmpty,
      sessionTitle: meta.sessionTitle,
    }));
  }

  /**
   * 获取会话及其标题
   */
  async getSessionWithTitle(
    itemId: number,
    sessionId: string,
  ): Promise<ChatSession | null> {
    return this.storageService.loadSession(itemId, sessionId);
  }

  /**
   * 加载指定item的会话到当前（用于会话切换）
   * @deprecated 使用 switchSession 替代
   */
  async loadSessionForItem(itemId: number): Promise<ChatSession | null> {
    return this.getOrCreateSession(itemId);
  }

  /**
   * 销毁
   */
  async destroy(): Promise<void> {
    // 保存所有活动会话
    for (const session of this.activeSessions.values()) {
      await this.storageService.saveSession(session);
    }
    this.activeSessions.clear();
  }
}
