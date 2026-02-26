import { config } from "../../package.json";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];

const PREFS_PREFIX = config.prefsPrefix;

/**
 * Get preference value.
 * Wrapper of `Zotero.Prefs.get`.
 * @param key
 */
export function getPref<K extends keyof PluginPrefsMap>(key: K) {
  return Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true) as PluginPrefsMap[K];
}

/**
 * Set preference value.
 * Wrapper of `Zotero.Prefs.set`.
 * @param key
 * @param value
 */
export function setPref<K extends keyof PluginPrefsMap>(
  key: K,
  value: PluginPrefsMap[K],
) {
  return Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref(key: string) {
  return Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
}

/**
 * Get Claude thinking effort preference (bypasses strict typing)
 */
export function getClaudeThinkingEffort(): string {
  return (
    (Zotero.Prefs.get(
      `${PREFS_PREFIX}.claudeThinkingEffort`,
      true,
    ) as string) || "none"
  );
}

/**
 * Set Claude thinking effort preference (bypasses strict typing)
 */
export function setClaudeThinkingEffort(value: string): void {
  Zotero.Prefs.set(`${PREFS_PREFIX}.claudeThinkingEffort`, value, true);
}

/**
 * Get Gemini thinking effort preference (bypasses strict typing)
 */
export function getGeminiThinkingEffort(): string {
  return (
    (Zotero.Prefs.get(
      `${PREFS_PREFIX}.geminiThinkingEffort`,
      true,
    ) as string) || "none"
  );
}

/**
 * Set Gemini thinking effort preference (bypasses strict typing)
 */
export function setGeminiThinkingEffort(value: string): void {
  Zotero.Prefs.set(`${PREFS_PREFIX}.geminiThinkingEffort`, value, true);
}
