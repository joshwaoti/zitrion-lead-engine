/**
 * Phase 2 — Instagram content script skeleton.
 * Scrape commenters + DM flow behind the same Convex approval queue (stub).
 */
import type { BackgroundMessage, ContentMessage } from "../../lib/messages";
import { instagramAdapterStub } from "@zitrion/core";

console.info("[zitrion] Instagram content script loaded (Phase 2 stub)");

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
  if (message.type === "GET_PAGE_CONTEXT") {
    return {
      type: "PAGE_CONTEXT",
      loggedIn: Boolean(document.querySelector('a[href*="/direct/inbox/"]')),
      url: location.href,
    };
  }

  if (message.type === "RUN_IG_DISCOVERY") {
    const postUrl = message.postUrl ?? location.href;
    const commenters = await instagramAdapterStub.scrapeCommenters?.(postUrl, 20);
    return {
      type: "IG_DISCOVERY_RESULT",
      commenters: commenters ?? [],
      postUrl,
    };
  }

  if (message.type === "EXECUTE_ACTION") {
    return {
      type: "ACTION_RESULT",
      actionId: message.action._id,
      status: "failed",
      errorMessage: "Instagram DM/comment execution not implemented (Phase 2 stub)",
    };
  }

  throw new Error(`Unknown Instagram message: ${(message as { type: string }).type}`);
}

/** Passive hook — detect when user is viewing a post (future commenter scrape). */
function observePostSurface(): void {
  const postLink = location.pathname.match(/^\/p\/([^/]+)/);
  if (postLink) {
    console.debug("[zitrion:instagram] post surface detected", postLink[1]);
  }
}

observePostSurface();
