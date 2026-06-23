import type { BrowserContext, Page } from "playwright";
import type {
  InboxMessage,
  OutboundRequest,
  OutboundResult,
  ScrapedCandidate,
  ScrapedProfile,
  SocialAdapter,
} from "@zitrion/core";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

type RedditListingChild = {
  kind: string;
  data: {
    name: string;
    author: string;
    author_fullname?: string;
    subreddit: string;
    title: string;
    selftext?: string;
    body?: string;
    permalink: string;
    created_utc: number;
  };
};

type RedditListing = { data?: { children?: RedditListingChild[] } };

function childToCandidate(child: RedditListingChild): ScrapedCandidate | null {
  if (child.kind !== "t3" && child.kind !== "t1") return null;
  const data = child.data;
  if (data.author === "[deleted]" || data.author === "AutoModerator") return null;
  const body = data.selftext ?? data.body ?? "";
  const text = child.kind === "t3" ? `${data.title}\n\n${body}`.trim() : body;
  return {
    platform: "reddit",
    kind: child.kind === "t3" ? "post" : "comment",
    externalUserId: data.author_fullname ?? data.author,
    handle: data.author,
    sourceUrl: `https://www.reddit.com${data.permalink}`,
    text: text.slice(0, 2000),
  };
}

/**
 * VPS Playwright secondary executor — implements the canonical
 * {@link SocialAdapter} contract on a persistent, logged-in Reddit session.
 */
export class RedditPlaywrightAdapter implements SocialAdapter {
  readonly platform = "reddit" as const;

  constructor(private readonly page: Page) {}

  async isSessionActive(): Promise<boolean> {
    await this.page.goto("https://www.reddit.com/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const loginVisible = await this.page
      .locator('a[href*="/login"]')
      .first()
      .isVisible()
      .catch(() => false);
    return !loginVisible;
  }

  async discover(
    rules: { kind: "subreddit" | "keyword"; value: string }[]
  ): Promise<ScrapedCandidate[]> {
    const seen = new Set<string>();
    const results: ScrapedCandidate[] = [];

    for (const rule of rules) {
      try {
        const path =
          rule.kind === "subreddit"
            ? `https://www.reddit.com/r/${rule.value.replace(/^r\//i, "")}/new`
            : `https://www.reddit.com/search?q=${encodeURIComponent(rule.value)}&sort=new&t=week`;

        const response = await this.page.request.get(
          `${path}.json?limit=25&raw_json=1`
        );
        if (!response.ok()) continue;

        const payload = (await response.json()) as RedditListing[];
        const children = payload[0]?.data?.children ?? [];

        for (const child of children) {
          const candidate = childToCandidate(child);
          if (!candidate) continue;
          if (rule.kind === "keyword" && !candidate.text.toLowerCase().includes(rule.value.toLowerCase())) {
            continue;
          }
          if (seen.has(candidate.sourceUrl)) continue;
          seen.add(candidate.sourceUrl);
          candidate.matchedRule = rule.value;
          results.push(candidate);
        }
      } catch (error) {
        console.warn("[zitrion:worker] discovery rule failed", rule, error);
      }
      await humanDelay(800, 2000);
    }

    return results;
  }

  async fetchProfile(handle: string): Promise<ScrapedProfile> {
    const clean = handle.replace(/^u\//, "");
    try {
      const response = await this.page.request.get(
        `https://www.reddit.com/user/${clean}/about.json?raw_json=1`
      );
      if (!response.ok()) return {};
      const json = (await response.json()) as {
        data?: { total_karma?: number; created_utc?: number; subreddit?: { public_description?: string } };
      };
      const data = json.data;
      return {
        karma: data?.total_karma,
        accountAgeDays: data?.created_utc
          ? Math.floor((Date.now() / 1000 - data.created_utc) / 86_400)
          : undefined,
        bio: data?.subreddit?.public_description,
      };
    } catch {
      return {};
    }
  }

  async send(request: OutboundRequest): Promise<OutboundResult> {
    if (request.type === "comment") {
      return this.postComment(request.target, request.body);
    }
    return this.sendDm(request.target, request.body);
  }

  private async postComment(url: string, body: string): Promise<OutboundResult> {
    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await humanDelay(1000, 2000);

      const composer = this.page
        .locator(
          'form.usertext textarea[name="text"], textarea[placeholder*="comment"], div[contenteditable="true"][role="textbox"]'
        )
        .first();
      await composer.waitFor({ state: "visible", timeout: 20_000 });
      await composer.fill(body);
      await humanDelay(500, 1200);

      await this.page
        .locator(
          'form.usertext button[type="submit"], button[slot="submit-button"], shreddit-composer button[type="submit"]'
        )
        .first()
        .click();
      await humanDelay(2000, 3500);

      return { ok: true, permalink: this.page.url() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  private async sendDm(target: string, body: string): Promise<OutboundResult> {
    try {
      const handle =
        target.match(/\/user\/([^/?#]+)/i)?.[1] ??
        target.match(/\/u\/([^/?#]+)/i)?.[1] ??
        target.replace(/^u\//, "");

      await this.page.goto(`https://www.reddit.com/chat/user/${handle}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await humanDelay(1500, 2500);

      const input = this.page
        .locator(
          'textarea[placeholder*="Message"], div[contenteditable="true"][role="textbox"]'
        )
        .first();
      await input.waitFor({ state: "visible", timeout: 20_000 });
      await input.fill(body);
      await humanDelay(600, 1400);

      await this.page
        .locator('button[aria-label="Send"], button[data-testid="send-message-button"]')
        .first()
        .click();
      await humanDelay(1500, 2500);

      return { ok: true, permalink: this.page.url() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  /** Phase 1 — read Reddit chat thread previews from the live session. */
  async readInbox(limit = 30): Promise<InboxMessage[]> {
    const messages: InboxMessage[] = [];
    try {
      await this.page.goto("https://www.reddit.com/chat", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await humanDelay(2000, 3000);

      const threads = this.page.locator(
        '[data-testid="chat-thread-list-item"], a[href*="/chat/"]'
      );
      const count = Math.min(await threads.count(), limit);

      for (let i = 0; i < count; i++) {
        const thread = threads.nth(i);
        const href = (await thread.getAttribute("href")) ?? "";
        const label = ((await thread.textContent()) ?? "").trim();
        if (!href || !label) continue;

        const handleMatch = label.match(/u\/([\w-]+)/i) ?? label.match(/^([\w-]+)/);
        const fromHandle = handleMatch?.[1] ?? label.slice(0, 40);
        const threadUrl = href.startsWith("http") ? href : `https://www.reddit.com${href}`;

        messages.push({
          platform: "reddit",
          fromHandle,
          body: label,
          threadUrl,
          messageId: `reddit-chat-${threadUrl}`,
          direction: "inbound",
          receivedAt: Date.now(),
        });
      }
    } catch (error) {
      console.warn("[zitrion:worker] readInbox partial failure", error);
    }

    return messages.filter(
      (m, idx, arr) => arr.findIndex((x) => x.messageId === m.messageId) === idx
    );
  }
}

export async function launchRedditContext(
  userDataDir: string,
  headless: boolean
): Promise<{ context: BrowserContext; page: Page; adapter: RedditPlaywrightAdapter }> {
  const { chromium } = await import("playwright");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, adapter: new RedditPlaywrightAdapter(page) };
}
