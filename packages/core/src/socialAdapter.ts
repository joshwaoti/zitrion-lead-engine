import type { CandidateKind, OutboundType, Platform } from "./types";

/**
 * A raw, pre-classification item scraped from a platform by an executor
 * (extension content script or VPS Playwright worker). This is the shape pushed
 * into Convex via `candidates.ingestCandidate`.
 */
export interface ScrapedCandidate {
  platform: Platform;
  kind: CandidateKind;
  /** Stable platform user id (e.g. Reddit `t2_xxx`). */
  externalUserId: string;
  /** Public handle (e.g. Reddit username without `u/`). */
  handle: string;
  /** Canonical URL of the post/comment being considered. */
  sourceUrl: string;
  /** The post/comment text under consideration. */
  text: string;
  /** Which watch rule surfaced this item, if known. */
  matchedRule?: string;
  /** Lightly structured public profile, when the scraper can grab it cheaply. */
  profile?: ScrapedProfile;
}

export interface ScrapedProfile {
  karma?: number;
  accountAgeDays?: number;
  bio?: string;
  activeSubreddits?: string[];
  /** Recent posts/comments as plain strings, for research synthesis. */
  recentItems?: string[];
}

/** A request to perform one outbound action on the live session. */
export interface OutboundRequest {
  type: OutboundType;
  /** Thread/post URL for a comment, or the target profile/handle for a DM. */
  target: string;
  /** The exact text to post or send (already approved + edited by a human). */
  body: string;
}

/** The result of attempting an outbound action. */
export interface OutboundResult {
  ok: boolean;
  /** Permalink of the created comment / chat message when successful. */
  permalink?: string;
  /** Human-readable error when `ok` is false. */
  error?: string;
}

/**
 * Platform automation contract. `reddit` implements it first; `instagram`
 * slots in behind it (PRD §5/§13). Implemented by the extension and the VPS
 * Playwright worker - NOT in this package (this is just the contract).
 */
export interface SocialAdapter {
  readonly platform: Platform;
  /** Scrape candidates matching the given watch-rule values. */
  discover(rules: { kind: "subreddit" | "keyword"; value: string }[]): Promise<ScrapedCandidate[]>;
  /** Pull a fuller research profile for one user. */
  fetchProfile(handle: string): Promise<ScrapedProfile>;
  /** Execute one approved outbound action on the live session. */
  send(request: OutboundRequest): Promise<OutboundResult>;
}
