/**
 * XAIProvider - xAI API implementation
 * Extends OpenAIProvider as xAI supports OpenAI-compatible API
 * Provides access to Grok series models (grok-2, grok-3, grok-4)
 */

import { OpenAIProvider } from "./OpenAIProvider";

export class XAIProvider extends OpenAIProvider {
  // xAI inherits all OpenAI-compatible behavior
  // Models are fetched dynamically from the API
}
