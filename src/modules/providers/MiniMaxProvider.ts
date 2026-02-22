/**
 * MiniMaxProvider - MiniMax API implementation
 * Extends AnthropicProvider as MiniMax supports Anthropic-compatible API
 * Supports both domestic (China) and international endpoints
 */

import { AnthropicProvider } from "./AnthropicProvider";
import type { ApiKeyProviderConfig, ModelInfo } from "../../types/provider";

const MINIMAX_DEFAULT_MODELS: ModelInfo[] = [
  {
    modelId: "MiniMax-M2.5",
    nickname: "M2.5",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2.5-highspeed",
    nickname: "M2.5 Highspeed",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2.1",
    nickname: "M2.1",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2.1-highspeed",
    nickname: "M2.1 Highspeed",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "MiniMax-M2",
    nickname: "M2",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning", "tool_use"],
  },
  {
    modelId: "M2-her",
    nickname: "M2-her",
    contextWindow: 200000,
    maxOutput: 128000,
    capabilities: ["reasoning"],
  },
];

export class MiniMaxProvider extends AnthropicProvider {
  constructor(config: ApiKeyProviderConfig) {
    const configWithModels: ApiKeyProviderConfig = {
      ...config,
      models: config.models?.length ? config.models : MINIMAX_DEFAULT_MODELS,
      availableModels:
        config.availableModels?.length > 0
          ? config.availableModels
          : MINIMAX_DEFAULT_MODELS.map((m) => m.modelId),
    };
    super(configWithModels);
  }

  async getAvailableModels(): Promise<string[]> {
    if (
      this._config.availableModels &&
      this._config.availableModels.length > 0
    ) {
      return this._config.availableModels;
    }
    return MINIMAX_DEFAULT_MODELS.map((m) => m.modelId);
  }
}

export { MINIMAX_DEFAULT_MODELS };
