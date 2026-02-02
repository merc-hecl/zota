/**
 * Preferences utility functions
 */

import { prefColors } from "../../utils/colors";

/**
 * Clear all children from an element
 */
export function clearElement(element: Element | null): void {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Show test result message in API key panel
 */
export function showTestResult(
  doc: Document,
  message: string,
  isError: boolean,
): void {
  const resultEl = doc.getElementById("pref-test-result") as HTMLElement | null;
  if (resultEl) {
    resultEl.textContent = message;
    resultEl.style.color = isError
      ? prefColors.testError
      : prefColors.testSuccess;
  }
}
