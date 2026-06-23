import type { ExtensionConfig, ExtensionSessionStatus } from "@zitrion/core";

const CONFIG_KEY = "zitrion_config";
const STATUS_KEY = "zitrion_status";

const defaultStatus: ExtensionSessionStatus = {
  paired: false,
  sessionActive: false,
  extensionPaused: false,
  sendsToday: 0,
  dailySendCeiling: 0,
};

export async function getConfig(): Promise<ExtensionConfig | null> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return (result[CONFIG_KEY] as ExtensionConfig | undefined) ?? null;
}

export async function saveConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function getStatus(): Promise<ExtensionSessionStatus> {
  const result = await chrome.storage.local.get(STATUS_KEY);
  return (result[STATUS_KEY] as ExtensionSessionStatus | undefined) ?? defaultStatus;
}

export async function saveStatus(
  status: Partial<ExtensionSessionStatus>
): Promise<ExtensionSessionStatus> {
  const current = await getStatus();
  const next = { ...current, ...status };
  await chrome.storage.local.set({ [STATUS_KEY]: next });
  return next;
}

export async function setLocalKillSwitch(enabled: boolean): Promise<void> {
  const config = await getConfig();
  if (!config) return;
  await saveConfig({ ...config, localKillSwitch: enabled });
}

export async function isOperational(): Promise<boolean> {
  const config = await getConfig();
  const status = await getStatus();
  if (!config?.deviceToken || !config.convexUrl) return false;
  if (config.localKillSwitch) return false;
  if (status.extensionPaused) return false;
  return true;
}
