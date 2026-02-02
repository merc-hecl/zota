/**
 * StorageService - 对话历史持久化
 *
 * 使用Zotero Profile目录下的JSON文件存储对话历史
 * 使用索引文件缓存元数据，避免频繁读取所有session文件
 * 支持一个文档多个会话的管理
 */

import type {
  ChatSession,
  StoredSessionMeta,
  DocumentSessions,
} from "../../types/chat";

export class StorageService {
  private storagePath: string;
  private initialized: boolean = false;
  private indexCache: StoredSessionMeta[] | null = null;

  constructor() {
    // 存储路径: Zotero Profile/zota/conversations/
    this.storagePath = "";
  }

  /**
   * 初始化存储目录
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // 获取Zotero数据目录
      const dataDir = Zotero.DataDirectory.dir;
      this.storagePath = PathUtils.join(dataDir, "zota", "conversations");

      // 确保目录存在
      if (!(await IOUtils.exists(this.storagePath))) {
        await IOUtils.makeDirectory(this.storagePath, {
          createAncestors: true,
        });
      }

      // 加载或重建索引
      await this.loadOrRebuildIndex();

      this.initialized = true;
      ztoolkit.log("StorageService initialized:", this.storagePath);
    } catch (error) {
      ztoolkit.log("StorageService init error:", error);
      throw error;
    }
  }

  /**
   * 获取索引文件路径
   */
  private getIndexPath(): string {
    return PathUtils.join(this.storagePath, "_index.json");
  }

  /**
   * 获取文档会话列表文件路径
   */
  private getDocumentSessionsPath(itemId: number): string {
    return PathUtils.join(this.storagePath, `${itemId}.json`);
  }

  /**
   * 加载或重建索引
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

    // 重建索引
    await this.rebuildIndex();
  }

  /**
   * 重建索引（从所有session文件）
   * 使用并行读取提升性能
   */
  private async rebuildIndex(): Promise<void> {
    const children = await IOUtils.getChildren(this.storagePath);

    // 过滤出session文件（排除索引文件）
    const sessionFiles = children.filter(
      (f) => f.endsWith(".json") && !f.endsWith("_index.json"),
    );

    // 并行读取所有session文件
    const metaPromises = sessionFiles.map(async (filePath) => {
      try {
        const data = (await IOUtils.readJSON(filePath)) as DocumentSessions;
        if (data.sessions && Array.isArray(data.sessions)) {
          // 为每个会话创建元数据
          const metas: StoredSessionMeta[] = [];
          for (const session of data.sessions) {
            const meta = await this.buildSessionMeta(session, data.itemId);
            metas.push(meta);
          }
          return metas;
        }
        return null;
      } catch {
        // 忽略无效的JSON文件
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
   * 保存索引
   */
  private async saveIndex(): Promise<void> {
    if (!this.indexCache) return;
    const indexPath = this.getIndexPath();
    await IOUtils.writeJSON(indexPath, this.indexCache);
  }

  /**
   * 构建session元数据
   */
  private async buildSessionMeta(
    session: ChatSession,
    itemId: number,
  ): Promise<StoredSessionMeta> {
    // 获取item名称
    let itemName = "Global Chat";
    if (itemId !== 0) {
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

    // 获取最后一条消息预览
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

    // 判断是否为空会话
    const isEmpty = validMessages.length === 0;

    // 如果没有标题但有消息，使用第一条用户消息的前20个字符作为临时标题
    let sessionTitle = session.title;
    if (!sessionTitle && validMessages.length > 0) {
      const firstUserMessage = validMessages.find((msg) => msg.role === "user");
      if (firstUserMessage) {
        // 提取用户问题的纯文本部分（去掉[PDF Content]等标记）
        const content = firstUserMessage.content;
        const questionMatch = content.match(/\[Question\]:\s*(.+)/s);
        const questionText = questionMatch ? questionMatch[1].trim() : content;
        sessionTitle =
          questionText.substring(0, 25) +
          (questionText.length > 25 ? "..." : "");
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
    };
  }

  /**
   * 更新索引中的单个条目
   */
  private async updateIndexEntry(
    session: ChatSession,
    itemId: number,
  ): Promise<void> {
    if (!this.indexCache) {
      this.indexCache = [];
    }

    const meta = await this.buildSessionMeta(session, itemId);

    // 查找并更新或添加
    const existingIndex = this.indexCache.findIndex(
      (m) => m.sessionId === session.id,
    );
    if (existingIndex >= 0) {
      this.indexCache[existingIndex] = meta;
    } else {
      this.indexCache.push(meta);
    }

    // 按更新时间排序
    this.indexCache.sort((a, b) => b.lastUpdated - a.lastUpdated);

    await this.saveIndex();
  }

  /**
   * 从索引中删除条目
   */
  private async removeIndexEntry(sessionId: string): Promise<void> {
    if (!this.indexCache) return;

    this.indexCache = this.indexCache.filter((m) => m.sessionId !== sessionId);
    await this.saveIndex();
  }

  /**
   * 加载文档的所有会话
   */
  async loadDocumentSessions(itemId: number): Promise<DocumentSessions | null> {
    await this.init();

    try {
      const filePath = this.getDocumentSessionsPath(itemId);

      if (await IOUtils.exists(filePath)) {
        const data = (await IOUtils.readJSON(filePath)) as DocumentSessions;

        // 过滤掉空内容的消息（修复历史数据问题）
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
   * 保存文档的所有会话
   */
  async saveDocumentSessions(
    documentSessions: DocumentSessions,
  ): Promise<void> {
    await this.init();

    try {
      const filePath = this.getDocumentSessionsPath(documentSessions.itemId);

      await IOUtils.writeJSON(filePath, documentSessions);

      // 更新索引
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
   * 保存单个会话（自动创建或更新文档会话列表）
   */
  async saveSession(session: ChatSession): Promise<void> {
    await this.init();

    try {
      // 加载现有文档会话
      let docSessions = await this.loadDocumentSessions(session.itemId);

      if (!docSessions) {
        // 创建新的文档会话列表
        docSessions = {
          itemId: session.itemId,
          sessions: [session],
          activeSessionId: session.id,
        };
      } else {
        // 查找并更新现有会话，或添加新会话
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
   * 加载特定会话
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
          // 过滤空消息
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
   * 获取文档的活动会话
   */
  async getActiveSession(itemId: number): Promise<ChatSession | null> {
    const docSessions = await this.loadDocumentSessions(itemId);
    if (docSessions && docSessions.activeSessionId) {
      return this.loadSession(itemId, docSessions.activeSessionId);
    }
    // 如果没有活动会话，返回第一个非空会话
    if (docSessions && docSessions.sessions.length > 0) {
      // 找到第一个有消息的会话
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
   * 设置文档的活动会话
   */
  async setActiveSession(itemId: number, sessionId: string): Promise<void> {
    const docSessions = await this.loadDocumentSessions(itemId);
    if (docSessions) {
      docSessions.activeSessionId = sessionId;
      await this.saveDocumentSessions(docSessions);
    }
  }

  /**
   * 删除特定会话
   */
  async deleteSession(itemId: number, sessionId: string): Promise<void> {
    await this.init();

    try {
      const docSessions = await this.loadDocumentSessions(itemId);
      if (docSessions) {
        // 从会话列表中移除
        docSessions.sessions = docSessions.sessions.filter(
          (s) => s.id !== sessionId,
        );

        // 如果删除的是活动会话，重置活动会话
        if (docSessions.activeSessionId === sessionId) {
          docSessions.activeSessionId =
            docSessions.sessions.length > 0 ? docSessions.sessions[0].id : null;
        }

        // 如果会话列表为空，删除整个文件
        if (docSessions.sessions.length === 0) {
          const filePath = this.getDocumentSessionsPath(itemId);
          if (await IOUtils.exists(filePath)) {
            await IOUtils.remove(filePath);
          }
        } else {
          await this.saveDocumentSessions(docSessions);
        }

        // 更新索引
        await this.removeIndexEntry(sessionId);

        ztoolkit.log("Session deleted:", sessionId);
      }
    } catch (error) {
      ztoolkit.log("Delete session error:", error);
      throw error;
    }
  }

  /**
   * 删除文档的所有会话
   */
  async deleteAllSessionsForItem(itemId: number): Promise<void> {
    await this.init();

    try {
      const docSessions = await this.loadDocumentSessions(itemId);
      if (docSessions) {
        // 从索引中移除所有会话
        for (const session of docSessions.sessions) {
          await this.removeIndexEntry(session.id);
        }

        // 删除文件
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
   * 列出所有会话（直接返回缓存的索引，过滤掉空会话）
   */
  async listSessions(
    itemId?: number,
    includeEmpty: boolean = false,
  ): Promise<StoredSessionMeta[]> {
    await this.init();

    let result = [...(this.indexCache || [])];

    // 如果指定了itemId，只返回该文档的会话
    if (itemId !== undefined) {
      result = result.filter((m) => m.itemId === itemId);
    }

    // 默认过滤掉空会话
    if (!includeEmpty) {
      result = result.filter((m) => !m.isEmpty);
    }

    // 按更新时间排序
    result.sort((a, b) => b.lastUpdated - a.lastUpdated);
    return result;
  }

  /**
   * 创建新会话
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

    // 保存新会话
    await this.saveSession(newSession);

    return newSession;
  }

  /**
   * 清空所有会话
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

      // 清空索引缓存
      this.indexCache = [];

      ztoolkit.log("All sessions cleared");
    } catch (error) {
      ztoolkit.log("Clear all sessions error:", error);
      throw error;
    }
  }

  /**
   * 导出会话为JSON字符串
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
   * 导入会话
   */
  async importSession(
    jsonString: string,
    itemId?: number,
  ): Promise<ChatSession | null> {
    try {
      const session = JSON.parse(jsonString) as ChatSession;
      if (session.messages) {
        // 如果指定了itemId，更新会话的itemId
        if (itemId !== undefined) {
          session.itemId = itemId;
        }
        // 生成新ID以避免冲突
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
   * 生成唯一ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
