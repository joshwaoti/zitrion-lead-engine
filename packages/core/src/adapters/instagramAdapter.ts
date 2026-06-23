import type { CommenterProfile } from "../types";
import type {
  OutboundRequest,
  OutboundResult,
  ScrapedCandidate,
  ScrapedProfile,
  SocialAdapter,
} from "../socialAdapter";

/**
 * Phase 2 stub — Instagram SocialAdapter.
 *
 * Conforms to the canonical {@link SocialAdapter} contract so the engine can
 * route Instagram discovery + DM through the same Convex approval queue as
 * Reddit. The real scraping/DM automation lives in the extension content
 * script (and later the worker); this stub returns empty/no-op results.
 */
export class InstagramAdapterStub implements SocialAdapter {
  readonly platform = "instagram" as const;

  async discover(
    _rules: { kind: "subreddit" | "keyword"; value: string }[]
  ): Promise<ScrapedCandidate[]> {
    return [];
  }

  async fetchProfile(_handle: string): Promise<ScrapedProfile> {
    return {};
  }

  async send(_request: OutboundRequest): Promise<OutboundResult> {
    return {
      ok: false,
      error: "Instagram adapter not implemented (Phase 2 stub)",
    };
  }

  /** Phase 2 — scrape commenters off a post (not part of the base contract). */
  async scrapeCommenters(
    _postUrl: string,
    _limit = 20
  ): Promise<CommenterProfile[]> {
    return [];
  }
}

export const instagramAdapterStub = new InstagramAdapterStub();
