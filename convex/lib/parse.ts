import type { ContextCard, DraftVariant, Intent as CoreIntent } from "@zitrion/core";
import { INTENT_LABELS } from "@zitrion/core";

export interface ClassifyOutput {
  intent: CoreIntent;
  relevance: number;
  reason: string;
}

export interface ScoreOutput {
  score: number;
  reasons: string[];
}

export type DraftOutput =
  | { skip: true; reason: string }
  | { skip: false; variants: DraftVariant[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function parseClassifyOutput(value: unknown): ClassifyOutput | null {
  if (!isRecord(value)) return null;
  const intent = value.intent;
  if (typeof intent !== "string" || !INTENT_LABELS.includes(intent as CoreIntent)) {
    return null;
  }
  const relevanceRaw = value.relevance;
  const relevance =
    typeof relevanceRaw === "number" ? Math.max(0, Math.min(1, relevanceRaw)) : 0;
  const reason = typeof value.reason === "string" ? value.reason : "";
  return { intent: intent as CoreIntent, relevance, reason };
}

export function parseScoreOutput(value: unknown): ScoreOutput | null {
  if (!isRecord(value)) return null;
  const score = value.score;
  if (typeof score !== "number") return null;
  return { score, reasons: asStringArray(value.reasons) };
}

export function parseContextCard(value: unknown): ContextCard | null {
  if (!isRecord(value)) return null;
  const summary = value.summary;
  if (typeof summary !== "string" || summary.trim().length === 0) return null;

  const card: ContextCard = {
    summary,
    highlights: asStringArray(value.highlights),
  };

  if (isRecord(value.profile)) {
    const p = value.profile;
    card.profile = {
      karma: typeof p.karma === "number" ? p.karma : undefined,
      accountAgeDays:
        typeof p.accountAgeDays === "number" ? p.accountAgeDays : undefined,
      bio: typeof p.bio === "string" ? p.bio : undefined,
      activeSubreddits: asStringArray(p.activeSubreddits),
    };
  }

  const businessSignals = asStringArray(value.businessSignals);
  if (businessSignals.length > 0) card.businessSignals = businessSignals;

  return card;
}

export function parseDraftOutput(value: unknown): DraftOutput | null {
  if (!isRecord(value)) return null;

  if (value.skip === true) {
    const reason =
      typeof value.reason === "string" ? value.reason : "no specific context";
    return { skip: true, reason };
  }

  if (Array.isArray(value.variants)) {
    const variants: DraftVariant[] = [];
    for (const variant of value.variants) {
      if (
        isRecord(variant) &&
        typeof variant.body === "string" &&
        variant.body.trim().length > 0
      ) {
        variants.push({ body: variant.body });
      }
    }
    if (variants.length === 0) return null;
    return { skip: false, variants };
  }

  return null;
}
