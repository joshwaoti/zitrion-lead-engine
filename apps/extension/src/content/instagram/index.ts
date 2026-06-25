import type { BackgroundMessage, ContentMessage } from "../../lib/messages";
import { sendInstagramDm } from "./executor";
import {
  currentPostUrl,
  detectInstagramBlock,
  enrichCurrentProfile,
  isLoggedIn,
  scrapeCommenters,
  scrapeFollowers,
} from "./scraper";

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
    const block = detectInstagramBlock();
    if (block && message.type === "CHECK_THROTTLE") {
      return { type: "THROTTLE_DETECTED", reason: block };
    }
    return {
      type: "PAGE_CONTEXT",
      loggedIn: isLoggedIn(),
      url: location.href,
    };
  }

  if (message.type === "RUN_IG_DISCOVERY") {
    const postUrl = currentPostUrl(message.postUrl);
    const commenters = await scrapeCommenters(50);
    return { type: "IG_DISCOVERY_RESULT", commenters, postUrl };
  }

  if (message.type === "IG_SCRAPE_COMMENTERS") {
    const postUrl = currentPostUrl(message.postUrl);
    try {
      const commenters = await scrapeCommenters(message.limit);
      return { type: "IG_COMMENTERS_RESULT", commenters, postUrl };
    } catch (error) {
      return {
        type: "IG_COMMENTERS_RESULT",
        commenters: [],
        postUrl,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (message.type === "IG_SCRAPE_FOLLOWERS") {
    const profileUrl = message.profileUrl ?? location.href.split(/[?#]/)[0] ?? location.href;
    try {
      const followers = await scrapeFollowers(message.limit);
      return { type: "IG_FOLLOWERS_RESULT", followers, profileUrl };
    } catch (error) {
      return {
        type: "IG_FOLLOWERS_RESULT",
        followers: [],
        profileUrl,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (message.type === "IG_ENRICH_PROFILE") {
    try {
      const insight = enrichCurrentProfile();
      return { type: "IG_ENRICH_RESULT", insight };
    } catch (error) {
      return {
        type: "IG_ENRICH_RESULT",
        insight: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (message.type === "EXECUTE_ACTION") {
    if (message.action.type !== "dm") {
      return {
        type: "ACTION_RESULT",
        actionId: message.action._id,
        status: "failed",
        errorMessage: "Instagram executor only handles DMs",
      };
    }
    try {
      const permalink = await sendInstagramDm(message.action.content);
      return {
        type: "ACTION_RESULT",
        actionId: message.action._id,
        status: "done",
        permalink,
      };
    } catch (error) {
      return {
        type: "ACTION_RESULT",
        actionId: message.action._id,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  throw new Error(`Unknown Instagram message: ${(message as { type: string }).type}`);
}
