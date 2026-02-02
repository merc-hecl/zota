/**
 * InputStateManager - Manages input state synchronization between sidebar and floating views
 * Also handles input history for up-arrow recall
 */

// Global input text state shared between sidebar and floating views
let globalInputText = "";

// Input history for up-arrow recall - only keep the last input
let lastInput: string | null = null;

// Track if user has already recalled the last input
let hasRecalledLastInput = false;

/**
 * Get the current global input text
 */
export function getGlobalInputText(): string {
  return globalInputText;
}

/**
 * Set the global input text
 */
export function setGlobalInputText(text: string): void {
  globalInputText = text;
}

/**
 * Add a message to input history
 * Called when a message is successfully sent
 * Only keeps the last input
 */
export function addToInputHistory(text: string): void {
  if (!text || !text.trim()) return;

  const trimmedText = text.trim();

  // Don't add if same as current last input
  if (lastInput === trimmedText) {
    return;
  }

  // Store as last input
  lastInput = trimmedText;

  // Reset recall state
  hasRecalledLastInput = false;
}

/**
 * Get the last input from history
 */
export function getLastInput(): string | null {
  return lastInput;
}

/**
 * Navigate through history on up arrow
 * Returns the last input to display, or null if no history or already recalled
 */
export function navigateHistoryUp(_currentText: string): string | null {
  // Only allow recall once per focus/session
  if (hasRecalledLastInput) {
    return null;
  }

  if (lastInput === null) {
    return null;
  }

  hasRecalledLastInput = true;
  return lastInput;
}

/**
 * Navigate through history on down arrow
 * For single-item history, this clears the recalled text
 */
export function navigateHistoryDown(): string | null {
  // With single-item history, down arrow clears the input
  if (hasRecalledLastInput) {
    hasRecalledLastInput = false;
    return "";
  }
  return null;
}

/**
 * Reset history navigation state
 * Call this when input is focused or when message is sent
 */
export function resetHistoryNavigation(): void {
  hasRecalledLastInput = false;
}
