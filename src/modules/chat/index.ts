/**
 * Chat Module Exports
 */

export { ChatManager } from "./ChatManager";
export { StorageService } from "./StorageService";
export { PdfExtractor } from "./PdfExtractor";
export { NoteExportService, getNoteExportService } from "./NoteExportService";

// Re-export types
export type {
  ChatMessage,
  ChatSession,
  SendMessageOptions,
  StreamCallbacks,
} from "../../types/chat";
