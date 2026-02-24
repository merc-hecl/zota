/**
 * Chat Types - Type definitions for chat functionality
 */

// Image data attached to a message
export interface MessageImage {
  id: string;
  base64: string;
  mimeType: string;
}

// Document reference for multi-document sessions
export interface DocumentReference {
  id: number;
  title: string;
  creators?: string;
  year?: number;
}

// Content version for regenerated messages
export interface ContentVersion {
  content: string;
  timestamp: number;
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
  documents?: DocumentReference[]; // Attached document references
  // For regenerated AI responses
  contentVersions?: ContentVersion[]; // All versions of content (for regenerated messages)
  currentVersionIndex?: number; // Current displayed version index (0-based)
  // For aborted AI responses
  isComplete?: boolean; // Whether the message completed naturally (true) or was aborted (false)
  // For hidden messages (e.g., continue prompt messages)
  isHidden?: boolean; // Whether to hide this message in the UI
  // For reasoning/thinking content from AI
  reasoningContent?: string; // Reasoning/thinking content from AI models that support it
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
  documentIds?: number[]; // Array of associated document item IDs
  documentNames?: string[]; // Array of document display names
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
  onReasoningChunk?: (chunk: string) => void; // Callback for reasoning content chunks
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
  documents?: DocumentReference[]; // Attached document references
  continueFromMessageId?: string; // Message ID to continue from (for continue response feature)
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
  documentIds?: number[]; // Document IDs for multi-document sessions
  documentNames?: string[]; // Document display names
}
