import type { InboxMessage } from "@zitrion/core";

/** Phase 1 — read Reddit chat thread previews from the live session. */
export async function readRedditInbox(limit = 30): Promise<InboxMessage[]> {
  const messages: InboxMessage[] = [];
  const isChat =
    location.hostname.includes("reddit.com") &&
    (location.pathname.startsWith("/chat") || location.pathname.includes("/message"));

  if (!isChat) {
    return messages;
  }

  const threads = document.querySelectorAll(
    '[data-testid="chat-thread-list-item"], a[href*="/chat/"]'
  );

  threads.forEach((node, index) => {
    if (index >= limit) return;
    const el = node as HTMLElement;
    const href = el.getAttribute("href") ?? "";
    const label = (el.textContent ?? "").trim();
    if (!href || !label) return;

    const handleMatch =
      label.match(/u\/([\w-]+)/i) ?? label.match(/^([\w-]+)/);
    const fromHandle = handleMatch?.[1] ?? label.slice(0, 40);
    const threadUrl = href.startsWith("http")
      ? href
      : `https://www.reddit.com${href}`;

    messages.push({
      platform: "reddit",
      fromHandle,
      body: label,
      threadUrl,
      messageId: `reddit-chat-${threadUrl}`,
      direction: "inbound",
      receivedAt: Date.now(),
    });
  });

  return messages.filter(
    (m, idx, arr) => arr.findIndex((x) => x.messageId === m.messageId) === idx
  );
}
