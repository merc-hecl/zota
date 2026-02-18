/**
 * StorageService - Conversation history persistence
 *
 * Uses JSON files in Zotero Profile directory to store conversation history
 * Uses index file to cache metadata, avoiding frequent reads of all session files
 * Supports multiple sessions per document
 */

import type {
  ChatSession,
  StoredSessionMeta,
  DocumentSessions,
} from "../../types/chat";
import { getString } from "../../utils/locale";

export class StorageService {
  private storagePath: string;
  private initialized: boolean = false;
  private indexCache: StoredSessionMeta[] | null = null;

  constructor() {
    // Storage path: Zotero Profile/zota/conversations/
    this.storagePath = "";
  }

  /**
   * Initialize storage directory
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get Zotero data directory
      const dataDir = Zotero.DataDirectory.dir;
      this.storagePath = PathUtils.join(dataDir, "zota", "conversations");

      // Ensure directory exists
      if (!(await IOUtils.exists(this.storagePath))) {
        await IOUtils.makeDirectory(this.storagePath, {
          createAncestors: true,
        });
      }

      // Load or rebuild index
      await this.loadOrRebuildIndex();

      this.initialized = true;
      ztoolkit.log("StorageService initialized:", this.storagePath);
    } catch (error) {
      ztoolkit.log("StorageService init error:", error);
      throw error;
    }
  }

  /**
   * Get index file path
   */
  private getIndexPath(): string {
    return PathUtils.join(this.storagePath, "_index.json");
  }

  /**
   * Get document sessions file path
   */
  private getDocumentSessionsPath(itemId: number): string {
    return PathUtils.join(this.storagePath, `${itemId}.json`);
  }

  /**
   * Load or rebuild index
   */
  private async loadOrRebuildIndex(): Promise<void> {
    const indexPath = this.getIndexPath();

    try {
      if (await IOUtils.exists(indexPath)) {
        this.indexCache = (await IOUtils.readJSON(
          indexPath,
        )) as StoredSessionMeta[];
        ztoolkit.log("Index loaded, sessions count:", this.indexCache.length);
        return;
      }
    } catch {
      ztoolkit.log("Index file invalid, rebuilding...");
    }

    // Rebuild index
    await this.rebuildIndex();
  }

  /**
   * Rebuild index (from all session files)
   * Uses parallel reads for better performance
   */
  private async rebuildIndex(): Promise<void> {
    const children = await IOUtils.getChildren(this.storagePath);

    // Filter session files (exclude index file)
    const sessionFiles = children.filter(
      (f) => f.endsWith(".json") && !f.endsWith("_index.json"),
    );

    // Read all session files in parallel
    const metaPromises = sessionFiles.map(async (filePath) => {
      try {
        const data = (await IOUtils.readJSON(filePath)) as DocumentSessions;
        if (data.sessions && Array.isArray(data.sessions)) {
          // Create metadata for each session
          const metas: StoredSessionMeta[] = [];
          for (const session of data.sessions) {
            const meta = await this.buildSessionMeta(session, data.itemId);
            metas.push(meta);
          }
          return metas;
        }
        return null;
      } catch {
        // Ignore invalid JSON files
        return null;
      }
    });

    const results = await Promise.all(metaPromises);
    const allMetas = results
      .filter((metas): metas is StoredSessionMeta[] => metas !== null)
      .flat();

    this.indexCache = allMetas;

    await this.saveIndex();
    ztoolkit.log("Index rebuilt, sessions count:", this.indexCache.length);
  }

  /**
   * Save index
   */
  private async saveIndex(): Promise<void> {
    if (!this.indexCache) return;
    const indexPath = this.getIndexPath();
    await IOUtils.writeJSON(indexPath, this.indexCache);
  }

  /**
   * Build session metadata
   */
  private async buildSessionMeta(
    session: ChatSession,
    itemId: number,
  ): Promise<StoredSessionMeta> {
    // Get item name - check for multi-document sessions first
    let itemName = "Global Chat";
    let documentIds: number[] | undefined;
    let documentNames: string[] | undefined;

    // Check if session has document references (multi-document session)
    if (session.documentIds && session.documentIds.length > 0) {
      documentIds = session.documentIds;
      documentNames = session.documentNames;

      if (session.documentIds.length > 1) {
        // Multi-document session - show first few words of document names
        if (documentNames && documentNames.length > 0) {
          // Get first 2 words from each document name, max 3 documents
          const maxDocs = 3;
          const maxWordsPerDoc = 2;
          const nameParts = documentNames.slice(0, maxDocs).map((name) => {
            const words = name.split(/\s+/).slice(0, maxWordsPerDoc);
            return words.join(" ");
          });
          // Join with comma, add ellipsis if more docs
          if (documentNames.length > maxDocs) {
            itemName = nameParts.join(", ") + "...";
          } else {
            itemName = nameParts.join(", ");
          }
          // Truncate if too long
          if (itemName.length > 50) {
            itemName = itemName.substring(0, 47) + "...";
          }
        } else {
          itemName = getString("chat-multiple-documents");
        }
      } else if (session.documentNames && session.documentNames.length > 0) {
        // Single document session - use the document name
        itemName = session.documentNames[0];
      }
    } else if (itemId !== 0) {
      // Traditional single-document session (no documentIds array)
      try {
        const item = await Zotero.Items.getAsync(itemId);
        if (item) {
          if (item.isAttachment()) {
            const parentId = item.parentItemID;
            if (parentId) {
              const parent = await Zotero.Items.getAsync(parentId);
              itemName =
                parent?.getDisplayTitle() ||
                item.attachmentFilename ||
                `Item ${itemId}`;
            } else {
              itemName = item.attachmentFilename || `Item ${itemId}`;
            }
          } else {
            itemName = item.getDisplayTitle() || `Item ${itemId}`;
          }
        } else {
          itemName = `Item ${itemId} (deleted)`;
        }
      } catch {
        itemName = `Item ${itemId}`;
      }
    }

    // Get last message preview
    let lastMessagePreview = "";
    const validMessages =
      session.messages?.filter(
        (msg) => msg.content && msg.content.trim() !== "",
      ) || [];

    if (validMessages.length > 0) {
      const last = validMessages[validMessages.length - 1];
      lastMessagePreview =
        last.content.substring(0, 50) + (last.content.length > 50 ? "..." : "");
    }

    // Check if session is empty
    const isEmpty = validMessages.length === 0;

    // If no title but has messages, use first 25 chars of first user message as temp title
    let sessionTitle = session.title;
    if (!sessionTitle && validMessages.length > 0) {
      const firstUserMessage = validMessages.find((msg) => msg.role === "user");
      if (firstUserMessage) {
        // Extract user's pure question text (remove markers like [PDF Content])
        const content = firstUserMessage.content;
        const questionMatch = content.match(/\[Question\]:\s*(.+)/s);
        const questionText = questionMatch ? questionMatch[1].trim() : content;
        sessionTitle =
          questionText.substring(0, 25) +
          (questionText.length > 25 ? "..." : "");
      }
    }

    // If still no title but has documents, use document name as hint
    if (!sessionTitle && documentNames && documentNames.length > 0) {
      if (documentNames.length > 1) {
        sessionTitle = getString("chat-multiple-documents");
      } else {
        sessionTitle = documentNames[0];
      }
    }

    return {
      itemId: itemId,
      itemName,
      messageCount: validMessages.length,
      lastMessagePreview,
      lastUpdated: session.updatedAt,
      sessionId: session.id,
      sessionTitle,
      isEmpty,
      documentIds,
      documentNames,
    };
  }

  /**
   * Update single entry in index
   */
  private async updateIndexEntry(
    session: ChatSession,
    itemId: number,
  ): Promise<void> {
    if (!this.indexCache) {
      this.indexCache = [];
    }

    const meta = await this.buildSessionMeta(session, itemId);

    // Find and update or add
    const existingIndex = this.indexCache.findIndex(
      (m) => m.sessionId === session.id,
    );
    if (existingIndex >= 0) {
      this.indexCache[existingIndex] = meta;
    } else {
      this.indexCache.push(meta);
    }

    // Sort by update time
    this.indexCache.sort((a, b) => b.lastUpdated - a.lastUpdated);

    await this.saveIndex();
  }

  /**
   * Remove entry from index
   */
  private async removeIndexEntry(sessionId: string): Promise<void> {
    if (!this.indexCache) return;

    this.indexCache = this.indexCache.filter((m) => m.sessionId !== sessionId);
    await this.saveIndex();
  }

  /**
   * Load all sessions for a document
   */
  async loadDocumentSessions(itemId: number): Promise<DocumentSessions | null> {
    await this.init();

    try {
      const filePath = this.getDocumentSessionsPath(itemId);

      if (await IOUtils.exists(filePath)) {
        const data = (await IOUtils.readJSON(filePath)) as DocumentSessions;

        // Filter out empty content messages (fix historical data issues)
        if (data.sessions) {
          for (const session of data.sessions) {
            if (session.messages) {
              session.messages = session.messages.filter(
                (msg) => msg.content && msg.content.trim() !== "",
              );
            }
          }
        }

        ztoolkit.log("Document sessions loaded:", itemId);
        return data;
      }

      return null;
    } catch (error) {
      ztoolkit.log("Load document sessions error:", error);
      return null;
    }
  }

  /**
   * Save all sessions for a document
   */
  async saveDocumentSessions(
    documentSessions: DocumentSessions,
  ): Promise<void> {
    await this.init();

    try {
      const filePath = this.getDocumentSessionsPath(documentSessions.itemId);

      await IOUtils.writeJSON(filePath, documentSessions);

      // Update index
      for (const session of documentSessions.sessions) {
        await this.updateIndexEntry(session, documentSessions.itemId);
      }

      ztoolkit.log("Document sessions saved:", documentSessions.itemId);
    } catch (error) {
      ztoolkit.log("Save document sessions error:", error);
      throw error;
    }
  }

  /**
   * Save single session (auto creates or updates document sessions list)
   */
  async saveSession(session: ChatSession): Promise<void> {
    await this.init();

    try {
      // Load existing document sessions
      let docSessions = await this.loadDocumentSessions(session.itemId);

      if (!docSessions) {
        // Create new document sessions list
        docSessions = {
          itemId: session.itemId,
          sessions: [session],
          activeSessionId: session.id,
        };
      } else {
        // Find and update existing session, or add new session
        const existingIndex = docSessions.sessions.findIndex(
          (s) => s.id === session.id,
        );
        if (existingIndex >= 0) {
          docSessions.sessions[existingIndex] = session;
        } else {
          docSessions.sessions.push(session);
        }
        docSessions.activeSessionId = session.id;
      }

      session.updatedAt = Date.now();
      await this.saveDocumentSessions(docSessions);

      ztoolkit.log("Session saved:", session.id, "for item:", session.itemId);
    } catch (error) {
      ztoolkit.log("Save session error:", error);
      throw error;
    }
  }

  /**
   * Load specific session
   */
  async loadSession(
    itemId: number,
    sessionId: string,
  ): Promise<ChatSession | null> {
    await this.init();

    try {
      const docSessions = await this.loadDocumentSessions(itemId);
      if (docSessions && docSessions.sessions) {
        const session = docSessions.sessions.find((s) => s.id === sessionId);
        if (session) {
          // Filter empty messages
          if (session.messages) {
            session.messages = session.messages.filter(
              (msg) => msg.content && msg.content.trim() !== "",
            );
          }
          return session;
        }
      }
      return null;
    } catch (error) {
      ztoolkit.log("Load session error:", error);
      return null;
    }
  }

  /**
   * Get active session for a document
   */
  async getActiveSession(itemId: number): Promise<ChatSession | null> {
    const docSessions = await this.loadDocumentSessions(itemId);
    if (docSessions && docSessions.activeSessionId) {
      return this.loadSession(itemId, docSessions.activeSessionId);
    }
    // If no active session, return first non-empty session
    if (docSessions && docSessions.sessions.length > 0) {
      // Find first session with messages
      for (const session of docSessions.sessions) {
        const validMessages =
          session.messages?.filter(
            (msg) => msg.content && msg.content.trim() !== "",
          ) || [];
        if (validMessages.length > 0) {
          return session;
        }
      }
    }
    return null;
  }

  /**
   * Set active session for a document
   */
  async setActiveSession(itemId: number, sessionId: string): Promise<void> {
    const docSessions = await this.loadDocumentSessions(itemId);
    if (docSessions) {
      docSessions.activeSessionId = sessionId;
      await this.saveDocumentSessions(docSessions);
    }
  }

  /**
   * Delete specific session
   */
  async deleteSession(itemId: number, sessionId: string): Promise<void> {
    await this.init();

    try {
      const docSessions = await this.loadDocumentSessions(itemId);
      if (docSessions) {
        // Remove from session list
        docSessions.sessions = docSessions.sessions.filter(
          (s) => s.id !== sessionId,
        );

        // If deleted session was active, reset active session
        if (docSessions.activeSessionId === sessionId) {
          docSessions.activeSessionId =
            docSessions.sessions.length > 0 ? docSessions.sessions[0].id : null;
        }

        // If session list is empty, delete entire file
        if (docSessions.sessions.length === 0) {
          const filePath = this.getDocumentSessionsPath(itemId);
          if (await IOUtils.exists(filePath)) {
            await IOUtils.remove(filePath);
          }
        } else {
          await this.saveDocumentSessions(docSessions);
        }

        // Update index
        await this.removeIndexEntry(sessionId);

        ztoolkit.log("Session deleted:", sessionId);
      }
    } catch (error) {
      ztoolkit.log("Delete session error:", error);
      throw error;
    }
  }

  /**
   * Delete all sessions for a document
   */
  async deleteAllSessionsForItem(itemId: number): Promise<void> {
    await this.init();

    try {
      const docSessions = await this.loadDocumentSessions(itemId);
      if (docSessions) {
        // Remove all sessions from index
        for (const session of docSessions.sessions) {
          await this.removeIndexEntry(session.id);
        }

        // Delete file
        const filePath = this.getDocumentSessionsPath(itemId);
        if (await IOUtils.exists(filePath)) {
          await IOUtils.remove(filePath);
        }

        ztoolkit.log("All sessions deleted for item:", itemId);
      }
    } catch (error) {
      ztoolkit.log("Delete all sessions error:", error);
      throw error;
    }
  }

  /**
   * List all sessions (returns cached index directly, filters empty sessions)
   */
  async listSessions(
    itemId?: number,
    includeEmpty: boolean = false,
  ): Promise<StoredSessionMeta[]> {
    await this.init();

    let result = [...(this.indexCache || [])];

    // If itemId specified, only return sessions for that document
    if (itemId !== undefined) {
      result = result.filter((m) => m.itemId === itemId);
    }

    // Filter out empty sessions by default
    if (!includeEmpty) {
      result = result.filter((m) => !m.isEmpty);
    }

    // Sort by update time
    result.sort((a, b) => b.lastUpdated - a.lastUpdated);
    return result;
  }

  /**
   * Create new session
   */
  async createNewSession(itemId: number): Promise<ChatSession> {
    await this.init();

    const newSession: ChatSession = {
      id: this.generateId(),
      itemId,
      messages: [],
      pdfAttached: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Save new session
    await this.saveSession(newSession);

    return newSession;
  }

  /**
   * Clear all sessions
   */
  async clearAll(): Promise<void> {
    await this.init();

    try {
      const children = await IOUtils.getChildren(this.storagePath);

      for (const filePath of children) {
        if (filePath.endsWith(".json")) {
          await IOUtils.remove(filePath);
        }
      }

      // Clear index cache
      this.indexCache = [];

      ztoolkit.log("All sessions cleared");
    } catch (error) {
      ztoolkit.log("Clear all sessions error:", error);
      throw error;
    }
  }

  /**
   * Export session as JSON string
   */
  async exportSession(
    itemId: number,
    sessionId: string,
  ): Promise<string | null> {
    const session = await this.loadSession(itemId, sessionId);
    if (session) {
      return JSON.stringify(session, null, 2);
    }
    return null;
  }

  /**
   * Import session
   */
  async importSession(
    jsonString: string,
    itemId?: number,
  ): Promise<ChatSession | null> {
    try {
      const session = JSON.parse(jsonString) as ChatSession;
      if (session.messages) {
        // If itemId specified, update session's itemId
        if (itemId !== undefined) {
          session.itemId = itemId;
        }
        // Generate new ID to avoid conflicts
        session.id = this.generateId();
        session.createdAt = Date.now();
        session.updatedAt = Date.now();

        await this.saveSession(session);
        return session;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
