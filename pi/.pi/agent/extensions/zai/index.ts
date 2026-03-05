/**
 * Custom ZAI Provider Extension
 *
 * Registers a custom provider for Z.AI GLM models with:
 * - Custom runtime settings (temperature, top_p, clear_thinking)
 * - Environment variable configuration support
 * - ZAI models (glm-4.6 through glm-5)
 * - Custom streamSimple wrapper that injects ZAI-specific parameters
 *
 * Usage:
 *   # First install dependencies
 *   cd packages/coding-agent/examples/extensions/zai && npm install
 *
 *   # Set your ZAI API key
 *   export ZAI_API_KEY=your_api_key_here
 *
 *   # Load the extension
 *   pi -e ./packages/coding-agent/examples/extensions/zai
 *
 *   # Select a ZAI model
 *   pi --provider zai --model glm-5
 *
 *   # Or use environment variables to control runtime behavior
 *   PI_ZAI_CUSTOM_TOP_P=0.8 pi -e ./extensions/zai
 */

import {
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type SimpleStreamOptions,
} from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { streamSimpleOpenAICompletions } from "@mariozechner/pi-ai";

// =============================================================================
// Constants
// =============================================================================

const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_TOP_P = 0.95;

// =============================================================================
// Types
// =============================================================================

export interface ZaiModelSettings {
  temperature: number;
  topP: number;
}

export interface ZaiRuntimeSettings {
  temperature: number;
  topP: number;
}

export interface ZaiSimpleOptions extends SimpleStreamOptions {
  temperature?: number;
  top_p?: number;
  topP?: number;
  [key: string]: unknown;
}

// =============================================================================
// Per-Model Settings Registry
// =============================================================================

/**
 * Per-model default settings for temperature and top_p.
 * These can be overridden by environment variables or options.
 */
const MODEL_DEFAULTS: Record<string, ZaiModelSettings> = {
  "glm-4.6": { temperature: 1.0, topP: 0.95 },
  "glm-4.6v": { temperature: 1.0, topP: 0.95 },
  "glm-4.7": { temperature: 0.9, topP: 0.95 },
  "glm-4.7-flash": { temperature: 1.0, topP: 0.95 },
  "glm-5": { temperature: 1.0, topP: 0.95 },
};

/**
 * Get model-specific default settings.
 * Falls back to global defaults if model not found.
 */
function getModelDefaults(modelId: string): ZaiModelSettings {
  return (
    MODEL_DEFAULTS[modelId] ?? {
      temperature: DEFAULT_TEMPERATURE,
      topP: DEFAULT_TOP_P,
    }
  );
}

// =============================================================================
// Runtime Settings Resolution
// =============================================================================

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

function resolveNumberKnob(
  defaultValue: number,
  envValue: string | undefined,
  ...optionValues: unknown[]
): number {
  return (
    firstDefined(
      parseOptionalNumber(envValue),
      ...optionValues.map((value) => parseOptionalNumber(value)),
    ) ?? defaultValue
  );
}

/**
 * Resolve ZAI runtime settings from environment and options.
 *
 * [tag:zai_custom_env_knob_contract]
 * Subagent frontmatter knobs are threaded into child processes via env vars:
 * - Generic temperature: PI_TEMPERATURE
 * - ZAI-specific knobs: PI_ZAI_CUSTOM_TOP_P
 * These are consumed here for per-role provider behavior.
 *
 * Priority (highest to lowest):
 * 1. Options passed directly to streamSimple (top_p, topP)
 * 2. Environment variables (PI_ZAI_CUSTOM_TOP_P)
 * 3. Environment variable PI_TEMPERATURE (generic temperature)
 * 4. Per-model defaults from MODEL_DEFAULTS
 * 5. Global defaults (1.0 for temperature, 0.95 for top_p)
 */
export function resolveZaiRuntimeSettings(
  modelId: string,
  env: Record<string, string | undefined> = process.env,
  options?: ZaiSimpleOptions,
): ZaiRuntimeSettings {
  const modelDefaults = getModelDefaults(modelId);

  // [ref:generic_temperature_env_contract] - Generic temperature from subagent
  const temperature = resolveNumberKnob(
    modelDefaults.temperature,
    env.PI_TEMPERATURE,
    options?.temperature,
  );
  // [ref:zai_custom_env_knob_contract] - ZAI-specific knobs
  const topP = resolveNumberKnob(
    modelDefaults.topP,
    env.PI_ZAI_CUSTOM_TOP_P,
    options?.top_p,
    options?.topP,
  );

  return {
    temperature,
    topP,
  };
}

/**
 * Apply ZAI-specific knobs to the API request payload.
 *
 * [tag:zai_custom_payload_knobs]
 * Every request must carry explicit sampling knobs so provider defaults
 * cannot silently change behavior across endpoints.
 *
 * ZAI-specific parameters:
 * - temperature: Sampling temperature (0.0 - 1.0+)
 * - top_p: Nucleus sampling threshold (0.0 - 1.0)
 * - tool_stream: Enable streaming of tool calls (always true for agentic workflow)
 * - clear_thinking: Whether to clear previous thinking context (always false for agentic workflow)
 * - enable_thinking: Set by base implementation based on reasoningEffort
 */
export function applyZaiPayloadKnobs(
  payload: unknown,
  runtime: ZaiRuntimeSettings,
): void {
  if (!payload || typeof payload !== "object") return;
  const request = payload as Record<string, unknown>;
  request.temperature = runtime.temperature;
  request.top_p = runtime.topP;
  // Always enable tool streaming for agentic workflow
  request.tool_stream = true;
  // Never clear thinking in agentic workflow - we want context persistence
  request.clear_thinking = false;
  // enable_thinking is set by the base streamSimpleOpenAICompletions based on reasoningEffort
}

// =============================================================================
// Custom Stream Implementation
// =============================================================================

/**
 * Wrapper around streamSimpleOpenAICompletions that injects ZAI-specific parameters.
 *
 * [ref:zai_custom_routed_api_key_precedence]
 * streamSimpleOpenAICompletions prioritizes options.apiKey over model.apiKey.
 * We ensure the routed API key is properly passed through.
 *
 * The wrapper:
 * 1. Resolves runtime settings from model defaults, env vars, and options
 * 2. Wraps the onPayload callback to inject ZAI parameters
 * 3. Delegates to the standard OpenAI completions implementation
 */
export function createZaiStreamSimple(
  baseStreamSimple: (
    model: Model<"openai-completions">,
    context: Context,
    options?: SimpleStreamOptions,
  ) => AssistantMessageEventStream,
  env: Record<string, string | undefined> = process.env,
): (
  model: Model<"openai-completions">,
  context: Context,
  options?: ZaiSimpleOptions,
) => AssistantMessageEventStream {
  return (model, context, options) => {
    const runtime = resolveZaiRuntimeSettings(model.id, env, options);
    const callerOnPayload = options?.onPayload;
    const wrappedOptions: ZaiSimpleOptions = {
      ...options,
      onPayload: (payload: unknown) => {
        callerOnPayload?.(payload);
        // [ref:zai_custom_payload_knobs]
        applyZaiPayloadKnobs(payload, runtime);
      },
    };
    return baseStreamSimple(model, context, wrappedOptions);
  };
}

// =============================================================================
// Model Definitions
// =============================================================================

/**
 * ZAI model definitions with 5 available models (glm-4.6 and newer).
 *
 * All models use:
 * - api: "openai-completions" (OpenAI-compatible API)
 * - compat: { supportsDeveloperRole: false, thinkingFormat: "zai" }
 * - baseUrl: https://api.z.ai/api/coding/paas/v4
 */
const ZAI_MODELS = [
  {
    id: "glm-4.6",
    name: "GLM-4.6",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    cost: {
      input: 0.6,
      output: 2.2,
      cacheRead: 0.11,
      cacheWrite: 0,
    },
    contextWindow: 204800,
    maxTokens: 131072,
  },
  {
    id: "glm-4.6v",
    name: "GLM-4.6V",
    reasoning: true,
    input: ["text", "image"] as ("text" | "image")[],
    cost: {
      input: 0.3,
      output: 0.9,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128000,
    maxTokens: 32768,
  },
  {
    id: "glm-4.7",
    name: "GLM-4.7",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    cost: {
      input: 0.6,
      output: 2.2,
      cacheRead: 0.11,
      cacheWrite: 0,
    },
    contextWindow: 204800,
    maxTokens: 131072,
  },
  {
    id: "glm-4.7-flash",
    name: "GLM-4.7-Flash",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 200000,
    maxTokens: 131072,
  },
  {
    id: "glm-5",
    name: "GLM-5",
    reasoning: true,
    input: ["text"] as ("text" | "image")[],
    cost: {
      input: 1,
      output: 3.2,
      cacheRead: 0.2,
      cacheWrite: 0,
    },
    contextWindow: 204800,
    maxTokens: 131072,
  },
];

// =============================================================================
// Extension Entry Point
// =============================================================================

export default function (pi: ExtensionAPI) {
  const zaiStreamSimple = createZaiStreamSimple(streamSimpleOpenAICompletions);

  pi.registerProvider("zai", {
    baseUrl: ZAI_BASE_URL,
    apiKey: "ZAI_API_KEY",
    api: "openai-completions",

    models: ZAI_MODELS.map((model) => ({
      ...model,
      compat: {
        supportsDeveloperRole: false,
        thinkingFormat: "zai" as const,
      },
    })),

    streamSimple: zaiStreamSimple,
  });
}
