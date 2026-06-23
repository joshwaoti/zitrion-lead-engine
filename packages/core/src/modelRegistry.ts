import type { PipelineSection } from "./types";

export const FREE_MODEL_ROSTER_URL = "https://openrouter.ai/api/v1/models";

/** Default OpenRouter free-model fallback chains per pipeline section. */
export const DEFAULT_MODEL_CHAINS: Record<PipelineSection, string[]> = {
  classify: [
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/mistral-small-24b-instruct-2501:free",
  ],
  score: [
    "deepseek/deepseek-chat-v3-0324:free",
    "qwen/qwen3-235b-a22b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
  ],
  research: [
    "meta-llama/llama-4-maverick:free",
    "google/gemini-2.0-flash-exp:free",
    "qwen/qwen3-235b-a22b:free",
  ],
  draft: [
    "deepseek/deepseek-r1:free",
    "qwen/qwen3-235b-a22b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
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
