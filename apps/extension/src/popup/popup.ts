import type { ServiceWorkerResponse } from "../lib/messages";
import { getConfig } from "../lib/storage";

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
  nextSendEl.textContent = status.extensionPaused ? "Paused" : "Polling";

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
  discoverNowEl.textContent = "Poll discovery now";
  await refreshUi();
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

void refreshUi();
