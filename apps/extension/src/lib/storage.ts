import type {
  ExtensionConfig,
  ExtensionSessionStatus,
  InstagramScrapeMode,
} from "@zitrion/core";

const CONFIG_KEY = "zitrion_config";
const STATUS_KEY = "zitrion_status";
const IG_KEY = "zitrion_ig";

export type IgState = {
  mode: InstagramScrapeMode;
  count: number;
  enrich: boolean;
  scraping: boolean;
  sending: boolean;
  stopRequested: boolean;
  progress: string;
};

const defaultIgState: IgState = {
  mode: "commenters",
  count: 20,
  enrich: true,
  scraping: false,
  sending: false,
  stopRequested: false,
  progress: "",
};

export async function getIgState(): Promise<IgState> {
  const result = await chrome.storage.local.get(IG_KEY);
  return { ...defaultIgState, ...((result[IG_KEY] as Partial<IgState> | undefined) ?? {}) };
}

export async function saveIgState(patch: Partial<IgState>): Promise<IgState> {
  const current = await getIgState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [IG_KEY]: next });
  return next;
}

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
