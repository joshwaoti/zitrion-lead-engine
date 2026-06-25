import type { CommenterProfile, InstagramProfileInsight } from "@zitrion/core";

const RESERVED_PATHS = new Set([
  "about",
  "accounts",
  "api",
  "challenge",
  "developer",
  "direct",
  "explore",
  "legal",
  "p",
  "privacy",
  "reel",
  "reels",
  "stories",
  "terms",
  "tv",
  "your_activity",
]);

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

export function isLoggedIn(): boolean {
  return Boolean(
    document.querySelector(
      'a[href*="/direct/inbox/"], svg[aria-label="Direct"], svg[aria-label="New post"], a[href="/explore/"]'
    )
  );
}

export function detectInstagramBlock(): string | null {
  const text = document.body?.innerText ?? "";
  if (/Try Again Later/i.test(text)) return "Instagram rate limit: 'Try Again Later'";
  if (/We restrict certain activity/i.test(text)) return "Instagram action block detected";
  if (/challenge_required|checkpoint_required/i.test(location.href)) {
    return "Instagram security checkpoint";
  }
  return null;
}

export function currentPostUrl(postUrl?: string): string {
  if (postUrl) return postUrl;
  const match = location.pathname.match(/^\/(?:p|reel|tv)\/[^/]+/);
  if (match) return `${location.origin}${match[0]}/`;
  return location.href.split(/[?#]/)[0] ?? location.href;
}

export function normalizeUsername(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  const normalized = segment.toLowerCase();
  if (RESERVED_PATHS.has(normalized)) return null;
  if (!/^[a-z0-9._]{1,30}$/i.test(segment)) return null;
  return segment;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanSnippet(handle: string, text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(new RegExp(`^${escapeRegExp(handle)}\\s*`, "i"), "")
    .replace(/\b(Verified|Reply|Like|\d+[wdhms]|See translation)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return undefined;
  return cleaned.slice(0, 280);
}

/** Find the scrollable element most likely holding the list we want to grow. */
function findScrollable(root: ParentNode): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("div"));
  let best: HTMLElement | null = null;
  let bestScore = 0;
  for (const el of candidates) {
    const style = getComputedStyle(el);
    const scrolls =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      el.scrollHeight > el.clientHeight + 40;
    if (!scrolls) continue;
    const score = el.clientHeight * el.clientWidth;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

async function clickLoadMoreComments(): Promise<void> {
  const buttons = Array.from(
    document.querySelectorAll<HTMLElement>('button, [role="button"]')
  );
  for (const button of buttons) {
    const label = (button.getAttribute("aria-label") ?? "").toLowerCase();
    if (label.includes("load more comments")) {
      button.click();
      await humanDelay(400, 900);
      return;
    }
    // The "+" load-more affordance has an svg and no text.
    const svg = button.querySelector('svg[aria-label="Load more comments"]');
    if (svg) {
      button.click();
      await humanDelay(400, 900);
      return;
    }
  }
}

function collectUsernameAnchors(
  root: ParentNode,
  seen: Set<string>,
  out: CommenterProfile[],
  limit: number,
  withSnippet: boolean
): void {
  const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href^="/"]');
  for (const anchor of Array.from(anchors)) {
    if (out.length >= limit) return;
    const href = anchor.getAttribute("href");
    if (!href) continue;
    let handle: string | null;
    try {
      handle = normalizeUsername(new URL(href, location.origin).pathname);
    } catch {
      handle = null;
    }
    if (!handle || seen.has(handle.toLowerCase())) continue;

    let commentSnippet: string | undefined;
    let fullName: string | undefined;
    if (withSnippet) {
      const container = anchor.closest("li, article, div[role='button'], div");
      commentSnippet = cleanSnippet(handle, container?.textContent);
      // Followers/commenters list rows often render the display name in a span.
      const nameSpan = anchor.closest("div")?.querySelector("span");
      const nameText = nameSpan?.textContent?.trim();
      if (nameText && nameText.toLowerCase() !== handle.toLowerCase()) {
        fullName = nameText.slice(0, 80);
      }
    }

    seen.add(handle.toLowerCase());
    out.push({
      handle,
      profileUrl: `${location.origin}/${handle}/`,
      commentSnippet,
      fullName,
    });
  }
}

/** Scroll a post's comment list, loading more, and collect commenter handles. */
export async function scrapeCommenters(limit: number): Promise<CommenterProfile[]> {
  const seen = new Set<string>();
  const out: CommenterProfile[] = [];

  // The post author appears at the top; don't treat them as a commenter twice
  // — dedupe handles that.
  const dialog = document.querySelector<HTMLElement>('div[role="dialog"]');
  const scope: ParentNode = dialog ?? document.querySelector("article") ?? document.body;

  let stagnantRounds = 0;
  for (let round = 0; round < 60 && out.length < limit; round += 1) {
    await clickLoadMoreComments();

    const before = out.length;
    collectUsernameAnchors(scope, seen, out, limit, true);

    const scrollable = findScrollable(scope) ?? findScrollable(document);
    if (scrollable) {
      scrollable.scrollTop = scrollable.scrollHeight;
    } else {
      window.scrollTo(0, document.body.scrollHeight);
    }
    await humanDelay(700, 1300);

    if (out.length === before) {
      stagnantRounds += 1;
      if (stagnantRounds >= 4) break;
    } else {
      stagnantRounds = 0;
    }
  }

  // Final sweep after the last scroll settled.
  collectUsernameAnchors(scope, seen, out, limit, true);
  return out.slice(0, limit);
}

/** Open a profile's followers dialog, scroll it, and collect follower handles. */
export async function scrapeFollowers(limit: number): Promise<CommenterProfile[]> {
  // Open the followers dialog if it isn't already open.
  let dialog = document.querySelector<HTMLElement>('div[role="dialog"]');
  if (!dialog) {
    const link =
      document.querySelector<HTMLAnchorElement>('a[href$="/followers/"]') ??
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find((a) =>
        /\/followers\/?$/.test(a.getAttribute("href") ?? "")
      );
    if (!link) {
      throw new Error("Followers link not found — open the profile page first");
    }
    link.click();
    for (let i = 0; i < 20 && !dialog; i += 1) {
      await humanDelay(300, 600);
      dialog = document.querySelector<HTMLElement>('div[role="dialog"]');
    }
  }
  if (!dialog) throw new Error("Followers dialog did not open");

  await humanDelay(800, 1400);

  const seen = new Set<string>();
  const out: CommenterProfile[] = [];

  // The profile owner's own handle shows in the URL; exclude it.
  const ownerHandle = normalizeUsername(location.pathname)?.toLowerCase();
  if (ownerHandle) seen.add(ownerHandle);

  let stagnantRounds = 0;
  for (let round = 0; round < 200 && out.length < limit; round += 1) {
    const before = out.length;
    collectUsernameAnchors(dialog, seen, out, limit, true);

    const scrollable = findScrollable(dialog);
    if (scrollable) {
      scrollable.scrollTop = scrollable.scrollHeight;
    }
    await humanDelay(600, 1100);

    if (out.length === before) {
      stagnantRounds += 1;
      if (stagnantRounds >= 5) break;
    } else {
      stagnantRounds = 0;
    }
  }

  collectUsernameAnchors(dialog, seen, out, limit, true);
  return out.slice(0, limit);
}

function parseCount(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/,/g, "").trim().toLowerCase();
  const match = cleaned.match(/([\d.]+)\s*([km])?/);
  if (!match) return undefined;
  const value = parseFloat(match[1]!);
  if (Number.isNaN(value)) return undefined;
  const suffix = match[2];
  if (suffix === "k") return Math.round(value * 1_000);
  if (suffix === "m") return Math.round(value * 1_000_000);
  return Math.round(value);
}

/** Extract counts (and sometimes name) from the og:description meta tag. */
function parseMetaCounts(): {
  followers?: number;
  following?: number;
  posts?: number;
} {
  const meta = document
    .querySelector('meta[property="og:description"]')
    ?.getAttribute("content");
  if (!meta) return {};
  const followers = meta.match(/([\d.,]+[km]?)\s+Followers/i)?.[1];
  const following = meta.match(/([\d.,]+[km]?)\s+Following/i)?.[1];
  const posts = meta.match(/([\d.,]+[km]?)\s+Posts/i)?.[1];
  return {
    followers: parseCount(followers),
    following: parseCount(following),
    posts: parseCount(posts),
  };
}

/** Enrich the Instagram profile currently loaded in this tab. */
export function enrichCurrentProfile(): InstagramProfileInsight | null {
  const handle = normalizeUsername(location.pathname);
  if (!handle) return null;

  const header = document.querySelector("header") ?? document.body;

  // Full name: og:title is "Name (@handle) • Instagram ..." — most reliable.
  const ogTitle = document
    .querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  let fullName: string | undefined;
  if (ogTitle) {
    fullName = ogTitle.split("(@")[0]?.replace(/[•·].*$/, "").trim() || undefined;
  }
  if (!fullName) {
    const h1 = header.querySelector("h1");
    fullName = h1?.textContent?.trim() || undefined;
  }

  const counts = parseMetaCounts();

  // Bio: the header text minus the username/name and the counts row.
  let bio: string | undefined;
  const headerText = header.innerText ?? "";
  const lines = headerText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (l) =>
        l.toLowerCase() !== handle.toLowerCase() &&
        l !== fullName &&
        !/^\d/.test(l) &&
        !/followers|following|posts/i.test(l) &&
        !/^(Follow|Following|Message|Email|Contact|More)$/i.test(l)
    );
  if (lines.length) bio = lines.slice(0, 4).join(" ").slice(0, 400);

  // External link in the bio (non-instagram http link).
  let externalUrl: string | undefined;
  const linkEl = Array.from(header.querySelectorAll<HTMLAnchorElement>("a")).find(
    (a) => {
      const href = a.getAttribute("href") ?? "";
      return /^https?:\/\//.test(href) && !/instagram\.com/.test(href);
    }
  );
  if (linkEl) externalUrl = linkEl.textContent?.trim() || linkEl.href;

  const isVerified = Boolean(header.querySelector('svg[aria-label="Verified"]'));
  const isPrivate = /This account is private|This Account is Private/i.test(
    document.body?.innerText ?? ""
  );

  // Recent posts: caption/alt text from the post grid thumbnails.
  const recentPosts = Array.from(
    document.querySelectorAll<HTMLImageElement>('a[href^="/p/"] img[alt], a[href^="/reel/"] img[alt]')
  )
    .map((img) => img.getAttribute("alt") ?? "")
    .map((alt) =>
      alt
        .replace(/^Photo (shared )?by .*? on .*?\. /i, "")
        .replace(/May be an image of/i, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((alt) => alt.length > 8)
    .slice(0, 4);

  return {
    handle,
    profileUrl: `${location.origin}/${handle}/`,
    fullName,
    bio,
    externalUrl,
    isVerified,
    isPrivate,
    postCount: counts.posts,
    followerCount: counts.followers,
    followingCount: counts.following,
    recentPosts,
  };
}
