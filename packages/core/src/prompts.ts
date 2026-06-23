import type { ContextCard, DraftGoal, Intent } from "./types";

/**
 * Prompt templates for the four AI pipeline sections. Each builder returns a
 * `{ system, user }` pair; the model gateway wraps them into OpenRouter chat
 * messages and requests JSON output. Output schemas are documented inline so
 * the gateway/pipeline can validate the parsed JSON.
 */

export interface PromptMessages {
  system: string;
  user: string;
}

/** The intent labels the classifier is allowed to emit. */
export const INTENT_LABELS: Intent[] = [
  "active_buying_intent",
  "problem_statement",
  "competitor_mention",
  "general_discussion",
  "irrelevant",
];

/** Workspace voice/positioning context injected into prompts. */
export interface VoiceContext {
  /** Who the operator writes as, e.g. "Josh, founder of Zitrion". */
  persona: string;
  /** Free-form voice guide: direct, helpful-first, no salesy filler. */
  voiceGuide: string;
  /** Service catalog / positioning summary. */
  serviceCatalog: string;
}

const DEFAULT_VOICE: VoiceContext = {
  persona: "the founder of Zitrion (premium web + SaaS builds, Nairobi)",
  voiceGuide:
    "Direct, helpful-first, concrete. No salesy filler, no hype words, no emojis unless the thread uses them. Sound like a sharp peer, not a marketer.",
  serviceCatalog:
    "Zitrion builds premium websites and custom SaaS products: marketing sites, web apps, booking/management systems, and AI-powered tools.",
};

// -----------------------------------------------------------------------------
// 1. Classify
// -----------------------------------------------------------------------------

export interface ClassifyInput {
  platform: string;
  sourceUrl: string;
  text: string;
  matchedRule?: string;
}

/**
 * Output JSON shape:
 *   { "intent": Intent, "relevance": number 0..1, "reason": string }
 */
export function buildClassifyPrompt(input: ClassifyInput): PromptMessages {
  const system = [
    "You are a precise lead-intent classifier for a web/SaaS agency.",
    "Read one social post/comment and label the author's intent.",
    `Allowed intent values (use exactly one): ${INTENT_LABELS.join(", ")}.`,
    "Definitions:",
    "- active_buying_intent: explicitly wants/looking to hire or buy a website/app/SaaS now.",
    "- problem_statement: describes a pain a website/SaaS could solve, not yet shopping.",
    "- competitor_mention: discussing an agency/tool/competitor in the space.",
    "- general_discussion: on-topic chatter, no buying signal.",
    "- irrelevant: unrelated to web/SaaS buying.",
    'Respond with ONLY minified JSON: {"intent": <label>, "relevance": <0..1>, "reason": <short string>}.',
  ].join("\n");

  const user = [
    `PLATFORM: ${input.platform}`,
    input.matchedRule ? `MATCHED RULE: ${input.matchedRule}` : "",
    `SOURCE: ${input.sourceUrl}`,
    "ITEM:",
    input.text,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

// -----------------------------------------------------------------------------
// 2. Score
// -----------------------------------------------------------------------------

export interface ScoreInput {
  intent: Intent;
  text: string;
  profileSummary?: string;
  serviceCatalog?: string;
}

/**
 * Output JSON shape:
 *   { "score": number 0..100, "reasons": string[] }
 */
export function buildScorePrompt(
  input: ScoreInput,
  voice: Partial<VoiceContext> = {},
): PromptMessages {
  const catalog = input.serviceCatalog ?? voice.serviceCatalog ?? DEFAULT_VOICE.serviceCatalog;
  const system = [
    "You score how good a sales lead is for a premium web/SaaS agency, 0-100.",
    "Weigh: intent strength, fit to the services, recency/urgency, decision-maker signals (business owner), and likely visibility of a reply.",
    `SERVICES: ${catalog}`,
    "Be conservative: generic or low-fit leads should score below 40.",
    'Respond with ONLY minified JSON: {"score": <0..100 integer>, "reasons": [<short strings>]}.',
  ].join("\n");

  const user = [
    `INTENT: ${input.intent}`,
    input.profileSummary ? `AUTHOR: ${input.profileSummary}` : "",
    "ITEM:",
    input.text,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

// -----------------------------------------------------------------------------
// 3. Research synthesis
// -----------------------------------------------------------------------------

export interface ResearchInput {
  handle: string;
  platform: string;
  threadText: string;
  profile?: {
    karma?: number;
    accountAgeDays?: number;
    bio?: string;
    activeSubreddits?: string[];
    recentItems?: string[];
  };
}

/**
 * Output JSON shape (a {@link ContextCard}):
 *   {
 *     "summary": string,
 *     "highlights": string[],
 *     "profile"?: { karma?, accountAgeDays?, bio?, activeSubreddits?: string[] },
 *     "businessSignals"?: string[]
 *   }
 */
export function buildResearchPrompt(input: ResearchInput): PromptMessages {
  const system = [
    "You are a research analyst building a tight, factual context card about one person",
    "so a reply can be specifically grounded in their actual situation.",
    "Only use the supplied facts - do NOT invent details. If a field is unknown, omit it.",
    "highlights must be concrete, quotable hooks a reply could reference.",
    'Respond with ONLY minified JSON: {"summary": string, "highlights": [strings], "profile"?: {"karma"?: number, "accountAgeDays"?: number, "bio"?: string, "activeSubreddits"?: [strings]}, "businessSignals"?: [strings]}.',
  ].join("\n");

  const profile = input.profile ?? {};
  const user = [
    `HANDLE: ${input.handle} (${input.platform})`,
    profile.karma !== undefined ? `KARMA: ${profile.karma}` : "",
    profile.accountAgeDays !== undefined ? `ACCOUNT AGE (days): ${profile.accountAgeDays}` : "",
    profile.bio ? `BIO: ${profile.bio}` : "",
    profile.activeSubreddits?.length ? `ACTIVE IN: ${profile.activeSubreddits.join(", ")}` : "",
    profile.recentItems?.length ? `RECENT ACTIVITY:\n- ${profile.recentItems.join("\n- ")}` : "",
    "THREAD BEING REPLIED TO:",
    input.threadText,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

// -----------------------------------------------------------------------------
// 4. Draft (with the PRD skip escape hatch)
// -----------------------------------------------------------------------------

export interface DraftInput {
  /** "comment" (public reply) or "dm" (chat first-message). */
  type: "comment" | "dm";
  goal: DraftGoal;
  threadText: string;
  contextCard: ContextCard;
  voice?: Partial<VoiceContext>;
  /** How many variants to produce (1-2). */
  variants?: number;
}

const GOAL_GUIDANCE: Record<DraftGoal, string> = {
  help_first: "Lead with genuine help/insight. Pitch is absent or a single soft line at the end.",
  soft_pitch: "Lead with value, then a light, natural mention that you build this kind of thing.",
  direct_pitch: "Be helpful first, then make a clear but non-pushy offer to help build it.",
};

/**
 * Implements the PRD §10 draft prompt skeleton, including the anti-generic
 * `{"skip": true, "reason": "..."}` escape hatch.
 *
 * Output JSON shape (one of):
 *   { "variants": [ { "body": string } ] }
 *   { "skip": true, "reason": string }
 */
export function buildDraftPrompt(input: DraftInput): PromptMessages {
  const voice: VoiceContext = {
    persona: input.voice?.persona ?? DEFAULT_VOICE.persona,
    voiceGuide: input.voice?.voiceGuide ?? DEFAULT_VOICE.voiceGuide,
    serviceCatalog: input.voice?.serviceCatalog ?? DEFAULT_VOICE.serviceCatalog,
  };
  const variantCount = Math.min(Math.max(input.variants ?? 2, 1), 2);
  const surface =
    input.type === "comment" ? "a public comment reply on the thread" : "a chat / DM first-message";

  const system = [
    `ROLE: You write as ${voice.persona}.`,
    `VOICE: ${voice.voiceGuide}`,
    `SERVICES: ${voice.serviceCatalog}`,
    `GOAL: ${GOAL_GUIDANCE[input.goal]}`,
    `You are writing ${surface}.`,
    "HARD RULES:",
    "- Reference >=1 concrete specific from their context card.",
    "- Lead with value or genuine relevance; the pitch is secondary or absent.",
    "- Sound human and specific; never generic or templated.",
    '- If you cannot be specific, return {"skip": true, "reason": "..."}.',
    `OUTPUT: ONLY minified JSON, one of:`,
    `  {"variants": [${variantCount === 2 ? '{"body": "..."}, {"body": "..."}' : '{"body": "..."}'}]}`,
    `  {"skip": true, "reason": "..."}`,
  ].join("\n");

  const card = input.contextCard;
  const user = [
    "CONTEXT CARD:",
    card.summary,
    card.highlights.length ? `HIGHLIGHTS:\n- ${card.highlights.join("\n- ")}` : "",
    card.businessSignals?.length ? `BUSINESS SIGNALS:\n- ${card.businessSignals.join("\n- ")}` : "",
    "THREAD:",
    input.threadText,
    `Produce ${variantCount} variant(s).`,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}
