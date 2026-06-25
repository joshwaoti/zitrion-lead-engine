import type { BackgroundMessage, ContentMessage } from "../../lib/messages";
import { detectThrottleFromDocument, isVerificationPage } from "../../lib/throttle-detector";
import { readRedditInbox } from "./inbox";
import { isLoggedIn, scrapeForRule } from "./scraper";

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
  if (message.type === "CHECK_THROTTLE") {
    if (isVerificationPage(location.href)) {
      return { type: "THROTTLE_DETECTED", reason: "Reddit verification page detected" };
    }
    const reason = detectThrottleFromDocument();
    if (reason) {
      return { type: "THROTTLE_DETECTED", reason: reason };
    }
    return { type: "PAGE_CONTEXT", loggedIn: isLoggedIn(), url: location.href };
  }

  if (message.type === "GET_PAGE_CONTEXT") {
    return { type: "PAGE_CONTEXT", loggedIn: isLoggedIn(), url: location.href };
  }

  if (message.type === "SCRAPE_FOR_RULE") {
    const throttle = detectThrottleFromDocument();
    if (throttle) {
      return { type: "THROTTLE_DETECTED", reason: throttle };
    }

    try {
      const candidates = await scrapeForRule(message.rule);
      return { type: "DISCOVERY_RESULT", candidates };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { type: "DISCOVERY_RESULT", candidates: [], error: errorMessage };
    }
  }

  if (message.type === "SYNC_INBOX") {
    try {
      const messages = await readRedditInbox(message.limit ?? 30);
      return { type: "INBOX_SYNC_RESULT", messages };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { type: "INBOX_SYNC_RESULT", messages: [], error: errorMessage };
    }
  }

  if (message.type === "EXECUTE_ACTION") {
    return {
      type: "ACTION_RESULT",
      actionId: message.action._id,
      status: "failed",
      errorMessage: "Automatic Reddit sending is disabled. Open the target and send manually.",
    };
  }

  throw new Error(`Unknown content message: ${(message as { type: string }).type}`);
}

const observer = new MutationObserver(() => {
  const reason = detectThrottleFromDocument();
  if (reason) {
    chrome.runtime.sendMessage({ type: "THROTTLE_DETECTED", reason } satisfies ContentMessage);
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
}

console.info("[zitrion] Reddit content script loaded");
