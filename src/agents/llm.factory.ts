import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { RunnableInterface } from '@langchain/core/runnables';
import { env, type LlmProvider } from '../config/env';
import { createOpenAILlm } from './providers/openai.provider';
import { createGeminiLlm } from './providers/gemini.provider';
import { createGroqLlm } from './providers/groq.provider';

// ─── Tool-bindable LLM type ───────────────────────────────────────────────────

/**
 * All three providers (OpenAI, Gemini, Groq) support tool calling.
 * We intersect BaseChatModel with a concrete bindTools signature so TypeScript
 * knows the method is always present — no "possibly undefined" errors.
 */
export type ToolCapableLlm = BaseChatModel & {
  bindTools(
    tools: StructuredToolInterface[],
    kwargs?: Record<string, unknown>,
  ): RunnableInterface;
};

// ─── Provider registry ────────────────────────────────────────────────────────

type ProviderFactory = () => ToolCapableLlm;

const PROVIDER_REGISTRY: Record<LlmProvider, ProviderFactory> = {
  openai: createOpenAILlm,
  gemini: createGeminiLlm,
  groq: createGroqLlm,
};

// ─── Singleton LLM instance ───────────────────────────────────────────────────

let _llmInstance: ToolCapableLlm | null = null;

/**
 * Returns the LLM instance for the active provider (singleton).
 * Provider is resolved once at startup from `LLM_PROVIDER` env var.
 * No overhead on repeated calls — same object every time.
 */
export function getLlm(): ToolCapableLlm {
  if (_llmInstance) return _llmInstance;

  const provider = env.LLM_PROVIDER;
  const factory = PROVIDER_REGISTRY[provider];

  if (!factory) {
    // Belt-and-suspenders — env validation already caught this at startup.
    throw new Error(
      `Unknown LLM provider: "${provider}". Valid options: ${Object.keys(PROVIDER_REGISTRY).join(', ')}`,
    );
  }

  console.log(`🤖  LLM Provider → ${provider.toUpperCase()}`);
  _llmInstance = factory();
  return _llmInstance;
}

/**
 * Returns the human-readable name of the active provider + model,
 * useful for health-check endpoints.
 */
export function getLlmProviderInfo(): { provider: LlmProvider; model: string } {
  const providerModelMap: Record<LlmProvider, string> = {
    openai: env.OPENAI_MODEL,
    gemini: env.GEMINI_MODEL,
    groq: env.GROQ_MODEL,
  };

  return {
    provider: env.LLM_PROVIDER,
    model: providerModelMap[env.LLM_PROVIDER],
  };
}

/** Clears the singleton — useful in tests between test cases. */
export function resetLlmInstance(): void {
  _llmInstance = null;
}
