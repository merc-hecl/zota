/**
 * ChatManager - Core chat session management class
 * Supports multiple sessions per document
 */

import type {
  ChatMessage,
  ChatSession,
  SendMessageOptions,
  StreamCallbacks,
  ChatManagerCallbacks,
} from "../../types/chat";
import type { ApiKeyProviderConfig } from "../../types/provider";
import { StorageService } from "./StorageService";
import { PdfExtractor } from "./PdfExtractor";
import {
  getProviderManager,
  SiliconFlowProvider,
  DeepSeekProvider,
  KimiProvider,
  GLMProvider,
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
} from "../providers";
import { getString } from "../../utils/locale";
import {
  getPref,
  getClaudeThinkingEffort,
  getGeminiThinkingEffort,
} from "../../utils/prefs";

/**
 * Get AbortController constructor safely for Zotero sandbox environment
 */
function getAbortController(): (new () => AbortController) | null {
  try {
    const globalAny = _globalThis as unknown as {
      AbortController?: new () => AbortController;
      ztoolkit?: { getGlobal: (name: string) => unknown };
    };
    const AbortControllerFromGlobal = globalAny.AbortController;
    if (AbortControllerFromGlobal) {
      return AbortControllerFromGlobal;
    }
    const ztoolkitGlobal = globalAny.ztoolkit;
    if (ztoolkitGlobal?.getGlobal) {
      const AbortControllerFromZtoolkit = ztoolkitGlobal.getGlobal(
        "AbortController",
      ) as (new () => AbortController) | null;
      if (AbortControllerFromZtoolkit) {
        return AbortControllerFromZtoolkit;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export class ChatManager {
  // In-memory cache: itemId -> current active session
  private activeSessions: Map<number, ChatSession> = new Map();
  private activeItemId: number | null = null;
  private storageService: StorageService;
  private pdfExtractor: PdfExtractor;

  // AbortController for cancelling streaming requests
  private currentAbortController: AbortController | null = null;

  // UI callbacks
  private onMessageUpdate?: (
    itemId: number,
    messages: ChatMessage[],
    sessionId?: string,
  ) => void;
  private onStreamingUpdate?: (
    itemId: number,
    content: string,
    sessionId?: string,
  ) => void;
  private onError?: (error: Error, itemId?: number, sessionId?: string) => void;
  private onPdfAttached?: () => void;
  private onMessageComplete?: (itemId?: number, sessionId?: string) => void;

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
   * Check if streaming is enabled
   */
  private isStreamingEnabled(): boolean {
    const provider = this.getActiveProvider();
    if (!provider) return true;
    return provider.config.streamingOutput ?? true;
  }

  /**
   * Set UI callbacks
   */
  setCallbacks(callbacks: ChatManagerCallbacks): void {
    this.onMessageUpdate = callbacks.onMessageUpdate;
    this.onStreamingUpdate = callbacks.onStreamingUpdate;
    this.onError = callbacks.onError;
    this.onPdfAttached = callbacks.onPdfAttached;
    this.onMessageComplete = callbacks.onMessageComplete;
  }

  /**
   * Abort the current streaming request
   * Preserves partial content and marks message as incomplete
   */
  abort(itemId?: number): void {
    if (this.currentAbortController) {
      ztoolkit.log("[ChatManager] Aborting current request");
      this.currentAbortController.abort();
      // Don't null immediately - let the callback handle it after abort completes
    }
  }

  /**
   * Check if there's an active streaming request
   */
  isStreaming(): boolean {
    return this.currentAbortController !== null;
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
   * Show error message in chat interface
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
    this.onMessageUpdate?.(itemId, session.messages, session.id);
    await this.storageService.saveSession(session);
  }

  /**
   * Send message (unified method, supports both global chat and item-bound chat)
   * @param content Message content
   * @param options Options, including optional item (global chat when null or item.id === 0)
   */
  async sendMessage(
    content: string,
    options: SendMessageOptions & { item?: Zotero.Item | null } = {},
  ): Promise<void> {
    const item = options.item;
    let itemId = item?.id ?? 0;
    const isGlobalChat = !item || item.id === 0;

    // Clear abort state from previous requests
    if (this.currentAbortController) {
      this.currentAbortController = null;
    }

    // If this is a new message (not continuing), clear isComplete from any previous aborted messages
    if (!options.continueFromMessageId) {
      const session = await this.getActiveSession(itemId);
      if (session) {
        let hasChanges = false;
        for (const msg of session.messages) {
          if (msg.role === "assistant" && msg.isComplete === false) {
            delete msg.isComplete;
            hasChanges = true;
          }
        }
        if (hasChanges) {
          await this.storageService.saveSession(session);
        }
      }
    }

    ztoolkit.log(
      "[ChatManager] sendMessage called, itemId:",
      itemId,
      "isGlobal:",
      isGlobalChat,
    );

    // Handle documents - determine session itemId based on single/multi-document
    let documentIds: number[] | undefined;
    let documentNames: string[] | undefined;
    const documentContents: string[] = [];

    if (options.documents && options.documents.length > 0) {
      documentIds = options.documents.map((d) => d.id);
      documentNames = options.documents.map((d) => d.title);

      ztoolkit.log(
        "[ChatManager] Processing documents:",
        documentIds.length,
        "ids:",
        documentIds,
      );

      // Determine itemId based on document count
      if (documentIds.length === 1) {
        // Single document: use that document's itemId
        itemId = documentIds[0];
        ztoolkit.log(
          "[ChatManager] Single document session, using itemId:",
          itemId,
        );
      } else {
        // Multi-document: use itemId = 0 (global)
        itemId = 0;
        ztoolkit.log(
          "[ChatManager] Multi-document session, using global itemId: 0",
        );
      }

      // Extract PDF content for each document
      for (const doc of options.documents) {
        try {
          const zoteroItem = await Zotero.Items.getAsync(doc.id);
          if (zoteroItem) {
            const pdfText = await this.pdfExtractor.extractPdfText(
              zoteroItem as Zotero.Item,
            );
            if (pdfText) {
              // Get PDF max chars config (default 50000, -1 means unlimited)
              const providerManager = getProviderManager();
              const activeProviderId = providerManager.getActiveProviderId();
              const providerConfig = providerManager.getProviderConfig(
                activeProviderId,
              ) as ApiKeyProviderConfig | null;
              const pdfMaxChars = providerConfig?.pdfMaxChars ?? 50000;

              const truncatedText =
                pdfMaxChars > 0 ? pdfText.substring(0, pdfMaxChars) : pdfText;

              documentContents.push(
                `[Document: ${doc.title}]:\n${truncatedText}`,
              );
              ztoolkit.log(
                "[ChatManager] Extracted PDF content for document:",
                doc.title,
                "length:",
                truncatedText.length,
              );
            } else {
              ztoolkit.log(
                "[ChatManager] No PDF content found for document:",
                doc.title,
              );
            }
          }
        } catch (error) {
          ztoolkit.log(
            "[ChatManager] Error extracting PDF for document:",
            doc.id,
            error,
          );
        }
      }
    }

    // Get or create session
    const session = await this.getOrCreateSession(itemId);

    // Store document info in session for multi-document sessions
    if (documentIds && documentIds.length > 1) {
      session.documentIds = documentIds;
      session.documentNames = documentNames;
    }

    // Get active AI provider
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
      this.onMessageUpdate?.(itemId, session.messages, session.id);
      await this.storageService.saveSession(session);
      return;
    }

    // Debug: log options
    ztoolkit.log("[ChatManager] sendMessage options:", {
      attachPdf: options.attachPdf,
      hasSelectedText: !!options.selectedText,
      hasDocuments: !!(options.documents && options.documents.length > 0),
      documentCount: options.documents?.length || 0,
    });

    // Build final message content parts
    const messageParts: string[] = [];
    let pdfWasAttached = false;

    // 1. Process document contents (for dropped documents)
    if (documentContents.length > 0) {
      messageParts.push(documentContents.join("\n\n"));
      pdfWasAttached = true;
    }

    // 2. Process PDF content (only when attach PDF is checked and not already in session)
    if (!isGlobalChat && options.attachPdf && item) {
      // Check if PDF content is already attached to current session
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

        // Prioritize text extraction
        const pdfText = await this.pdfExtractor.extractPdfText(item);
        if (pdfText) {
          session.pdfContent = pdfText;
          session.pdfAttached = true;
          pdfWasAttached = true;
          ztoolkit.log(
            "[PDF Attach] PDF text extracted successfully, text length:",
            pdfText.length,
          );

          // Get PDF max chars config (default 50000, -1 means unlimited)
          const providerManager = getProviderManager();
          const activeProviderId = providerManager.getActiveProviderId();
          const providerConfig = providerManager.getProviderConfig(
            activeProviderId,
          ) as ApiKeyProviderConfig | null;
          const pdfMaxChars = providerConfig?.pdfMaxChars ?? 50000;

          // Truncate or upload full content based on config
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

    // 3. Process selected text
    if (options.selectedText) {
      const prefix = isGlobalChat
        ? "[Selected text]"
        : "[Selected text from PDF]";
      messageParts.push(`${prefix}:\n"${options.selectedText}"`);
    }

    // 4. Add user question
    if (content) {
      messageParts.push(`[Question]:\n${content}`);
    }

    // Combine final message content
    const finalContent = messageParts.join("\n\n");

    // Create user message
    const userMessage: ChatMessage = {
      id: this.generateId(),
      role: "user",
      content: finalContent,
      timestamp: Date.now(),
      pdfContext: options.attachPdf,
      selectedText: options.selectedText,
      images: options.images,
      documents: options.documents,
      // Hide the continue prompt message from UI
      isHidden: !!options.continueFromMessageId,
    };

    session.messages.push(userMessage);
    session.updatedAt = Date.now();

    // Save session to persist user message
    await this.storageService.saveSession(session);
    this.onMessageUpdate?.(itemId, session.messages, session.id);

    // Create AI message placeholder
    let assistantMessage: ChatMessage;
    const continueFromMessageId = options.continueFromMessageId;

    if (continueFromMessageId) {
      const existingMessage = session.messages.find(
        (m) => m.id === continueFromMessageId,
      );
      if (existingMessage) {
        ztoolkit.log(
          "[ChatManager] Continuing from message:",
          continueFromMessageId,
          "content length:",
          existingMessage.content.length,
        );
        // Use the existing message directly instead of creating a new one
        // This way the content will be appended to the same message bubble
        existingMessage.isComplete = undefined; // Reset isComplete since it's now being continued
        assistantMessage = existingMessage;
      } else {
        assistantMessage = {
          id: this.generateId(),
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        };
      }
    } else {
      assistantMessage = {
        id: this.generateId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };
    }

    // Only push if not continuing from existing message (message already exists)
    if (
      !continueFromMessageId ||
      !session.messages.includes(assistantMessage)
    ) {
      session.messages.push(assistantMessage);
    }
    this.onMessageUpdate?.(itemId, session.messages, session.id);

    // Log API request info
    ztoolkit.log("[API Request] Sending to provider:", provider.getName());
    ztoolkit.log("[API Request] Message count:", session.messages.length - 1);
    ztoolkit.log(
      "[API Request] Has images:",
      options.images ? options.images.length : 0,
    );

    // Store session ID for callbacks
    const currentSessionId = session.id;

    // Create AbortController for this request (use safe getter for Zotero sandbox)
    const AbortControllerCtor = getAbortController();
    this.currentAbortController = AbortControllerCtor
      ? new AbortControllerCtor()
      : null;
    const signal = this.currentAbortController?.signal;

    ztoolkit.log(
      "[API Request] AbortController created:",
      !!this.currentAbortController,
      "signal:",
      !!signal,
    );

    // Check if streaming is enabled
    const isStreaming = this.isStreamingEnabled();

    // Throttle save during streaming to reduce IO overhead
    let lastSaveTime = 0;
    let chunkCount = 0;
    const SAVE_INTERVAL_MS = 500; // Save at most every 500ms
    const SAVE_EVERY_N_CHUNKS = 10; // Or every 10 chunks

    // Check thinking mode preference
    const thinkingModeEnabled = getPref("thinkingModeEnabled") as boolean;

    // Set thinking mode for SiliconFlow provider
    if (provider instanceof SiliconFlowProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
    }

    // Set thinking mode and current model for DeepSeek provider
    if (provider instanceof DeepSeekProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
      const currentModel = (getPref("model") as string) || "";
      provider.setCurrentModel(currentModel);
    }

    // Set thinking mode and current model for Kimi provider
    if (provider instanceof KimiProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
      const currentModel = (getPref("model") as string) || "";
      provider.setCurrentModel(currentModel);
    }

    // Set thinking mode and current model for GLM provider
    if (provider instanceof GLMProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
      const currentModel = (getPref("model") as string) || "";
      provider.setCurrentModel(currentModel);
    }

    // Set reasoning effort for OpenAI provider
    if (provider instanceof OpenAIProvider) {
      const reasoningEffort =
        (getPref("openaiReasoningEffort") as string) || "medium";
      provider.setReasoningEffort(
        reasoningEffort as "none" | "low" | "medium" | "high" | "xhigh",
      );
    }

    // Set thinking effort for Anthropic/Claude provider
    if (provider instanceof AnthropicProvider) {
      const thinkingEffort = (getClaudeThinkingEffort() as string) || "none";
      provider.setThinkingEffort(
        thinkingEffort as "none" | "low" | "medium" | "high",
      );
    }

    // Set thinking effort for Gemini provider
    if (provider instanceof GeminiProvider) {
      const thinkingEffort = (getGeminiThinkingEffort() as string) || "none";
      provider.setThinkingEffort(
        thinkingEffort as "none" | "low" | "medium" | "high",
      );
    }

    // Call API
    const attemptRequest = async (): Promise<void> => {
      return new Promise((resolve) => {
        if (isStreaming) {
          // Streaming mode
          const callbacks: StreamCallbacks = {
            onChunk: async (chunk: string) => {
              assistantMessage.content += chunk;
              chunkCount++;

              // Throttle save during streaming to reduce IO overhead
              const now = Date.now();
              const shouldSave =
                now - lastSaveTime > SAVE_INTERVAL_MS ||
                chunkCount % SAVE_EVERY_N_CHUNKS === 0;

              if (shouldSave) {
                lastSaveTime = now;
                await this.storageService.saveSession(session);
              }

              this.onStreamingUpdate?.(
                itemId,
                assistantMessage.content,
                currentSessionId,
              );
            },
            onReasoningChunk: (chunk: string) => {
              // Accumulate reasoning content
              if (!assistantMessage.reasoningContent) {
                assistantMessage.reasoningContent = "";
              }
              assistantMessage.reasoningContent += chunk;

              // Throttle UI updates for reasoning content (every 500ms or every 5 chunks)
              const now = Date.now();
              const shouldUpdateUI =
                now - lastSaveTime > SAVE_INTERVAL_MS ||
                (assistantMessage.reasoningContent?.length || 0) % 50 === 0;

              if (shouldUpdateUI) {
                this.onMessageUpdate?.(
                  itemId,
                  session.messages,
                  currentSessionId,
                );
              }
            },
            onComplete: async (fullContent: string) => {
              assistantMessage.content = fullContent;
              assistantMessage.timestamp = Date.now();
              assistantMessage.isComplete = true;
              session.updatedAt = Date.now();

              // Generate AI title for first round of conversation if no title exists
              // Use try-catch to ensure title generation failure doesn't affect message display
              const validMessages = session.messages.filter(
                (msg) => msg.content && msg.content.trim() !== "",
              );
              if (!session.title && validMessages.length <= 2) {
                try {
                  await this.generateSessionTitle(session, itemId);
                } catch (titleError) {
                  ztoolkit.log(
                    "Error generating title (ignored, continuing):",
                    titleError,
                  );
                }
              }

              await this.storageService.saveSession(session);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );

              if (pdfWasAttached) {
                this.onPdfAttached?.();
              }
              this.onMessageComplete?.(itemId, currentSessionId);
              resolve();
            },
            onError: async (error: Error) => {
              ztoolkit.log("[API Error]", error.message, "name:", error.name);

              if (error.name === "AbortError") {
                ztoolkit.log(
                  "[API] Request aborted, preserving partial content",
                );
                assistantMessage.isComplete = false;
                ztoolkit.log(
                  "[API] assistantMessage.isComplete set to:",
                  assistantMessage.isComplete,
                );
                this.onMessageUpdate?.(
                  itemId,
                  session.messages,
                  currentSessionId,
                );
                await this.storageService.saveSession(session);
                resolve();
                return;
              }

              // Show error message
              session.messages.pop();

              const errorMessage: ChatMessage = {
                id: this.generateId(),
                role: "error",
                content: error.message,
                timestamp: Date.now(),
              };
              session.messages.push(errorMessage);

              this.onError?.(error, itemId, currentSessionId);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );
              await this.storageService.saveSession(session);
              resolve();
            },
          };

          provider.streamChatCompletion(
            session.messages.slice(0, -1),
            callbacks,
            signal,
          );
        } else {
          // Non-streaming mode
          this.setSessionSendingState(itemId, currentSessionId, true);

          provider
            .chatCompletion(session.messages.slice(0, -1))
            .then(async (fullContent: string) => {
              assistantMessage.content = fullContent;
              assistantMessage.timestamp = Date.now();
              session.updatedAt = Date.now();

              // Generate AI title for first round of conversation if no title exists
              // Use try-catch to ensure title generation failure doesn't affect message display
              const validMessages = session.messages.filter(
                (msg) => msg.content && msg.content.trim() !== "",
              );
              if (!session.title && validMessages.length <= 2) {
                try {
                  await this.generateSessionTitle(session, itemId);
                } catch (titleError) {
                  ztoolkit.log(
                    "Error generating title (ignored, continuing):",
                    titleError,
                  );
                }
              }

              await this.storageService.saveSession(session);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );

              if (pdfWasAttached) {
                this.onPdfAttached?.();
              }
              this.onMessageComplete?.(itemId, currentSessionId);
              resolve();
            })
            .catch(async (error: Error) => {
              ztoolkit.log("[API Error]", error.message);

              // Show error message
              session.messages.pop();

              const errorMessage: ChatMessage = {
                id: this.generateId(),
                role: "error",
                content: error.message,
                timestamp: Date.now(),
              };
              session.messages.push(errorMessage);

              this.onError?.(error, itemId, currentSessionId);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );
              await this.storageService.saveSession(session);
              resolve();
            })
            .finally(() => {
              this.setSessionSendingState(itemId, currentSessionId, false);
            });
        }
      });
    };

    await attemptRequest();
    this.currentAbortController = null;
  }

  /**
   * Regenerate an AI response message
   * For error messages: replaces the error with a new AI response
   * For normal messages: saves current content as a version and generates new content
   */
  async regenerateMessage(itemId: number, messageId: string): Promise<void> {
    const session = await this.getActiveSession(itemId);
    if (!session) {
      ztoolkit.log("[Regenerate] No active session found for item:", itemId);
      return;
    }

    // Find the message to regenerate
    const messageIndex = session.messages.findIndex(
      (msg) => msg.id === messageId,
    );
    if (messageIndex === -1) {
      ztoolkit.log("[Regenerate] Message not found:", messageId);
      return;
    }

    const message = session.messages[messageIndex];

    // Only allow regenerating assistant or error messages
    if (message.role !== "assistant" && message.role !== "error") {
      ztoolkit.log("[Regenerate] Cannot regenerate non-AI message");
      return;
    }

    // Get active AI provider
    const provider = this.getActiveProvider();
    if (!provider || !provider.isReady()) {
      ztoolkit.log("[Regenerate] Provider not ready");
      return;
    }

    const isStreaming = this.isStreamingEnabled();
    const currentSessionId = session.id;

    // Create AbortController for this request (use safe getter for Zotero sandbox)
    const AbortControllerCtor = getAbortController();
    this.currentAbortController = AbortControllerCtor
      ? new AbortControllerCtor()
      : null;
    const signal = this.currentAbortController?.signal;

    ztoolkit.log(
      "[Regenerate] AbortController created:",
      !!this.currentAbortController,
    );

    // Handle error message - convert to assistant message
    if (message.role === "error") {
      // Convert error message to assistant message
      message.role = "assistant";
      message.content = "";
      message.contentVersions = [];
      message.currentVersionIndex = 0;
    } else {
      // For normal assistant messages, save current content as a version
      if (!message.contentVersions) {
        message.contentVersions = [];
      }

      // Add current content to versions if not already there
      if (message.content && message.content.trim()) {
        message.contentVersions.push({
          content: message.content,
          timestamp: message.timestamp,
        });
      }

      // Clear content for new generation
      message.content = "";
    }

    // Update timestamp
    message.timestamp = Date.now();

    // Save and update UI
    await this.storageService.saveSession(session);
    this.onMessageUpdate?.(itemId, session.messages, currentSessionId);

    // Throttle save during streaming
    let lastSaveTime = 0;
    let chunkCount = 0;
    const SAVE_INTERVAL_MS = 500;
    const SAVE_EVERY_N_CHUNKS = 10;

    // Check thinking mode preference
    const thinkingModeEnabled = getPref("thinkingModeEnabled") as boolean;

    // Set thinking mode for SiliconFlow provider
    if (provider instanceof SiliconFlowProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
    }

    // Set thinking mode and current model for DeepSeek provider
    if (provider instanceof DeepSeekProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
      const currentModel = (getPref("model") as string) || "";
      provider.setCurrentModel(currentModel);
    }

    // Set thinking mode and current model for Kimi provider
    if (provider instanceof KimiProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
      const currentModel = (getPref("model") as string) || "";
      provider.setCurrentModel(currentModel);
    }

    // Set thinking mode and current model for GLM provider
    if (provider instanceof GLMProvider) {
      provider.setThinkingMode(thinkingModeEnabled);
      const currentModel = (getPref("model") as string) || "";
      provider.setCurrentModel(currentModel);
    }

    // Set thinking effort for Anthropic/Claude provider
    if (provider instanceof AnthropicProvider) {
      const thinkingEffort = (getClaudeThinkingEffort() as string) || "none";
      provider.setThinkingEffort(
        thinkingEffort as "none" | "low" | "medium" | "high",
      );
    }

    // Set thinking effort for Gemini provider
    if (provider instanceof GeminiProvider) {
      const thinkingEffort = (getGeminiThinkingEffort() as string) || "none";
      provider.setThinkingEffort(
        thinkingEffort as "none" | "low" | "medium" | "high",
      );
    }

    // Get messages up to this point for context (excluding the message being regenerated)
    const contextMessages = session.messages.slice(0, messageIndex);

    // Call API
    const attemptRequest = async (): Promise<void> => {
      return new Promise((resolve) => {
        if (isStreaming) {
          const callbacks: StreamCallbacks = {
            onChunk: async (chunk: string) => {
              message.content += chunk;
              chunkCount++;

              const now = Date.now();
              const shouldSave =
                now - lastSaveTime > SAVE_INTERVAL_MS ||
                chunkCount % SAVE_EVERY_N_CHUNKS === 0;

              if (shouldSave) {
                lastSaveTime = now;
                await this.storageService.saveSession(session);
              }

              this.onStreamingUpdate?.(
                itemId,
                message.content,
                currentSessionId,
              );
            },
            onReasoningChunk: (chunk: string) => {
              // Accumulate reasoning content
              if (!message.reasoningContent) {
                message.reasoningContent = "";
              }
              message.reasoningContent += chunk;

              // Throttle UI updates for reasoning content
              const now = Date.now();
              const shouldUpdateUI =
                now - lastSaveTime > SAVE_INTERVAL_MS ||
                (message.reasoningContent?.length || 0) % 50 === 0;

              if (shouldUpdateUI) {
                this.onMessageUpdate?.(
                  itemId,
                  session.messages,
                  currentSessionId,
                );
              }
            },
            onComplete: async (fullContent: string) => {
              message.content = fullContent;
              message.timestamp = Date.now();

              // Add new content to versions
              if (!message.contentVersions) {
                message.contentVersions = [];
              }
              message.contentVersions.push({
                content: fullContent,
                timestamp: Date.now(),
              });
              message.currentVersionIndex = message.contentVersions.length - 1;

              session.updatedAt = Date.now();
              await this.storageService.saveSession(session);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );
              this.onMessageComplete?.(itemId, currentSessionId);
              resolve();
            },
            onError: async (error: Error) => {
              ztoolkit.log(
                "[Regenerate Error]",
                error.message,
                "name:",
                error.name,
              );

              // Handle abort
              if (error.name === "AbortError") {
                ztoolkit.log(
                  "[Regenerate] Request aborted, preserving partial content",
                );
                message.isComplete = false;
                this.onMessageUpdate?.(
                  itemId,
                  session.messages,
                  currentSessionId,
                );
                await this.storageService.saveSession(session);
                resolve();
                return;
              }

              // Convert back to error message
              message.role = "error";
              message.content = error.message;
              message.timestamp = Date.now();

              this.onError?.(error, itemId, currentSessionId);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );
              await this.storageService.saveSession(session);
              resolve();
            },
          };

          provider.streamChatCompletion(
            contextMessages,
            callbacks,
            this.currentAbortController?.signal,
          );
        } else {
          this.setSessionSendingState(itemId, currentSessionId, true);

          provider
            .chatCompletion(contextMessages)
            .then(async (fullContent: string) => {
              message.content = fullContent;
              message.timestamp = Date.now();

              // Add new content to versions
              if (!message.contentVersions) {
                message.contentVersions = [];
              }
              message.contentVersions.push({
                content: fullContent,
                timestamp: Date.now(),
              });
              message.currentVersionIndex = message.contentVersions.length - 1;

              session.updatedAt = Date.now();
              await this.storageService.saveSession(session);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );
              this.onMessageComplete?.(itemId, currentSessionId);
              resolve();
            })
            .catch(async (error: Error) => {
              ztoolkit.log(
                "[Regenerate Error]",
                error.message,
                "name:",
                error.name,
              );

              // Handle abort
              if (error.name === "AbortError") {
                ztoolkit.log(
                  "[Regenerate] Request aborted, preserving partial content",
                );
                message.isComplete = false;
                this.onMessageUpdate?.(
                  itemId,
                  session.messages,
                  currentSessionId,
                );
                await this.storageService.saveSession(session);
                resolve();
                return;
              }

              // Convert back to error message
              message.role = "error";
              message.content = error.message;
              message.timestamp = Date.now();

              this.onError?.(error, itemId, currentSessionId);
              this.onMessageUpdate?.(
                itemId,
                session.messages,
                currentSessionId,
              );
              await this.storageService.saveSession(session);
              resolve();
            })
            .finally(() => {
              this.setSessionSendingState(itemId, currentSessionId, false);
            });
        }
      });
    };

    await attemptRequest();

    // Clear AbortController after request completes
    this.currentAbortController = null;
  }

  /**
   * Switch to a different version of a message
   */
  async switchMessageVersion(
    itemId: number,
    messageId: string,
    versionIndex: number,
  ): Promise<void> {
    const session = await this.getActiveSession(itemId);
    if (!session) {
      ztoolkit.log("[SwitchVersion] No active session found for item:", itemId);
      return;
    }

    // Find the message
    const message = session.messages.find((msg) => msg.id === messageId);
    if (
      !message ||
      !message.contentVersions ||
      !message.contentVersions[versionIndex]
    ) {
      ztoolkit.log("[SwitchVersion] Message or version not found");
      return;
    }

    // Update current version index and content
    message.currentVersionIndex = versionIndex;
    message.content = message.contentVersions[versionIndex].content;
    message.timestamp = message.contentVersions[versionIndex].timestamp;

    // Save and update UI
    await this.storageService.saveSession(session);
    this.onMessageUpdate?.(itemId, session.messages, session.id);
  }

  /**
   * Set sending state for a session
   */
  private setSessionSendingState(
    itemId: number,
    sessionId: string,
    isSending: boolean,
  ): void {
    // This is handled by the streaming state manager in the UI layer
    // We just need to trigger the state update
    if (isSending) {
      this.onStreamingUpdate?.(itemId, "", sessionId);
    }
  }

  /**
   * Get or create session (supports global chat with itemId=0)
   * Returns active session if exists, otherwise creates new session
   */
  async getOrCreateSession(itemId: number): Promise<ChatSession> {
    // Check memory cache first
    if (this.activeSessions.has(itemId)) {
      return this.activeSessions.get(itemId)!;
    }

    // Try to load active session from storage
    const activeSession = await this.storageService.getActiveSession(itemId);
    if (activeSession) {
      this.activeSessions.set(itemId, activeSession);
      return activeSession;
    }

    // Create new session
    const newSession = await this.storageService.createNewSession(itemId);
    this.activeSessions.set(itemId, newSession);
    return newSession;
  }

  /**
   * Create new session (for new chat button)
   */
  async createNewSession(itemId: number): Promise<ChatSession> {
    const newSession = await this.storageService.createNewSession(itemId);
    this.activeSessions.set(itemId, newSession);
    return newSession;
  }

  /**
   * Get specific session by itemId and sessionId (sync - from memory cache only)
   */
  getSession(itemId: number, sessionId: string): ChatSession | null {
    // Check memory cache first
    const activeSession = this.activeSessions.get(itemId);
    if (activeSession && activeSession.id === sessionId) {
      return activeSession;
    }
    // Return null if not in cache - caller should handle async loading if needed
    return null;
  }

  /**
   * Load specific session from storage (async)
   */
  async loadSession(
    itemId: number,
    sessionId: string,
  ): Promise<ChatSession | null> {
    return await this.storageService.loadSession(itemId, sessionId);
  }

  /**
   * Switch to specified session
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
   * Get all sessions for a document
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
   * Clear current active session (create new session, preserve history)
   */
  async clearCurrentSession(itemId: number): Promise<ChatSession> {
    // Create new session as current active session
    const newSession = await this.createNewSession(itemId);
    this.onMessageUpdate?.(itemId, newSession.messages, newSession.id);
    return newSession;
  }

  /**
   * Delete specific session
   */
  async deleteSession(itemId: number, sessionId: string): Promise<void> {
    await this.storageService.deleteSession(itemId, sessionId);

    // If deleted session was active, always create new session to show empty state
    const currentSession = this.activeSessions.get(itemId);
    if (currentSession && currentSession.id === sessionId) {
      // Create new session and update UI to show empty state
      const newSession = await this.createNewSession(itemId);
      this.onMessageUpdate?.(itemId, newSession.messages, newSession.id);
    }
  }

  /**
   * Clear all sessions for a document (completely delete)
   */
  async clearAllSessionsForItem(itemId: number): Promise<void> {
    await this.storageService.deleteAllSessionsForItem(itemId);
    this.activeSessions.delete(itemId);
  }

  /**
   * Check if item has PDF attachment
   */
  async hasPdfAttachment(item: Zotero.Item): Promise<boolean> {
    return this.pdfExtractor.hasPdfAttachment(item);
  }

  /**
   * Get selected PDF text
   */
  getSelectedText(): string | null {
    return this.pdfExtractor.getSelectedTextFromReader();
  }

  /**
   * Get PDF extractor
   */
  getPdfExtractor(): PdfExtractor {
    return this.pdfExtractor;
  }

  /**
   * Generate unique ID
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
   * Generate session title
   * Uses AI to generate a short title based on first round of conversation
   */
  private async generateSessionTitle(
    session: ChatSession,
    itemId: number,
  ): Promise<void> {
    try {
      const provider = this.getActiveProvider();
      if (!provider || !provider.isReady()) return;

      // Get first round of conversation content
      const validMessages = session.messages.filter(
        (msg) => msg.content && msg.content.trim() !== "",
      );
      if (validMessages.length < 2) return;

      const firstUserMessage = validMessages.find((msg) => msg.role === "user");
      const firstAssistantMessage = validMessages.find(
        (msg) => msg.role === "assistant",
      );

      if (!firstUserMessage || !firstAssistantMessage) return;

      // Extract user's pure question content (remove PDF content prefixes)
      const userContent = firstUserMessage.content;
      const questionMatch = userContent.match(/\[Question\]:\s*(.+)/s);
      let userQuestion = questionMatch
        ? questionMatch[1].trim()
        : userContent
            .replace(/\[PDF Content\]:[\s\S]*?(?=\[Question\]:|$)/, "")
            .replace(/\[Selected[^\]]*\]:\s*/g, "")
            .trim();

      // Remove leading markers like "[Selected]:"
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
   * Get session with its title
   */
  async getSessionWithTitle(
    itemId: number,
    sessionId: string,
  ): Promise<ChatSession | null> {
    return this.storageService.loadSession(itemId, sessionId);
  }

  /**
   * Load session for specified item to current (for session switching)
   * @deprecated Use switchSession instead
   */
  async loadSessionForItem(itemId: number): Promise<ChatSession | null> {
    return this.getOrCreateSession(itemId);
  }

  /**
   * Destroy
   */
  async destroy(): Promise<void> {
    // Save all active sessions
    for (const session of this.activeSessions.values()) {
      await this.storageService.saveSession(session);
    }
    this.activeSessions.clear();
  }
}
