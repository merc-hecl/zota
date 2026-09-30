/**
 * PiAICatalog - Built-in provider catalog generated from pi-ai at runtime.
 *
 * zota's built-in provider list IS pi-ai's catalog: names, base URLs, API
 * kinds, per-model metadata (compat settings, context windows, static model
 * lists) are all read from pi-ai at runtime instead of being hardcoded.
 * Only vendors that work with a plain API key are surfaced; vendors that
 * require OAuth, cloud IAM or gateway-style auth are skipped.
 */

import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import type {
  ModelInfo,
  ProviderMetadata,
  ProviderType,
} from "../../types/provider";

/**
 * Legacy zota provider ids (from before the catalog unification) mapped to
 * pi-ai catalog ids, used to migrate stored provider configs.
 */
export const MIGRATED_ID_BY_OLD_ID: Record<string, string> = {
  claude: "anthropic",
  gemini: "google",
  glm: "zai",
  kimi: "moonshotai",
};

/**
 * Console websites for the common vendors (pi-ai's catalog carries no
 * website field, so the "visit website" button uses this fallback map).
 */
const WEBSITE_BY_CATALOG_ID: Record<string, string> = {
  openai: "https://platform.openai.com",
  anthropic: "https://console.anthropic.com",
  google: "https://ai.google.dev",
  deepseek: "https://platform.deepseek.com",
  mistral: "https://console.mistral.ai",
  groq: "https://console.groq.com",
  openrouter: "https://openrouter.ai",
  moonshotai: "https://platform.moonshot.ai",
  "moonshotai-cn": "https://platform.moonshot.cn",
  zai: "https://chat.z.ai",
  minimax: "https://platform.minimax.io",
  "minimax-cn": "https://platform.minimaxi.com",
  xai: "https://docs.x.ai",
  meta: "https://llama.developer.meta.com",
};

/**
 * pi-ai providers that are not usable as plain API-key chat vendors:
 * test stubs, auth/stream helpers, subscription plan variants, OAuth-only
 * vendors, cloud IAM vendors and gateways.
 */
const EXCLUDED_CATALOG_IDS = new Set([
  "faux",
  "radius",
  "radius-config",
  "opencode",
  "opencode-go",
  "opencode-headers",
  "cloudflare-auth",
  "cloudflare-stream",
  "cloudflare-ai-gateway",
  "cloudflare-workers-ai",
  "qwen-token-plan",
  "qwen-token-plan-cn",
  "qwen-token-plan-individual",
  "xiaomi-token-plan-ams",
  "xiaomi-token-plan-cn",
  "xiaomi-token-plan-sgp",
  "openrouter-images",
  "openai-codex",
  "kimi-coding",
  "zai-coding-cn",
  "github-copilot",
  "amazon-bedrock",
  "google-vertex",
  "azure-openai-responses",
  "vercel-ai-gateway",
]);

/** API kinds that zota's PiAIProvider can route to. */
const SUPPORTED_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "mistral-conversations",
]);

function providerTypeFromApi(api: string): ProviderType {
  if (api === "anthropic-messages") return "anthropic-compatible";
  if (api === "google-generative-ai") return "gemini";
  if (api === "openai-responses") return "openai-responses";
  if (api === "mistral-conversations") return "mistral-conversations";
  return "openai-compatible";
}

/**
 * Structural view of a pi-ai catalog model. Kept loose so the union of
 * per-API model types can flow through without generic gymnastics.
 */
export interface CatalogModel {
  id: string;
  name: string;
  api: string;
  baseUrl?: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
  thinkingLevelMap?: Record<string, string | null>;
  compat?: Record<string, unknown>;
}

interface CatalogProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
  models: CatalogModel[];
}

let cachedEntries: CatalogProviderEntry[] | null = null;

function getCatalogEntries(): CatalogProviderEntry[] {
  if (cachedEntries) return cachedEntries;

  const entries: CatalogProviderEntry[] = [];
  try {
    for (const provider of builtinProviders()) {
      if (EXCLUDED_CATALOG_IDS.has(provider.id)) continue;

      const models = (provider.getModels() as unknown as CatalogModel[]).filter(
        (m) => SUPPORTED_APIS.has(m.api),
      );
      if (!models.length) continue;

      entries.push({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl || "",
        models,
      });
    }
  } catch (e) {
    ztoolkit.log("[PiAICatalog] Failed to read pi-ai catalog:", e);
  }

  cachedEntries = entries;
  return entries;
}

/** Map pi-ai model entries to zota ModelInfo (display name + capabilities). */
function toModelInfos(models: CatalogModel[]): ModelInfo[] {
  return models.map((m) => {
    const capabilities: ModelInfo["capabilities"] = [];
    if (m.reasoning) capabilities.push("reasoning");
    if (m.input.includes("image")) capabilities.push("vision");
    return {
      modelId: m.id,
      nickname: m.name,
      capabilities,
    };
  });
}

/**
 * All built-in providers, generated from pi-ai's runtime catalog
 * (alphabetical by display name).
 */
export function getCatalogProviders(): ProviderMetadata[] {
  const results: ProviderMetadata[] = getCatalogEntries().map((entry) => {
    // Pick the preferred API: openai-completions when available (the most
    // widely compatible path), otherwise the vendor's single API kind.
    const preferred =
      entry.models.find((m) => m.api === "openai-completions") ||
      entry.models[0];

    const models = entry.models.filter((m) => m.api === preferred.api);

    return {
      id: entry.id,
      name: entry.name,
      defaultBaseUrl: entry.baseUrl,
      website: WEBSITE_BY_CATALOG_ID[entry.id] || "",
      type: providerTypeFromApi(preferred.api),
      availableModels: models.map((m) => m.id),
      models: toModelInfos(models),
    };
  });

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/** All supported catalog models of a provider (empty for unknown ids). */
export function getCatalogModels(providerId: string): CatalogModel[] {
  return getCatalogEntries().find((e) => e.id === providerId)?.models || [];
}

/** Exact model lookup within a provider's catalog (null when unknown). */
export function findCatalogModel(
  providerId: string,
  modelId: string,
): CatalogModel | null {
  return (
    getCatalogModels(providerId).find((m) => m.id === modelId) || null
  );
}
