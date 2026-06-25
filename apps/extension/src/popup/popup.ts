import type { InstagramScrapeMode } from "@zitrion/core";
import type { ServiceWorkerResponse } from "../lib/messages";
import { getConfig, getIgState, saveIgState } from "../lib/storage";

const sessionStatusEl = document.getElementById("session-status")!;
const sendsMeterEl = document.getElementById("sends-meter")!;
const nextSendEl = document.getElementById("next-send")!;
const pauseReasonEl = document.getElementById("pause-reason") as HTMLParagraphElement;
const killSwitchEl = document.getElementById("kill-switch") as HTMLInputElement;
const discoverNowEl = document.getElementById("discover-now") as HTMLButtonElement;
const dashboardLinkEl = document.getElementById("dashboard-link") as HTMLAnchorElement;
const convexUrlEl = document.getElementById("convex-url") as HTMLInputElement;
const workspaceIdEl = document.getElementById("workspace-id") as HTMLInputElement;
const deviceTokenEl = document.getElementById("device-token") as HTMLInputElement;
const dashboardUrlEl = document.getElementById("dashboard-url") as HTMLInputElement;
const saveConfigEl = document.getElementById("save-config") as HTMLButtonElement;

const igCountEl = document.getElementById("ig-count") as HTMLInputElement;
const igEnrichEl = document.getElementById("ig-enrich") as HTMLInputElement;
const igScrapeEl = document.getElementById("ig-scrape") as HTMLButtonElement;
const igRunEl = document.getElementById("ig-run") as HTMLButtonElement;
const igStopEl = document.getElementById("ig-stop") as HTMLButtonElement;
const igProgressEl = document.getElementById("ig-progress") as HTMLParagraphElement;

function selectedMode(): InstagramScrapeMode {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="ig-mode"]:checked'
  );
  return (checked?.value as InstagramScrapeMode) ?? "commenters";
}

async function refreshUi(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: "GET_STATUS",
  })) as ServiceWorkerResponse;

  if (response.type !== "STATUS") return;

  const status = response.status;
  const config = await getConfig();

  const paused = status.extensionPaused || config?.localKillSwitch;
  sessionStatusEl.textContent = paused
    ? "Paused"
    : status.paired
      ? "Active"
      : "Not paired";
  sessionStatusEl.className = paused ? "status-paused" : "status-active";

  sendsMeterEl.textContent = `${status.sendsToday} / ${status.dailySendCeiling || "—"}`;
  nextSendEl.textContent = status.extensionPaused ? "Paused" : "Auto-send ready";

  if (status.pauseReason) {
    pauseReasonEl.hidden = false;
    pauseReasonEl.textContent = status.pauseReason;
  } else {
    pauseReasonEl.hidden = true;
    pauseReasonEl.textContent = "";
  }

  killSwitchEl.checked = config?.localKillSwitch ?? false;

  if (config?.dashboardUrl) {
    dashboardLinkEl.href = config.dashboardUrl;
  }

  if (config) {
    convexUrlEl.value = config.convexUrl;
    workspaceIdEl.value = config.workspaceId;
    deviceTokenEl.value = config.deviceToken;
    dashboardUrlEl.value = config.dashboardUrl;
  }
}

async function refreshIg(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: "GET_IG_STATE",
  })) as ServiceWorkerResponse;
  if (response.type !== "IG_STATE") return;

  const { state } = response;
  igRunEl.textContent = state.sending
    ? "Sending…"
    : `Run DM queue${state.approvedCount ? ` (${state.approvedCount})` : ""}`;
  igRunEl.disabled = state.sending || state.approvedCount === 0;
  igStopEl.disabled = !state.sending;
  igScrapeEl.disabled = state.scraping;

  const meter =
    state.dailySendCeiling > 0
      ? ` · ${state.sendsToday}/${state.dailySendCeiling} today`
      : "";
  igProgressEl.textContent = state.progress
    ? `${state.progress}${meter}`
    : state.approvedCount
      ? `${state.approvedCount} DM(s) ready to send${meter}`
      : "";
}

async function loadIgPrefs(): Promise<void> {
  const ig = await getIgState();
  igCountEl.value = String(ig.count);
  igEnrichEl.checked = ig.enrich;
  const modeInput = document.querySelector<HTMLInputElement>(
    `input[name="ig-mode"][value="${ig.mode}"]`
  );
  if (modeInput) modeInput.checked = true;
}

killSwitchEl.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "TOGGLE_KILL_SWITCH",
    enabled: killSwitchEl.checked,
  });
  await refreshUi();
});

discoverNowEl.addEventListener("click", async () => {
  discoverNowEl.disabled = true;
  discoverNowEl.textContent = "Polling…";
  await chrome.runtime.sendMessage({ type: "TRIGGER_DISCOVERY" });
  discoverNowEl.disabled = false;
  discoverNowEl.textContent = "Poll Reddit discovery now";
  await refreshUi();
});

igScrapeEl.addEventListener("click", async () => {
  const count = Math.max(1, Math.min(Number(igCountEl.value) || 20, 500));
  const mode = selectedMode();
  const enrich = igEnrichEl.checked;
  await saveIgState({ mode, count, enrich });
  igProgressEl.textContent = "Starting scrape…";
  await chrome.runtime.sendMessage({
    type: "TRIGGER_INSTAGRAM_SCRAPE",
    request: { mode, count, enrich },
  });
  await refreshIg();
});

igRunEl.addEventListener("click", async () => {
  igProgressEl.textContent = "Starting DM queue…";
  await chrome.runtime.sendMessage({ type: "RUN_IG_SEND_LOOP" });
  await refreshIg();
});

igStopEl.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_IG_SEND_LOOP" });
  await refreshIg();
});

saveConfigEl.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({
    type: "SAVE_CONFIG",
    config: {
      convexUrl: convexUrlEl.value.trim(),
      workspaceId: workspaceIdEl.value.trim(),
      deviceToken: deviceTokenEl.value.trim(),
      dashboardUrl: dashboardUrlEl.value.trim() || "http://localhost:3000",
    },
  });
  await refreshUi();
});

void loadIgPrefs();
void refreshUi();
void refreshIg();
setInterval(() => void refreshIg(), 2000);
