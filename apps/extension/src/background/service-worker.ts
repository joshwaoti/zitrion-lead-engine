import {
  DISCOVERY_INTERVAL_MINUTES,
  EXTENSION_ALARM_ACTION_POLL,
  EXTENSION_ALARM_DISCOVERY,
  EXTENSION_ALARM_HEARTBEAT,
  HEARTBEAT_INTERVAL_MINUTES,
  type CommenterProfile,
  type RawCandidate,
  type WatchRule,
} from "@zitrion/core";
import {
  fetchWatchRules,
  fetchWorkspacePacing,
  ingestCandidates,
  reportActivity,
  reportThrottle,
  sendHeartbeat,
  setExtensionPaused,
} from "../lib/convex-client";
import type { ContentMessage, PopupMessage, ServiceWorkerResponse } from "../lib/messages";
import {
  getConfig,
  getStatus,
  isOperational,
  saveConfig,
  saveStatus,
  setLocalKillSwitch,
} from "../lib/storage";

const MAX_RULES_PER_CYCLE = 6;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function ruleToUrl(rule: WatchRule): string {
  if (rule.type === "subreddit") {
    const clean = rule.value.replace(/^r\//i, "").trim();
    return `https://www.reddit.com/r/${clean}/new/`;
  }
  const query = encodeURIComponent(rule.value);
  return `https://www.reddit.com/search/?q=${query}&sort=new`;
}

function mergeCandidates(
  seen: Set<string>,
  target: RawCandidate[],
  incoming: RawCandidate[]
): void {
  for (const candidate of incoming) {
    if (seen.has(candidate.sourceId)) continue;
    seen.add(candidate.sourceId);
    target.push(candidate);
  }
}

function pauseBetweenRules(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 900 + Math.random() * 900);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  void setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void setupAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXTENSION_ALARM_DISCOVERY) {
    void runDiscoveryCycle();
  }
  if (alarm.name === EXTENSION_ALARM_ACTION_POLL) {
    void disableActionPollAlarm();
  }
  if (alarm.name === EXTENSION_ALARM_HEARTBEAT) {
    void heartbeatCycle();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleRuntimeMessage(message)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      sendResponse({ type: "ERROR", message: errorMessage } satisfies ServiceWorkerResponse);
    });
  return true;
});

async function setupAlarms(): Promise<void> {
  await chrome.alarms.create(EXTENSION_ALARM_DISCOVERY, {
    periodInMinutes: DISCOVERY_INTERVAL_MINUTES,
  });
  await chrome.alarms.clear(EXTENSION_ALARM_ACTION_POLL);
  await chrome.alarms.create(EXTENSION_ALARM_HEARTBEAT, {
    periodInMinutes: HEARTBEAT_INTERVAL_MINUTES,
  });
}

async function handleRuntimeMessage(
  message: PopupMessage | ContentMessage
): Promise<ServiceWorkerResponse> {
  if (message.type === "GET_STATUS") {
    await refreshStatusFromConvex();
    return { type: "STATUS", status: await getStatus() };
  }

  if (message.type === "TOGGLE_KILL_SWITCH") {
    await setLocalKillSwitch(message.enabled);
    await refreshStatusFromConvex();
    return { type: "OK" };
  }

  if (message.type === "TRIGGER_DISCOVERY") {
    await runDiscoveryCycle();
    return { type: "OK" };
  }

  if (message.type === "TRIGGER_INSTAGRAM_DISCOVERY") {
    await runInstagramDiscoveryCycle();
    return { type: "OK" };
  }

  if (message.type === "SAVE_CONFIG") {
    const current = await getConfig();
    await saveConfig({
      convexUrl: message.config.convexUrl,
      deviceToken: message.config.deviceToken,
      workspaceId: message.config.workspaceId,
      dashboardUrl: message.config.dashboardUrl,
      localKillSwitch: current?.localKillSwitch ?? false,
    });
    await saveStatus({ paired: true, sessionActive: true });
    await setupAlarms();
    await refreshStatusFromConvex();
    return { type: "OK" };
  }

  if (message.type === "THROTTLE_DETECTED") {
    await handleThrottle(message.reason);
    return { type: "OK" };
  }

  if (message.type === "DISCOVERY_PROGRESS") {
    const config = await getConfig();
    if (config?.deviceToken) {
      try {
        await reportActivity(config.convexUrl, config.deviceToken, message.step);
      } catch {
        // Best-effort activity feed.
      }
    }
    return { type: "OK" };
  }

  return { type: "ERROR", message: "Unknown message" };
}

async function refreshStatusFromConvex(): Promise<void> {
  const config = await getConfig();
  if (!config?.deviceToken || !config.convexUrl) return;

  try {
    const pacing = await fetchWorkspacePacing(config.convexUrl, config.deviceToken);
    await saveStatus({
      paired: true,
      workspaceId: config.workspaceId,
      sessionActive: pacing.sessionActive,
      extensionPaused: pacing.extensionPaused,
      pauseReason: pacing.pauseReason,
      sendsToday: pacing.sendsToday,
      dailySendCeiling: pacing.dailySendCeiling,
    });
  } catch (error) {
    console.warn("[zitrion] status refresh failed", error);
  }
}

async function heartbeatCycle(): Promise<void> {
  const config = await getConfig();
  if (!config?.deviceToken) return;

  const redditConnected = await probeRedditSession();
  const status = await getStatus();

  try {
    await sendHeartbeat(
      config.convexUrl,
      config.deviceToken,
      redditConnected,
      status.lastDiscoveryAt
    );
    await refreshStatusFromConvex();
  } catch (error) {
    console.warn("[zitrion] heartbeat failed", error);
  }
}

async function probeRedditSession(): Promise<boolean> {
  const tabs = await chrome.tabs.query({ url: ["https://www.reddit.com/*", "https://old.reddit.com/*"] });
  if (tabs.length === 0) return false;

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const response = (await chrome.tabs.sendMessage(tab.id, {
        type: "GET_PAGE_CONTEXT",
      })) as ContentMessage;
      if (response.type === "PAGE_CONTEXT" && response.loggedIn) {
        return true;
      }
    } catch {
      // Tab may not have content script yet.
    }
  }

  return false;
}

async function runDiscoveryCycle(): Promise<void> {
  if (!(await isOperational())) return;

  const config = await getConfig();
  if (!config) return;

  try {
    const rules = await fetchWatchRules(config.convexUrl, config.deviceToken);
    const enabled = shuffle(rules.filter((rule) => rule.enabled)).slice(
      0,
      MAX_RULES_PER_CYCLE
    );
    if (enabled.length === 0) return;

    await reportActivity(
      config.convexUrl,
      config.deviceToken,
      `Discovery cycle started · ${enabled.length} rules`
    );

    const tabId = await ensureRedditTab(false);
    const seen = new Set<string>();
    const allCandidates: RawCandidate[] = [];

    for (const rule of enabled) {
      const label =
        rule.type === "subreddit" ? `r/${rule.value}` : `"${rule.value}"`;

      await reportActivity(
        config.convexUrl,
        config.deviceToken,
        `Scanning ${label}…`
      );

      await chrome.tabs.update(tabId, { url: ruleToUrl(rule) });
      await waitForTabLoad(tabId);
      await ensureContentScriptReady(tabId);

      const response = (await chrome.tabs.sendMessage(tabId, {
        type: "SCRAPE_FOR_RULE",
        rule,
      })) as ContentMessage;

      if (response.type === "THROTTLE_DETECTED") {
        await handleThrottle(response.reason);
        return;
      }

      if (response.type !== "DISCOVERY_RESULT") {
        await reportActivity(
          config.convexUrl,
          config.deviceToken,
          `${label} · unexpected response from Reddit tab`
        );
        continue;
      }

      if (response.error) {
        console.warn("[zitrion] scrape error", rule, response.error);
      }

      mergeCandidates(seen, allCandidates, response.candidates);

      await reportActivity(
        config.convexUrl,
        config.deviceToken,
        `${label} · ${response.candidates.length} posts · ${allCandidates.length} total`
      );

      await pauseBetweenRules();
    }

    const result = await ingestCandidates(
      config.convexUrl,
      config.deviceToken,
      allCandidates
    );

    await saveStatus({ lastDiscoveryAt: Date.now() });
    await reportActivity(
      config.convexUrl,
      config.deviceToken,
      allCandidates.length === 0
        ? "Discovery complete · 0 posts found (check Reddit login or try again)"
        : `Discovery complete · ${result.inserted} new, ${result.deduped} deduped`
    );
    console.info(
      `[zitrion] discovery complete: inserted=${result.inserted} deduped=${result.deduped}`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("[zitrion] discovery cycle failed", errorMessage);
    const config = await getConfig();
    if (config?.deviceToken) {
      try {
        await reportActivity(
          config.convexUrl,
          config.deviceToken,
          `Discovery cycle failed · ${errorMessage.slice(0, 160)}`
        );
      } catch {
        // ignore
      }
    }
  }
}

async function disableActionPollAlarm(): Promise<void> {
  await chrome.alarms.clear(EXTENSION_ALARM_ACTION_POLL);
}

function instagramSourceId(postUrl: string, handle: string, commentSnippet?: string): string {
  const shortcode =
    new URL(postUrl).pathname.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1] ?? "post";
  const commentKey = (commentSnippet ?? "commenter")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `instagram:${shortcode}:${handle.toLowerCase()}:${commentKey}`;
}

function instagramCommenterToCandidate(
  commenter: CommenterProfile,
  postUrl: string
): RawCandidate {
  const snippet = commenter.commentSnippet?.trim()
    ? `Commented: ${commenter.commentSnippet.trim()}`
    : "Commented on this Instagram post";

  return {
    platform: "instagram",
    handle: commenter.handle,
    subreddit: "instagram",
    snippet: snippet.slice(0, 280),
    postBody: snippet,
    url: postUrl,
    profileHints: commenter.profileUrl,
    postedAt: Date.now(),
    sourceId: instagramSourceId(postUrl, commenter.handle, commenter.commentSnippet),
  };
}

async function runInstagramDiscoveryCycle(): Promise<void> {
  if (!(await isOperational())) return;

  const config = await getConfig();
  if (!config) return;

  try {
    const tabId = await ensureInstagramTab();
    await ensureContentScriptReady(tabId, "Instagram");

    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "RUN_IG_DISCOVERY",
    })) as ContentMessage;

    if (response.type !== "IG_DISCOVERY_RESULT") {
      await reportActivity(
        config.convexUrl,
        config.deviceToken,
        "Instagram scrape failed - open an Instagram post or reel and try again"
      );
      return;
    }

    const seen = new Set<string>();
    const candidates: RawCandidate[] = [];
    for (const commenter of response.commenters) {
      const candidate = instagramCommenterToCandidate(commenter, response.postUrl);
      if (seen.has(candidate.sourceId)) continue;
      seen.add(candidate.sourceId);
      candidates.push(candidate);
    }

    const result = await ingestCandidates(
      config.convexUrl,
      config.deviceToken,
      candidates
    );

    await saveStatus({ lastDiscoveryAt: Date.now() });
    await reportActivity(
      config.convexUrl,
      config.deviceToken,
      candidates.length === 0
        ? "Instagram scrape complete - no visible commenters found"
        : `Instagram scrape complete - ${result.inserted} new, ${result.deduped} deduped`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("[zitrion] Instagram discovery failed", errorMessage);
    try {
      await reportActivity(
        config.convexUrl,
        config.deviceToken,
        `Instagram scrape failed - ${errorMessage.slice(0, 160)}`
      );
    } catch {
      // ignore
    }
  }
}

async function ensureContentScriptReady(tabId: number, label = "Reddit"): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = (await chrome.tabs.sendMessage(tabId, {
        type: "GET_PAGE_CONTEXT",
      })) as ContentMessage;
      if (response.type === "PAGE_CONTEXT") return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw new Error(`${label} content script not ready - reload the tab`);
}

async function ensureRedditTab(active = false): Promise<number> {
  const tabs = await chrome.tabs.query({ url: ["https://www.reddit.com/*", "https://old.reddit.com/*"] });
  const existing = tabs.find((tab) => tab.id);
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active });
    return existing.id;
  }

  const tab = await chrome.tabs.create({
    url: "https://www.reddit.com/",
    active,
  });
  if (!tab.id) throw new Error("Failed to open Reddit tab");
  await waitForTabLoad(tab.id);
  return tab.id;
}

async function ensureInstagramTab(): Promise<number> {
  const activeTabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: ["https://www.instagram.com/*"],
  });
  const activeTab = activeTabs.find((tab) => tab.id);
  if (activeTab?.id) return activeTab.id;

  const instagramTabs = await chrome.tabs.query({
    url: ["https://www.instagram.com/*"],
  });
  const existing = instagramTabs.find((tab) => tab.id);
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    return existing.id;
  }

  const tab = await chrome.tabs.create({
    url: "https://www.instagram.com/",
    active: true,
  });
  if (!tab.id) throw new Error("Failed to open Instagram tab");
  await waitForTabLoad(tab.id);
  return tab.id;
}

function waitForTabLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 20_000);

    function listener(updatedTabId: number, info: chrome.tabs.TabChangeInfo): void {
      if (updatedTabId === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1200);
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function handleThrottle(reason: string): Promise<void> {
  const config = await getConfig();
  if (!config?.deviceToken) return;

  await saveStatus({ extensionPaused: true, pauseReason: reason });

  try {
    await reportThrottle(config.convexUrl, config.deviceToken, reason);
    await setExtensionPaused(config.convexUrl, config.deviceToken, true, reason);
  } catch (error) {
    console.warn("[zitrion] failed to report throttle", error);
  }
}

void setupAlarms();
