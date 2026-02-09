/**
 * StreamingStateManager - Unified state management for multi-document, multi-session chat
 *
 * Architecture:
 * - Each document (itemId) can have multiple sessions
 * - Each session has its own streaming state
 * - Views (sidebar/floating) track which session they're currently viewing
 * - All state changes are observable and trigger callbacks
 */

// ============================================================================
// Types
// ============================================================================

export interface SessionStreamingState {
  isStreaming: boolean;
  isSending: boolean;
  streamingContent: string;
  error: string | null;
}

export interface ViewState {
  viewId: string;
  container: HTMLElement;
  currentItemId: number;
  currentSessionId: string;
}

// ============================================================================
// State Store
// ============================================================================

// Session states: itemId -> sessionId -> SessionStreamingState
const sessionStates = new Map<number, Map<string, SessionStreamingState>>();

// View states: viewId -> ViewState
const viewStates = new Map<string, ViewState>();

// Track which view is viewing which session: "itemId:sessionId" -> Set<viewId>
const sessionToViews = new Map<string, Set<string>>();

// ============================================================================
// Callbacks
// ============================================================================

type StateChangeCallback = (
  itemId: number,
  sessionId: string,
  state: SessionStreamingState,
  views: ViewState[],
) => void;

const stateChangeCallbacks = new Set<StateChangeCallback>();

// ============================================================================
// Session State Management
// ============================================================================

function getOrCreateState(
  itemId: number,
  sessionId: string,
): SessionStreamingState {
  if (!sessionStates.has(itemId)) {
    sessionStates.set(itemId, new Map());
  }
  const itemSessions = sessionStates.get(itemId)!;

  if (!itemSessions.has(sessionId)) {
    itemSessions.set(sessionId, {
      isStreaming: false,
      isSending: false,
      streamingContent: "",
      error: null,
    });
  }

  return itemSessions.get(sessionId)!;
}

export function getSessionStreamingState(
  itemId: number,
  sessionId: string,
): SessionStreamingState {
  return getOrCreateState(itemId, sessionId);
}

export function setSessionStreamingState(
  itemId: number,
  sessionId: string,
  isStreaming: boolean,
): void {
  const state = getOrCreateState(itemId, sessionId);
  state.isStreaming = isStreaming;
  if (!isStreaming) {
    state.streamingContent = "";
  }
  notifyStateChange(itemId, sessionId, state);
}

export function setSessionSendingState(
  itemId: number,
  sessionId: string,
  isSending: boolean,
): void {
  const state = getOrCreateState(itemId, sessionId);
  state.isSending = isSending;
  notifyStateChange(itemId, sessionId, state);
}

export function updateStreamingContent(
  itemId: number,
  sessionId: string,
  content: string,
): void {
  const state = getOrCreateState(itemId, sessionId);
  state.streamingContent = content;
  state.isStreaming = true;
  notifyStateChange(itemId, sessionId, state);
}

export function setSessionError(
  itemId: number,
  sessionId: string,
  error: string | null,
): void {
  const state = getOrCreateState(itemId, sessionId);
  state.error = error;
  state.isStreaming = false;
  state.isSending = false;
  notifyStateChange(itemId, sessionId, state);
}

export function resetSessionState(itemId: number, sessionId: string): void {
  const itemSessions = sessionStates.get(itemId);
  if (itemSessions) {
    const state = itemSessions.get(sessionId);
    if (state) {
      state.isStreaming = false;
      state.isSending = false;
      state.streamingContent = "";
      state.error = null;
      notifyStateChange(itemId, sessionId, state);
    }
  }
}

export function clearItemStates(itemId: number): void {
  sessionStates.delete(itemId);
}

// ============================================================================
// View State Management
// ============================================================================

export function registerView(
  viewId: string,
  container: HTMLElement,
): ViewState {
  const view: ViewState = {
    viewId,
    container,
    currentItemId: 0,
    currentSessionId: "",
  };
  viewStates.set(viewId, view);
  return view;
}

export function unregisterView(viewId: string): void {
  const view = viewStates.get(viewId);
  if (view) {
    // Remove from session-to-views mapping
    const oldKey = `${view.currentItemId}:${view.currentSessionId}`;
    const views = sessionToViews.get(oldKey);
    if (views) {
      views.delete(viewId);
      if (views.size === 0) {
        sessionToViews.delete(oldKey);
      }
    }
  }
  viewStates.delete(viewId);
}

export function getViewState(viewId: string): ViewState | null {
  return viewStates.get(viewId) ?? null;
}

export function setViewSession(
  viewId: string,
  itemId: number,
  sessionId: string,
): void {
  const view = viewStates.get(viewId);
  if (!view) return;

  // Remove from old session mapping
  const oldKey = `${view.currentItemId}:${view.currentSessionId}`;
  const oldViews = sessionToViews.get(oldKey);
  if (oldViews) {
    oldViews.delete(viewId);
    if (oldViews.size === 0) {
      sessionToViews.delete(oldKey);
    }
  }

  // Update view state
  view.currentItemId = itemId;
  view.currentSessionId = sessionId;

  // Add to new session mapping
  const newKey = `${itemId}:${sessionId}`;
  let newViews = sessionToViews.get(newKey);
  if (!newViews) {
    newViews = new Set();
    sessionToViews.set(newKey, newViews);
  }
  newViews.add(viewId);

  ztoolkit.log(
    `[StreamingStateManager] View ${viewId} switched to session ${sessionId} (item ${itemId})`,
  );
}

export function getViewsForSession(
  itemId: number,
  sessionId: string,
): ViewState[] {
  const key = `${itemId}:${sessionId}`;
  const viewIds = sessionToViews.get(key);
  if (!viewIds) return [];

  const views: ViewState[] = [];
  viewIds.forEach((viewId) => {
    const view = viewStates.get(viewId);
    if (view) views.push(view);
  });
  return views;
}

// ============================================================================
// Helper Functions
// ============================================================================

export function isSessionActive(itemId: number, sessionId: string): boolean {
  const state = getOrCreateState(itemId, sessionId);
  return state.isStreaming || state.isSending;
}

// ============================================================================
// Subscription
// ============================================================================

function notifyStateChange(
  itemId: number,
  sessionId: string,
  state: SessionStreamingState,
): void {
  const views = getViewsForSession(itemId, sessionId);
  stateChangeCallbacks.forEach((callback) => {
    try {
      callback(itemId, sessionId, state, views);
    } catch (error) {
      ztoolkit.log(
        "[StreamingStateManager] Error in state change callback:",
        error,
      );
    }
  });
}

export function subscribeToStateChanges(
  callback: StateChangeCallback,
): () => void {
  stateChangeCallbacks.add(callback);
  return () => stateChangeCallbacks.delete(callback);
}

// ============================================================================
// Legacy Functions (for backward compatibility)
// ============================================================================

const activeSessionIds = new Map<number, string>();

export function getActiveSessionIdForItem(itemId: number): string | null {
  return activeSessionIds.get(itemId) ?? null;
}

export function setActiveSessionId(itemId: number, sessionId: string): void {
  activeSessionIds.set(itemId, sessionId);
}

export function clearActiveSessionId(itemId: number): void {
  activeSessionIds.delete(itemId);
}

// ============================================================================
// Debug
// ============================================================================

export function debugState(): void {
  ztoolkit.log("[StreamingStateManager] Debug State:");
  ztoolkit.log("  Session States:");
  sessionStates.forEach((itemSessions, itemId) => {
    itemSessions.forEach((state, sessionId) => {
      ztoolkit.log(
        `    Item ${itemId}, Session ${sessionId}: streaming=${state.isStreaming}, sending=${state.isSending}`,
      );
    });
  });
  ztoolkit.log("  View States:");
  viewStates.forEach((view) => {
    ztoolkit.log(
      `    View ${view.viewId}: item=${view.currentItemId}, session=${view.currentSessionId}`,
    );
  });
  ztoolkit.log("  Session to Views:");
  sessionToViews.forEach((views, key) => {
    ztoolkit.log(`    ${key}: views=[${Array.from(views).join(", ")}]`);
  });
}
