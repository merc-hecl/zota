/**
 * DragDropManager - Manage drag and drop state for the chat panel
 *
 * This module handles the global drag state that shows a drop zone overlay
 * when users drag Zotero annotations or images over the chat panel.
 */

type DragStateCallback = (isDragging: boolean) => void;

let dragCounter: number = 0;
let isCurrentlyDragging: boolean = false;
const callbacks: Set<DragStateCallback> = new Set();

/**
 * Get current drag state
 */
export function isDragging(): boolean {
  return isCurrentlyDragging;
}

/**
 * Increment drag counter (called on dragenter)
 */
export function incrementDrag(): number {
  dragCounter++;
  updateState();
  return dragCounter;
}

/**
 * Decrement drag counter (called on dragleave)
 */
export function decrementDrag(): number {
  dragCounter = Math.max(0, dragCounter - 1);
  updateState();
  return dragCounter;
}

/**
 * Reset drag state (called on drop)
 */
export function resetDragState(): void {
  dragCounter = 0;
  isCurrentlyDragging = false;
  notifyCallbacks();
}

/**
 * Subscribe to drag state changes
 */
export function onDragStateChange(callback: DragStateCallback): () => void {
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

/**
 * Update internal state and notify if changed
 */
function updateState(): void {
  const newState = dragCounter > 0;
  if (newState !== isCurrentlyDragging) {
    isCurrentlyDragging = newState;
    notifyCallbacks();
  }
}

/**
 * Notify all subscribers of state change
 */
function notifyCallbacks(): void {
  callbacks.forEach((callback) => {
    try {
      callback(isCurrentlyDragging);
    } catch (error) {
      ztoolkit.log("[DragDropManager] Callback error:", error);
    }
  });
}
