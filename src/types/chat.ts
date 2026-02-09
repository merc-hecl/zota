/**
 * Chat Types - Type definitions for chat functionality
 */

// Image data attached to a message
export interface MessageImage {
  id: string;
  base64: string;
  mimeType: string;
}

// Chat message
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: number;
  pdfContext?: boolean; // Whether PDF context is included
  selectedText?: string; // Selected PDF text
  images?: MessageImage[]; // Attached images
}

// Chat session
export interface ChatSession {
  id: string;
  itemId: number; // Associated Zotero Item ID
  messages: ChatMessage[];
  pdfAttached: boolean;
  pdfContent?: string;
  createdAt: number;
  updatedAt: number;
  title?: string; // Session title, optional
}

// Document sessions list (one document can have multiple sessions)
export interface DocumentSessions {
  itemId: number;
  sessions: ChatSession[];
  activeSessionId: string | null; // Currently active session ID
}

// API configuration
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

// OpenAI API message format
export interface OpenAIMessage {
  role: "user" | "assistant" | "system";
  content: string | OpenAIMessageContent[];
}

// OpenAI message content (Vision API and File API)
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

// Stream response callbacks
export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullContent: string) => void;
  onError: (error: Error) => void;
}

// Chat manager callbacks with session identification
export interface ChatManagerCallbacks {
  onMessageUpdate?: (
    itemId: number,
    messages: ChatMessage[],
    sessionId?: string,
  ) => void;
  onStreamingUpdate?: (
    itemId: number,
    content: string,
    sessionId?: string,
  ) => void;
  onError?: (error: Error, itemId?: number, sessionId?: string) => void;
  onPdfAttached?: () => void;
  onMessageComplete?: (itemId?: number, sessionId?: string) => void;
}

// Send message options
export interface SendMessageOptions {
  attachPdf?: boolean;
  selectedText?: string;
  images?: Array<{ id: string; base64: string; mimeType: string }>;
}

// Stored session metadata
export interface StoredSessionMeta {
  itemId: number;
  itemName: string;
  messageCount: number;
  lastMessagePreview: string;
  lastUpdated: number;
  sessionId: string; // Unique session ID
  sessionTitle?: string; // Session title
  isEmpty: boolean; // Whether session is empty (no messages)
}
