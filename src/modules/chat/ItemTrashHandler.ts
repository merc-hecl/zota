/**
 * ItemTrashHandler - Handle chat history cleanup when items are moved to trash
 */

import { config } from "../../../package.json";
import { StorageService } from "./StorageService";

let trashNotifierID: string | null = null;
let storageService: StorageService | null = null;

/**
 * Get or create StorageService instance
 */
function getStorageService(): StorageService {
  if (!storageService) {
    storageService = new StorageService();
  }
  return storageService;
}

/**
 * Handle items moved to trash
 */
async function handleItemsMovedToTrash(itemIds: number[]): Promise<void> {
  if (!itemIds || itemIds.length === 0) return;

  const storage = getStorageService();

  for (const itemId of itemIds) {
    try {
      // Delete all chat sessions for this item
      await storage.deleteAllSessionsForItem(itemId);
      ztoolkit.log(
        "[ItemTrashHandler] Chat history deleted for item moved to trash:",
        itemId,
      );
    } catch (error) {
      ztoolkit.log(
        "[ItemTrashHandler] Error deleting chat history for item:",
        itemId,
        error,
      );
    }
  }
}

/**
 * Handle items permanently deleted
 */
async function handleItemsDeleted(itemIds: number[]): Promise<void> {
  // Same handling as trash - delete chat history
  await handleItemsMovedToTrash(itemIds);
}

/**
 * Register trash event notifier
 */
export function registerItemTrashHandler(): void {
  if (trashNotifierID) return;

  trashNotifierID = Zotero.Notifier.registerObserver(
    {
      notify: async (event, type, ids, _extraData) => {
        if (type !== "item") return;

        if (event === "trash") {
          ztoolkit.log("[ItemTrashHandler] Items moved to trash:", ids);
          await handleItemsMovedToTrash(ids as number[]);
        } else if (event === "delete") {
          ztoolkit.log("[ItemTrashHandler] Items permanently deleted:", ids);
          await handleItemsDeleted(ids as number[]);
        }
      },
    },
    ["item"],
    `${config.addonRef}-item-trash-handler`,
  );

  ztoolkit.log("[ItemTrashHandler] Registered item trash handler");
}

/**
 * Unregister trash event notifier
 */
export function unregisterItemTrashHandler(): void {
  if (trashNotifierID) {
    Zotero.Notifier.unregisterObserver(trashNotifierID);
    trashNotifierID = null;
    ztoolkit.log("[ItemTrashHandler] Unregistered item trash handler");
  }
}
