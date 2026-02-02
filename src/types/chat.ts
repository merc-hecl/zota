/**
 * Chat Types - 聊天相关类型定义
 */

// 聊天消息
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: number;
  pdfContext?: boolean; // 是否包含PDF上下文
  selectedText?: string; // 选中的PDF文本
}

// 聊天会话
export interface ChatSession {
  id: string;
  itemId: number; // 关联的Zotero Item ID
  messages: ChatMessage[];
  pdfAttached: boolean;
  pdfContent?: string;
  createdAt: number;
  updatedAt: number;
  title?: string; // 会话标题，可选
}

// 文档的会话列表（一个文档可以有多个会话）
export interface DocumentSessions {
  itemId: number;
  sessions: ChatSession[];
  activeSessionId: string | null; // 当前活动的会话ID
}

// API配置
export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  providerId?: string; // Reference to provider config
  providerType?: string; // Type of provider for format selection
}

// OpenAI API消息格式
export interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: string | OpenAIMessageContent[];
}

// OpenAI消息内容 (Vision API and File API)
export type OpenAIMessageContent =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "low" | "high" | "auto" };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: string; data: string };
    };

// 流式响应回调
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullContent: string) => void;
  onError: (error: Error) => void;
}

// 发送消息选项
export interface SendMessageOptions {
  attachPdf?: boolean;
  selectedText?: string;
}

// 存储的会话元数据
export interface StoredSessionMeta {
  itemId: number;
  itemName: string;
  messageCount: number;
  lastMessagePreview: string;
  lastUpdated: number;
  sessionId: string; // 会话唯一ID
  sessionTitle?: string; // 会话标题
  isEmpty: boolean; // 是否为空会话（无消息）
}
