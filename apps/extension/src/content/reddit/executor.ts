import type { ApprovedAction } from "@zitrion/core";
import { detectThrottleFromDocument } from "../../lib/throttle-detector";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

async function waitForSelector(
  selector: string,
  timeoutMs = 15_000
): Promise<Element> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

function permalinkFromLocation(): string {
  const url = new URL(location.href);
  url.hash = "";
  url.search = "";
  return url.toString();
}

async function executeComment(content: string): Promise<string> {
  const isOld = location.hostname === "old.reddit.com";

  if (isOld) {
    const textarea = (await waitForSelector(
      'form.usertext.editable textarea[name="text"], .commentarea textarea[name="text"]'
    )) as HTMLTextAreaElement;
    textarea.focus();
    textarea.value = content;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await humanDelay(400, 900);

    const submit = document.querySelector(
      'form.usertext.editable button[type="submit"], .commentarea button[type="submit"]'
    ) as HTMLButtonElement | null;
    if (!submit) throw new Error("Comment submit button not found");
    submit.click();
    await humanDelay(1500, 2500);
    return permalinkFromLocation();
  }

  const composer = await waitForSelector(
    'textarea[placeholder*="comment"], faceplate-textarea-input textarea, div[contenteditable="true"][role="textbox"]'
  );

  if (composer instanceof HTMLTextAreaElement) {
    composer.focus();
    composer.value = content;
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    (composer as HTMLElement).focus();
    (composer as HTMLElement).textContent = content;
    composer.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  await humanDelay(500, 1200);

  const submitButton = document.querySelector(
    'button[slot="submit-button"], button[type="submit"], shreddit-composer button'
  ) as HTMLButtonElement | null;

  if (!submitButton) {
    throw new Error("New Reddit comment submit button not found");
  }

  submitButton.click();
  await humanDelay(2000, 3500);
  return permalinkFromLocation();
}

async function openChatWithUser(username: string): Promise<void> {
  const clean = username.replace(/^u\//, "");
  const chatUrl = `https://www.reddit.com/chat/user/${clean}`;
  if (!location.href.includes("/chat/")) {
    location.href = chatUrl;
    await delay(3000);
  }
}

async function executeDm(content: string, targetUrl: string): Promise<string> {
  const usernameMatch =
    targetUrl.match(/\/user\/([^/?#]+)/i) ??
    targetUrl.match(/\/u\/([^/?#]+)/i) ??
    targetUrl.match(/chat\/user\/([^/?#]+)/i);

  const username = usernameMatch?.[1];
  if (!username) {
    throw new Error("Could not resolve Reddit username for DM");
  }

  await openChatWithUser(username);
  await humanDelay(1500, 2500);

  const throttle = detectThrottleFromDocument();
  if (throttle) throw new Error(throttle);

  const input = (await waitForSelector(
    'textarea[placeholder*="Message"], textarea[data-testid="chat-message-input"], div[contenteditable="true"][role="textbox"]'
  )) as HTMLTextAreaElement | HTMLElement;

  if (input instanceof HTMLTextAreaElement) {
    input.focus();
    input.value = content;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    input.focus();
    input.textContent = content;
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  await humanDelay(600, 1400);

  const sendButton = document.querySelector(
    'button[aria-label="Send"], button[data-testid="send-message-button"], button[type="submit"]'
  ) as HTMLButtonElement | null;

  if (!sendButton) {
    throw new Error("Reddit Chat send button not found");
  }

  sendButton.click();
  await humanDelay(1500, 2500);
  return location.href;
}

export async function executeApprovedAction(
  action: ApprovedAction
): Promise<{ permalink: string }> {
  const throttle = detectThrottleFromDocument();
  if (throttle) {
    throw new Error(throttle);
  }

  if (!location.href.startsWith(action.targetUrl.split("?")[0] ?? action.targetUrl)) {
    location.href = action.targetUrl;
    await delay(3000);
  }

  await humanDelay(800, 1800);

  const permalink =
    action.type === "comment"
      ? await executeComment(action.content)
      : await executeDm(action.content, action.targetUrl);

  const postThrottle = detectThrottleFromDocument();
  if (postThrottle) {
    throw new Error(postThrottle);
  }

  return { permalink };
}
