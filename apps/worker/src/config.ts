import type { WorkerConfig } from "@zitrion/core";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadConfig(): WorkerConfig {
  return {
    convexUrl: required("CONVEX_URL"),
    deviceToken: required("WORKER_DEVICE_TOKEN"),
    workspaceId: process.env.WORKER_WORKSPACE_ID ?? "",
    userDataDir:
      process.env.REDDIT_USER_DATA_DIR ??
      `${process.cwd()}/.data/reddit-profile`,
    pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? "30000"),
    headless: process.env.WORKER_HEADLESS !== "false",
  };
}

export function loadPairingConfig() {
  return {
    convexUrl: required("CONVEX_URL"),
    pairingCode: required("EXTENSION_PAIRING_SECRET"),
    workspaceId: required("WORKER_WORKSPACE_ID"),
  };
}
