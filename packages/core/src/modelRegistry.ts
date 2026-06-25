import type { PipelineSection } from "./types";

export const FREE_MODEL_ROSTER_URL = "https://openrouter.ai/api/v1/models";

/** Default OpenRouter free-model fallback chains per pipeline section. */
export const DEFAULT_MODEL_CHAINS: Record<PipelineSection, string[]> = {
  classify: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "google/gemma-4-31b-it:free",
  ],
  score: [
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
  ],
  research: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "google/gemma-4-31b-it:free",
  ],
  draft: [
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "openai/gpt-oss-20b:free",
  ],
};

export const PIPELINE_SECTIONS: PipelineSection[] = [
  "classify",
  "score",
  "research",
  "draft",
];

export function defaultChainFor(section: PipelineSection): string[] {
  return [...DEFAULT_MODEL_CHAINS[section]];
}

export function filterFreeModels(
  rosterIds: string[],
  chain: string[]
): string[] {
  const freeSet = new Set(rosterIds.filter((id) => id.includes(":free")));
  const validated = chain.filter((m) => freeSet.has(m));
  return validated.length > 0 ? validated : chain;
}
