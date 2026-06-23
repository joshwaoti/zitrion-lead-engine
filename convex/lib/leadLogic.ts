import type { Intent as CoreIntent, Platform } from "@zitrion/core";

/** Dashboard-aligned intent labels stored in Convex. */
export type DashboardIntent =
  | "active_buying"
  | "problem_statement"
  | "competitor_mention"
  | "flagged"
  | "irrelevant";

const PROMOTABLE_CORE: ReadonlySet<CoreIntent> = new Set<CoreIntent>([
  "active_buying_intent",
  "problem_statement",
  "competitor_mention",
]);

export function isPromotableCoreIntent(intent: CoreIntent): boolean {
  return PROMOTABLE_CORE.has(intent);
}

export function mapCoreIntentToDashboard(intent: CoreIntent): DashboardIntent {
  switch (intent) {
    case "active_buying_intent":
      return "active_buying";
    case "problem_statement":
      return "problem_statement";
    case "competitor_mention":
      return "competitor_mention";
    case "general_discussion":
      return "flagged";
    case "irrelevant":
      return "irrelevant";
  }
}

export function clampScore(raw: number): number {
  if (Number.isNaN(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function buildSourceDedupeKey(platform: Platform, sourceId: string): string {
  return `${platform}:${sourceId.trim().toLowerCase()}`;
}

export function profileUrlFor(platform: Platform, handle: string): string {
  const normalized = handle.replace(/^u\//, "");
  switch (platform) {
    case "reddit":
      return `https://www.reddit.com/user/${normalized}`;
    case "instagram":
      return `https://www.instagram.com/${normalized}`;
    default:
      return handle;
  }
}

export function mapDashboardIntentToCore(intent: DashboardIntent): CoreIntent {
  switch (intent) {
    case "active_buying": return "active_buying_intent";
    case "problem_statement": return "problem_statement";
    case "competitor_mention": return "competitor_mention";
    case "flagged": return "general_discussion";
    case "irrelevant": return "irrelevant";
  }
}

export function contextCardToString(summary: string, highlights: string[]): string {
  if (highlights.length === 0) return summary;
  return `${summary}\n\nHighlights:\n- ${highlights.join("\n- ")}`;
}

export function contextCardJson(card: {
  summary: string;
  highlights: string[];
  profile?: { karma?: number; accountAgeDays?: number; bio?: string; activeSubreddits?: string[] };
  businessSignals?: string[];
}): string {
  return JSON.stringify(card);
}
