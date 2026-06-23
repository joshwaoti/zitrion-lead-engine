import type { ScrapedCandidate, ScrapedProfile } from "./socialAdapter";

/**
 * Pluggable read source (PRD §6 "optional read accelerator", §13).
 *
 * Reads are low-risk and can optionally route through a third-party read-only
 * data provider to reduce load on the live session. WRITES always go through
 * the {@link SocialAdapter} on the user's own session. Off by default.
 */
export interface ReadSource {
  readonly id: string;
  readonly enabled: boolean;
  /** Read candidates for the given watch-rule values without the live session. */
  read(rules: { kind: "subreddit" | "keyword"; value: string }[]): Promise<ScrapedCandidate[]>;
  /** Optionally enrich a profile via the read source. */
  readProfile?(handle: string): Promise<ScrapedProfile>;
}
