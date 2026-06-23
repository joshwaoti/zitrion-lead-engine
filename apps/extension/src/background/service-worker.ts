import {
  ACTION_POLL_INTERVAL_MINUTES,
  DISCOVERY_INTERVAL_MINUTES,
  EXTENSION_ALARM_ACTION_POLL,
  EXTENSION_ALARM_DISCOVERY,
  EXTENSION_ALARM_HEARTBEAT,
  HEARTBEAT_INTERVAL_MINUTES,
} from "@zitrion/core";
import {
  claimApprovedAction,
  fetchWatchRules,
  fetchWorkspacePacing,
  ingestCandidates,
  reportActionResult,
  reportThrottle,
  sendHeartbeat,
  setExtensionPaused,
} from "../lib/convex-client";
import type { ContentMessage, PopupMessage, ServiceWorkerResponse } from "../lib/messages";
import { canSendNow } from "../lib/pacing";
import {
  getConfig,
  getStatus,
  isOperational,
  saveConfig,
  saveStatus,
  setLocalKillSwitch,
} from "../lib/storage";

let actionQueueBusy = false;

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
    void pollAndExecuteActions();
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
  await chrome.alarms.create(EXTENSION_ALARM_ACTION_POLL, {
    periodInMinutes: ACTION_POLL_INTERVAL_MINUTES,
  });
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
    if (rules.length === 0) return;

    const tabId = await ensureRedditTab();
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "RUN_DISCOVERY",
      rules,
    })) as ContentMessage;

    if (response.type === "THROTTLE_DETECTED") {
      await handleThrottle(response.reason);
      return;
    }

    if (response.type !== "DISCOVERY_RESULT") return;

    if (response.error) {
      console.warn("[zitrion] discovery error", response.error);
    }

    const result = await ingestCandidates(
      config.convexUrl,
      config.deviceToken,
      response.candidates
    );

    await saveStatus({ lastDiscoveryAt: Date.now() });
    console.info(
      `[zitrion] discovery complete: inserted=${result.inserted} deduped=${result.deduped}`
    );
  } catch (error) {
    console.warn("[zitrion] discovery cycle failed", error);
  }
}

async function pollAndExecuteActions(): Promise<void> {
  if (!(await isOperational()) || actionQueueBusy) return;

  const config = await getConfig();
  if (!config) return;

  try {
    const pacing = await fetchWorkspacePacing(config.convexUrl, config.deviceToken);
    await saveStatus({
      sendsToday: pacing.sendsToday,
      dailySendCeiling: pacing.dailySendCeiling,
      extensionPaused: pacing.extensionPaused,
      pauseReason: pacing.pauseReason,
    });

    if (pacing.killSwitch || pacing.extensionPaused || !canSendNow(pacing)) {
      return;
    }

    const action = await claimApprovedAction(config.convexUrl, config.deviceToken);
    if (!action) return;

    actionQueueBusy = true;
    await executeActionOnLiveSession(config.convexUrl, config.deviceToken, action);
  } catch (error) {
    console.warn("[zitrion] action poll failed", error);
  } finally {
    actionQueueBusy = false;
  }
}

async function executeActionOnLiveSession(
  convexUrl: string,
  deviceToken: string,
  action: import("@zitrion/core").ApprovedAction
): Promise<void> {
  const tabId = await openActionTab(action.targetUrl);

  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "EXECUTE_ACTION",
      action,
    })) as ContentMessage;

    if (response.type === "THROTTLE_DETECTED") {
      await handleThrottle(response.reason);
      await reportActionResult(convexUrl, deviceToken, {
        actionId: action._id,
        status: "failed",
        errorMessage: response.reason,
      });
      return;
    }

    if (response.type !== "ACTION_RESULT") {
      throw new Error("Unexpected executor response");
    }

    await reportActionResult(convexUrl, deviceToken, {
      actionId: response.actionId,
      status: response.status,
      permalink: response.permalink,
      errorMessage: response.errorMessage,
    });

    if (response.status === "failed" && response.errorMessage?.includes("throttle")) {
      await handleThrottle(response.errorMessage);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await reportActionResult(convexUrl, deviceToken, {
      actionId: action._id,
      status: "failed",
      errorMessage,
    });

    if (/throttle|verify|captcha|rate limit/i.test(errorMessage)) {
      await handleThrottle(errorMessage);
    }
  } finally {
    await refreshStatusFromConvex();
  }
}

async function ensureRedditTab(): Promise<number> {
  const tabs = await chrome.tabs.query({ url: ["https://www.reddit.com/*", "https://old.reddit.com/*"] });
  const active = tabs.find((tab) => tab.id);
  if (active?.id) return active.id;

  const tab = await chrome.tabs.create({
    url: "https://www.reddit.com/",
    active: false,
  });
  if (!tab.id) throw new Error("Failed to open Reddit tab");
  await waitForTabLoad(tab.id);
  return tab.id;
}

async function openActionTab(targetUrl: string): Promise<number> {
  const tab = await chrome.tabs.create({ url: targetUrl, active: true });
  if (!tab.id) throw new Error("Failed to open action tab");
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
