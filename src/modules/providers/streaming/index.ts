/**
 * zota's own streaming transport for the five API kinds zota supports.
 *
 * The adapters mirror the wire behavior of pi-ai's API adapters (payload
 * shapes, per-vendor thinking parameter formats, SSE event parsing) but run
 * on plain fetch, so no third-party SDK code executes inside Zotero's
 * privileged scope (where host globals like `console` are missing).
 */

import type { ChatMessage } from "../../../types/chat";
import { streamAnthropicMessages } from "./anthropicMessages";
import { streamGoogleGenerativeAI } from "./googleGenerativeAi";
import { streamMistralConversations } from "./mistralConversations";
import { streamOpenAICompletions } from "./openaiCompletions";
import { streamOpenAIResponses } from "./openaiResponses";

/** A fully-prepared streaming request, API-kind agnostic. */
export interface StreamRequest {
  /** Normalized base URL (version path handling is per API kind). */
  baseUrl: string;
  apiKey: string;
  modelId: string;
  systemPrompt: string;
  /** Pre-filtered chat history (no error/empty/system messages). */
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/** Unified thinking control, resolved per API kind by PiAIProvider. */
export interface ThinkingControl {
  enabled: boolean;
  /** Reasoning effort level (e.g. "medium"/"high"); adapters apply defaults. */
  effort?: string;
  /** Explicit token budget (Gemini). */
  budgetTokens?: number;
}

/** Catalog metadata an adapter needs to shape its request. */
export interface AdapterModel {
  id: string;
  provider: string;
  reasoning: boolean;
  input: string[];
  maxTokens: number;
  thinkingLevelMap?: Record<string, string | null>;
  compat?: Record<string, unknown>;
}

/** Streaming event sink used by every adapter. */
export interface StreamEventSink {
  onText: (delta: string) => void;
  onThinking: (delta: string) => void;
}

export type StreamAdapter = (
  request: StreamRequest,
  model: AdapterModel,
  thinking: ThinkingControl,
  events: StreamEventSink,
) => Promise<string>;

export function resolveStreamAdapter(apiKind: string): StreamAdapter {
  switch (apiKind) {
    case "anthropic-messages":
      return streamAnthropicMessages;
    case "google-generative-ai":
      return streamGoogleGenerativeAI;
    case "mistral-conversations":
      return streamMistralConversations;
    case "openai-responses":
      return streamOpenAIResponses;
    default:
      return streamOpenAICompletions;
  }
}
