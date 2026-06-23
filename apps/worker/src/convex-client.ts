import type {
  ApprovedAction,
  InboxMessage,
  WatchRule,
  WorkspacePacing,
} from "@zitrion/core";

type ConvexResponse<T> = {
  status: "success" | "error";
  value?: T;
  errorMessage?: string;
};

async function convexCall<T>(
  convexUrl: string,
  kind: "query" | "mutation",
  path: string,
  args: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${convexUrl.replace(/\/$/, "")}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });

  if (!response.ok) {
    throw new Error(`Convex HTTP ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as ConvexResponse<T>;
  if (payload.status === "error") {
    throw new Error(payload.errorMessage ?? "Convex call failed");
  }

  return payload.value as T;
}

export async function pairWorker(
  convexUrl: string,
  pairingCode: string,
  workspaceId: string
): Promise<{ deviceToken: string; workspaceId: string }> {
  return convexCall(convexUrl, "mutation", "extension:pairDevice", {
    pairingCode,
    workspaceId,
    label: "VPS Playwright worker",
    executorKind: "worker",
  });
}

export async function fetchWatchRules(
  convexUrl: string,
  deviceToken: string
): Promise<WatchRule[]> {
  return convexCall(convexUrl, "query", "extension:getWatchRules", {
    deviceToken,
  });
}

export async function fetchWorkspacePacing(
  convexUrl: string,
  deviceToken: string
): Promise<WorkspacePacing> {
  return convexCall(convexUrl, "query", "extension:getWorkspacePacing", {
    deviceToken,
  });
}

export async function claimApprovedAction(
  convexUrl: string,
  deviceToken: string
): Promise<ApprovedAction | null> {
  return convexCall(convexUrl, "mutation", "extension:claimApprovedAction", {
    deviceToken,
  });
}

export async function reportActionResult(
  convexUrl: string,
  deviceToken: string,
  result: {
    actionId: string;
    status: "done" | "failed";
    permalink?: string;
    errorMessage?: string;
  }
): Promise<void> {
  await convexCall(convexUrl, "mutation", "extension:reportActionResult", {
    deviceToken,
    actionId: result.actionId,
    status: result.status,
    permalink: result.permalink,
    errorMessage: result.errorMessage,
  });
}

export async function sendHeartbeat(
  convexUrl: string,
  deviceToken: string,
  redditConnected: boolean
): Promise<void> {
  await convexCall(convexUrl, "mutation", "extension:heartbeat", {
    deviceToken,
    redditConnected,
  });
}

export async function getSyncRequested(
  convexUrl: string,
  deviceToken: string
): Promise<{ shouldSync: boolean }> {
  return convexCall(convexUrl, "query", "conversationSync:getSyncRequested", {
    deviceToken,
  });
}

export async function ingestInboxMessages(
  convexUrl: string,
  deviceToken: string,
  messages: InboxMessage[]
): Promise<{ inserted: number; deduped: number }> {
  return convexCall(convexUrl, "mutation", "conversationSync:ingestInboxMessages", {
    deviceToken,
    messages,
  });
}

export async function markInboxSynced(
  convexUrl: string,
  deviceToken: string
): Promise<void> {
  await convexCall(convexUrl, "mutation", "conversationSync:markInboxSynced", {
    deviceToken,
  });
}

export async function setWorkerPaused(
  convexUrl: string,
  deviceToken: string,
  paused: boolean,
  reason?: string
): Promise<void> {
  await convexCall(convexUrl, "mutation", "extension:setExtensionPaused", {
    deviceToken,
    paused,
    reason,
  });
}

export async function reportThrottle(
  convexUrl: string,
  deviceToken: string,
  reason: string
): Promise<void> {
  await convexCall(convexUrl, "mutation", "extension:reportThrottle", {
    deviceToken,
    reason,
  });
}
