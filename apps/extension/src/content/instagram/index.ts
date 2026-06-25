import type { CommenterProfile } from "@zitrion/core";
import type { BackgroundMessage, ContentMessage } from "../../lib/messages";

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
]);

console.info("[zitrion] Instagram content script loaded");

chrome.runtime.onMessage.addListener((message: BackgroundMessage, _sender, sendResponse) => {
  void handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse({ type: "ERROR", message: errorMessage } satisfies ContentMessage);
    });
  return true;
});

async function handleMessage(message: BackgroundMessage): Promise<ContentMessage> {
  if (message.type === "GET_PAGE_CONTEXT" || message.type === "CHECK_THROTTLE") {
    return {
      type: "PAGE_CONTEXT",
      loggedIn: isLoggedIn(),
      url: location.href,
    };
  }

  if (message.type === "RUN_IG_DISCOVERY") {
    const postUrl = currentPostUrl(message.postUrl);
    const commenters = scrapeVisibleCommenters(50);
    return {
      type: "IG_DISCOVERY_RESULT",
      commenters,
      postUrl,
    };
  }

  if (message.type === "EXECUTE_ACTION") {
    return {
      type: "ACTION_RESULT",
      actionId: message.action._id,
      status: "failed",
      errorMessage: "Automatic Instagram sending is disabled. Open the target and send manually.",
    };
  }

  throw new Error(`Unknown Instagram message: ${(message as { type: string }).type}`);
}

function isLoggedIn(): boolean {
  return Boolean(
    document.querySelector('a[href*="/direct/inbox/"], svg[aria-label="Direct"]')
  );
}

function currentPostUrl(postUrl?: string): string {
  if (postUrl) return postUrl;
  const match = location.pathname.match(/^\/(?:p|reel|tv)\/[^/]+/);
  if (match) return `${location.origin}${match[0]}/`;
  return location.href.split(/[?#]/)[0] ?? location.href;
}

function normalizeUsername(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  const normalized = segment.toLowerCase();
  if (RESERVED_PATHS.has(normalized)) return null;
  if (!/^[a-z0-9._]{1,30}$/i.test(segment)) return null;
  return segment;
}

function cleanSnippet(handle: string, text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(new RegExp(`^${escapeRegExp(handle)}\\s*`, "i"), "")
    .trim();
  if (cleaned.length < 2) return undefined;
  return cleaned.slice(0, 280);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nearestCommentText(anchor: HTMLAnchorElement, handle: string): string | undefined {
  const container = anchor.closest("li, article, div");
  const text = container?.textContent;
  return cleanSnippet(handle, text);
}

function scrapeVisibleCommenters(limit: number): CommenterProfile[] {
  const article = document.querySelector("article") ?? document.body;
  const seen = new Set<string>();
  const commenters: CommenterProfile[] = [];

  article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]').forEach((anchor) => {
    if (commenters.length >= limit) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    const url = new URL(href, location.origin);
    const handle = normalizeUsername(url.pathname);
    if (!handle || seen.has(handle.toLowerCase())) return;

    const commentSnippet = nearestCommentText(anchor, handle);
    if (!commentSnippet) return;

    seen.add(handle.toLowerCase());
    commenters.push({
      handle,
      profileUrl: `${location.origin}/${handle}/`,
      commentSnippet,
    });
  });

  return commenters;
}
