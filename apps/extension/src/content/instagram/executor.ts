import { delay, detectInstagramBlock, humanDelay } from "./scraper";

async function waitFor<T extends Element>(
  finder: () => T | null,
  timeoutMs = 12_000,
  intervalMs = 300
): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const el = finder();
    if (el) return el;
    await delay(intervalMs);
  }
  return null;
}

function findByText<T extends Element>(
  selector: string,
  text: string
): T | null {
  const target = text.toLowerCase();
  return (
    (Array.from(document.querySelectorAll<T>(selector)).find((el) => {
      const own = (el.textContent ?? "").trim().toLowerCase();
      return own === target;
    }) ?? null)
  );
}

/** Locate the "Message" button on a profile (handles a few IG variants). */
function findMessageButton(): HTMLElement | null {
  const direct =
    findByText<HTMLElement>('div[role="button"]', "Message") ??
    findByText<HTMLElement>("button", "Message");
  if (direct) return direct;

  // Some layouts wrap the label in a span inside the button.
  const labelled = Array.from(
    document.querySelectorAll<HTMLElement>('div[role="button"], button')
  ).find((el) => (el.textContent ?? "").trim().toLowerCase() === "message");
  return labelled ?? null;
}

/** Locate the DM composer input (textarea or contenteditable). */
function findComposer(): HTMLElement | null {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder*="Message" i]'
  );
  if (textarea) return textarea;
  const editable = document.querySelector<HTMLElement>(
    'div[contenteditable="true"][role="textbox"], div[aria-label*="Message" i][contenteditable="true"]'
  );
  return editable;
}

async function typeIntoComposer(
  composer: HTMLElement,
  content: string
): Promise<void> {
  composer.focus();
  await humanDelay(150, 400);

  if (composer instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    setter?.call(composer, content);
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }

  // Contenteditable (Lexical/Draft) — insertText drives the editor's handlers.
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, content);
  } catch {
    inserted = false;
  }
  if (!inserted) {
    composer.textContent = content;
    composer.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: content, inputType: "insertText" })
    );
  }
}

function pressEnter(target: HTMLElement): void {
  for (const type of ["keydown", "keypress", "keyup"] as const) {
    target.dispatchEvent(
      new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      })
    );
  }
}

function findSendButton(): HTMLElement | null {
  return (
    findByText<HTMLElement>('div[role="button"]', "Send") ??
    findByText<HTMLElement>("button", "Send")
  );
}

/**
 * Send a first-message DM to the profile currently loaded in this tab.
 * Returns the thread URL as the permalink.
 */
export async function sendInstagramDm(content: string): Promise<string> {
  const block = detectInstagramBlock();
  if (block) throw new Error(block);

  // If we're not already in a DM thread, open one from the profile.
  if (!location.pathname.startsWith("/direct/")) {
    const messageButton = await waitFor(() => findMessageButton(), 10_000);
    if (!messageButton) {
      throw new Error("Could not find the Message button on this profile");
    }
    await humanDelay(400, 1000);
    messageButton.click();
  }

  const composer = await waitFor(() => findComposer(), 15_000);
  if (!composer) {
    throw new Error("DM composer did not appear");
  }

  await humanDelay(600, 1500);
  await typeIntoComposer(composer, content);
  await humanDelay(500, 1200);

  // Prefer the explicit Send button; fall back to Enter.
  const sendButton = findSendButton();
  if (sendButton) {
    sendButton.click();
  } else {
    pressEnter(composer);
  }

  await humanDelay(1500, 2600);

  const postBlock = detectInstagramBlock();
  if (postBlock) throw new Error(postBlock);

  return location.href.split(/[?#]/)[0] ?? location.href;
}
