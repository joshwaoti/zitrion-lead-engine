import type { RawCandidate, WatchRule } from "@zitrion/core";
import { humanPause, scrollLikeHuman } from "./human-browse";

type RedditListingChild = {
  kind: string;
  data: {
    id: string;
    name: string;
    author: string;
    subreddit: string;
    title: string;
    selftext?: string;
    body?: string;
    permalink: string;
    url: string;
    created_utc: number;
    link_flair_text?: string;
    author_flair_text?: string;
  };
};

type RedditListing = {
  data?: {
    children?: RedditListingChild[];
  };
};

function normalizeHandle(author: string): string {
  return author === "[deleted]" ? "deleted" : author;
}

function buildProfileHints(data: RedditListingChild["data"]): string {
  const hints: string[] = [];
  if (data.author_flair_text) hints.push(`flair: ${data.author_flair_text}`);
  if (data.link_flair_text) hints.push(`post_flair: ${data.link_flair_text}`);
  return hints.join(" | ");
}

function childToCandidate(child: RedditListingChild): RawCandidate | null {
  if (child.kind !== "t3" && child.kind !== "t1") return null;
  const data = child.data;
  const handle = normalizeHandle(data.author);
  if (handle === "deleted" || handle === "AutoModerator") return null;

  const body = data.selftext ?? data.body ?? "";
  const snippetSource = child.kind === "t3" ? data.title : body;
  const snippet = snippetSource.slice(0, 280);

  return {
    platform: "reddit",
    handle,
    subreddit: data.subreddit,
    snippet,
    postBody: child.kind === "t3" ? `${data.title}\n\n${body}`.trim() : body,
    url: `https://www.reddit.com${data.permalink}`,
    profileHints: buildProfileHints(data) || undefined,
    postedAt: data.created_utc * 1000,
    sourceId: data.name,
  };
}

function matchesKeyword(candidate: RawCandidate, keyword: string): boolean {
  const needle = keyword.toLowerCase();
  const haystack = `${candidate.snippet}\n${candidate.postBody}`.toLowerCase();
  return haystack.includes(needle);
}

const MAX_RULES_PER_CYCLE = 6;
export { MAX_RULES_PER_CYCLE };

function buildJsonListingUrl(path: string): string {
  if (path.includes("/search")) {
    const url = new URL(path, "https://www.reddit.com");
    const params = new URLSearchParams(url.search);
    params.set("limit", "25");
    params.set("raw_json", "1");
    return `https://www.reddit.com/search.json?${params.toString()}`;
  }

  const normalized = path.replace(/\/$/, "");
  return `${normalized}.json?limit=25&raw_json=1`;
}

async function fetchListing(path: string): Promise<RedditListingChild[]> {
  const jsonUrl = buildJsonListingUrl(path);
  const response = await fetch(jsonUrl, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Reddit listing failed (${response.status}) for ${jsonUrl}`);
  }

  const payload = (await response.json()) as RedditListing[] | RedditListing;
  const listing = Array.isArray(payload)
    ? (payload[0]?.data?.children ?? [])
    : (payload.data?.children ?? []);
  return listing;
}

export async function scrapeSubreddit(subreddit: string): Promise<RawCandidate[]> {
  const clean = subreddit.replace(/^r\//i, "").trim();
  const children = await fetchListing(`https://www.reddit.com/r/${clean}/new`);
  return children
    .map(childToCandidate)
    .filter((candidate): candidate is RawCandidate => candidate !== null);
}

export async function scrapeKeyword(keyword: string): Promise<RawCandidate[]> {
  const encoded = encodeURIComponent(keyword);
  const children = await fetchListing(
    `https://www.reddit.com/search?q=${encoded}&sort=new&t=week`
  );
  return children
    .map(childToCandidate)
    .filter((candidate): candidate is RawCandidate => candidate !== null);
}

function mergeCandidates(
  seen: Set<string>,
  results: RawCandidate[],
  batch: RawCandidate[]
): void {
  for (const candidate of batch) {
    if (!candidate.sourceId || seen.has(candidate.sourceId)) continue;
    seen.add(candidate.sourceId);
    results.push(candidate);
  }
}

/** Scrape the current Reddit page for one rule (no navigation — background drives tabs). */
export async function scrapeForRule(rule: WatchRule): Promise<RawCandidate[]> {
  const seen = new Set<string>();
  const results: RawCandidate[] = [];

  await scrollLikeHuman(2 + Math.floor(Math.random() * 2));
  await humanPause(400, 900);

  mergeCandidates(seen, results, scrapeVisiblePosts());

  try {
    if (rule.type === "subreddit") {
      mergeCandidates(seen, results, await scrapeSubreddit(rule.value));
    } else {
      const remote = await scrapeKeyword(rule.value);
      mergeCandidates(
        seen,
        results,
        remote.filter((candidate) => matchesKeyword(candidate, rule.value))
      );
    }
  } catch (error) {
    console.warn("[zitrion] JSON scrape failed for rule", rule, error);
  }

  return results;
}

export function scrapeVisiblePosts(): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  const isOldReddit = location.hostname === "old.reddit.com";

  if (isOldReddit) {
    document.querySelectorAll(".thing.link, .thing.comment").forEach((node) => {
      const el = node as HTMLElement;
      const fullname = el.getAttribute("data-fullname");
      const author = el.getAttribute("data-author") ?? "unknown";
      const subreddit =
        el.getAttribute("data-subreddit") ??
        location.pathname.match(/\/r\/([^/]+)/)?.[1] ??
        "unknown";
      const title = el.querySelector(".title")?.textContent?.trim() ?? "";
      const body =
        el.querySelector(".usertext-body")?.textContent?.trim() ?? title;
      const permalink = el.querySelector("a.title, a.bylink")?.getAttribute("href");

      if (!fullname || !permalink || author === "[deleted]") return;

      candidates.push({
        platform: "reddit",
        handle: author,
        subreddit,
        snippet: (title || body).slice(0, 280),
        postBody: body,
        url: permalink.startsWith("http")
          ? permalink
          : `https://old.reddit.com${permalink}`,
        postedAt: Date.now(),
        sourceId: fullname,
      });
    });
    return candidates;
  }

  document.querySelectorAll("shreddit-post, shreddit-comment").forEach((node) => {
    const el = node as HTMLElement;
    const postId = el.getAttribute("id") ?? el.getAttribute("thingid");
    const author =
      el.getAttribute("author") ??
      el.querySelector('[slot="author-name"]')?.textContent?.trim() ??
      "unknown";
    const subreddit =
      el.getAttribute("subreddit-prefixed-name")?.replace(/^r\//, "") ??
      location.pathname.match(/\/r\/([^/]+)/)?.[1] ??
      "unknown";
    const title = el.getAttribute("post-title") ?? "";
    const body =
      el.querySelector('[slot="text-body"]')?.textContent?.trim() ?? title;
    const permalink = el.getAttribute("permalink") ?? el.getAttribute("content-href");

    if (!postId || !permalink || author === "[deleted]") return;

    candidates.push({
      platform: "reddit",
      handle: author.replace(/^u\//, ""),
      subreddit,
      snippet: (title || body).slice(0, 280),
      postBody: body,
      url: permalink.startsWith("http")
        ? permalink
        : `https://www.reddit.com${permalink}`,
      postedAt: Date.now(),
      sourceId: postId.startsWith("t") ? postId : `t3_${postId}`,
    });
  });

  return candidates;
}

export function isLoggedIn(): boolean {
  const isOld = location.hostname === "old.reddit.com";
  if (isOld) {
    return Boolean(document.querySelector("#mail, .user .logout"));
  }
  return Boolean(
    document.querySelector('a[href*="/settings"], faceplate-tracker[noun="profile"]')
  );
}
