/**
 * Shared domain types for the Zitrion Social Lead Engine.
 *
 * These string-literal unions are the single source of truth for the values
 * used across the Convex schema, the dashboard, the extension, and the worker.
 * The Convex `schema.ts` mirrors them as `v.union(v.literal(...))` validators;
 * keep the two in sync.
 */

/** Platforms the engine can operate on. Reddit ships first; Instagram is phase 2. */
export type Platform = "reddit" | "instagram";

/** Authenticated-session health for a connected account. */
export type SessionStatus = "connected" | "disconnected" | "needs_verification";

/** What a watch rule matches on. */
export type WatchRuleKind = "subreddit" | "keyword";

/** Whether a raw scraped item is a post or a comment. */
export type CandidateKind = "post" | "comment";

/** Lifecycle of a raw candidate as it moves through classification. */
export type CandidateStatus = "new" | "processing" | "promoted" | "skipped";

/**
 * Intent labels produced by the classify pass (PRD §4.1).
 * Only the top buckets get promoted to leads.
 */
export type Intent =
  | "active_buying_intent"
  | "problem_statement"
  | "competitor_mention"
  | "general_discussion"
  | "irrelevant";

/** Pipeline / CRM stage for a lead (PRD §4.7 + review-queue states). */
export type LeadStatus =
  | "new"
  | "queued"
  | "contacted"
  | "replied"
  | "in_conversation"
  | "qualified"
  | "won"
  | "lost"
  | "snoozed"
  | "dismissed";

/** Outbound draft / action surface. */
export type OutboundType = "comment" | "dm";

/** Alias used by extension + executor modules. */
export type ActionType = OutboundType;

/** Raw candidate pushed from extension discovery into Convex `extension:ingestCandidate`. */
export type RawCandidate = {
  platform: Platform;
  handle: string;
  subreddit: string;
  snippet: string;
  postBody: string;
  url: string;
  profileHints?: string;
  postedAt: number;
  sourceId: string;
};

/** Instagram Phase 2 — lightweight commenter profile from post scrape. */
export type CommenterProfile = {
  handle: string;
  profileUrl: string;
  commentSnippet?: string;
  /** Display name shown next to the handle, when available. */
  fullName?: string;
};

/**
 * Deep profile enrichment gathered by visiting an Instagram profile page.
 * Feeds the research/draft pipeline so DMs can be grounded in real specifics.
 */
export type InstagramProfileInsight = {
  handle: string;
  profileUrl: string;
  fullName?: string;
  bio?: string;
  externalUrl?: string;
  category?: string;
  isVerified?: boolean;
  isPrivate?: boolean;
  postCount?: number;
  followerCount?: number;
  followingCount?: number;
  /** Captions / alt-text of the most recent posts, for grounding. */
  recentPosts?: string[];
};

/** How an Instagram scrape sources its leads. */
export type InstagramScrapeMode = "commenters" | "followers";

/** A scrape request issued from the extension popup. */
export type InstagramScrapeRequest = {
  mode: InstagramScrapeMode;
  /** How many leads to collect/enrich. */
  count: number;
  /** Post URL (commenters) or profile URL (followers); defaults to active tab. */
  targetUrl?: string;
  /** Whether to visit each profile for deep enrichment (slower, richer). */
  enrich?: boolean;
};

/** Draft lifecycle. */
export type DraftStatus =
  | "pending"
  | "approved"
  | "edited"
  | "regenerating"
  | "sent"
  | "skipped"
  | "dismissed";

/** Action-queue lifecycle. The executor polls for `approved`. */
export type ActionStatus = "approved" | "pending" | "done" | "failed";

/** The tone/intent of an outbound draft. */
export type DraftGoal = "help_first" | "soft_pitch" | "direct" | "direct_pitch";

/** The four discrete AI pipeline sections, each with its own model fallback chain. */
export type PipelineSection = "classify" | "score" | "research" | "draft";

/** A synthesized, tight research context card attached to a lead (PRD §4.3). */
export interface ContextCard {
  /** One-paragraph synthesis used to ground drafting. */
  summary: string;
  /** Concrete, specific hooks a draft can reference (the anti-generic fuel). */
  highlights: string[];
  /** Lightly structured public profile facts, when available. */
  profile?: {
    karma?: number;
    accountAgeDays?: number;
    bio?: string;
    activeSubreddits?: string[];
  };
  /** Signals the person is a business owner / decision maker. */
  businessSignals?: string[];
}

/** A single generated draft variant. */
export interface DraftVariant {
  body: string;
}
