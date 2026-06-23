import type { ActionType, Platform } from "./types.js";

export type WatchRuleType = "subreddit" | "keyword";

export type WatchRule = {
  _id: string;
  type: WatchRuleType;
  value: string;
  enabled: boolean;
  noPromo?: boolean;
};

export type ApprovedAction = {
  _id: string;
  leadId: string;
  type: ActionType;
  targetUrl: string;
  content: string;
  createdAt: number;
};

export type ActionResult = {
  actionId: string;
  status: "done" | "failed";
  permalink?: string;
  errorMessage?: string;
};

export type WorkspacePacing = {
  dailySendCeiling: number;
  minGapMinutes: number;
  sendsToday: number;
  killSwitch: boolean;
  autoPauseOnThrottle: boolean;
  nextSendWindowAt?: number;
};

export type ExtensionSessionStatus = {
  paired: boolean;
  workspaceId?: string;
  sessionActive: boolean;
  extensionPaused: boolean;
  pauseReason?: string;
  sendsToday: number;
  dailySendCeiling: number;
  lastDiscoveryAt?: number;
  lastPollAt?: number;
};

export type ExtensionConfig = {
  convexUrl: string;
  deviceToken: string;
  workspaceId: string;
  dashboardUrl: string;
  localKillSwitch: boolean;
};

export type WorkerConfig = {
  convexUrl: string;
  deviceToken: string;
  workspaceId: string;
  userDataDir: string;
  pollIntervalMs: number;
  headless: boolean;
};

export type ExecutorKind = "extension" | "worker";

export const EXTENSION_ALARM_DISCOVERY = "zitrion-discovery";
export const EXTENSION_ALARM_ACTION_POLL = "zitrion-action-poll";
export const EXTENSION_ALARM_HEARTBEAT = "zitrion-heartbeat";
export const EXTENSION_ALARM_INBOX_SYNC = "zitrion-inbox-sync";

export const DISCOVERY_INTERVAL_MINUTES = 15;
export const ACTION_POLL_INTERVAL_MINUTES = 2;
export const HEARTBEAT_INTERVAL_MINUTES = 5;
export const INBOX_SYNC_INTERVAL_MINUTES = 10;

/** Extension considered online if lastSeen within this window (worker yields). */
export const EXTENSION_ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

export type InboxMessage = {
  platform: Platform;
  fromHandle: string;
  body: string;
  threadUrl: string;
  messageId: string;
  direction: "inbound" | "outbound";
  receivedAt: number;
};

export type InboxSyncPayload = {
  messages: InboxMessage[];
};
