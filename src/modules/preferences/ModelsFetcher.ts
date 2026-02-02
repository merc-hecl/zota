/**
 * ModelsFetcher - Fetch models and ratios from Zota API
 */

import { getPref } from "../../utils/prefs";

/**
 * Format model label
 * @param model Model ID
 * @returns Model ID as label
 */
export function formatModelLabel(model: string): string {
  return model;
}

/**
 * Load cached data
 */
export function loadCachedRatios(): void {
  // No caching needed for non-zota providers
  ztoolkit.log("[Preferences] loadCachedRatios called");
}
