import type {
  ApprovedAction,
  RawCandidate,
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

export async function pairDevice(
  convexUrl: string,
  pairingCode: string,
  workspaceId: string,
  label?: string
): Promise<{ deviceToken: string; workspaceId: string }> {
  return convexCall(convexUrl, "mutation", "extension:pairDevice", {
    pairingCode,
    workspaceId,
    label,
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
): Promise<WorkspacePacing & { extensionPaused: boolean; pauseReason?: string; sessionActive: boolean }> {
  return convexCall(convexUrl, "query", "extension:getWorkspacePacing", {
    deviceToken,
  });
}

export async function ingestCandidates(
  convexUrl: string,
  deviceToken: string,
  candidates: RawCandidate[]
): Promise<{ inserted: number; deduped: number }> {
  if (candidates.length === 0) {
    return { inserted: 0, deduped: 0 };
  }

  return convexCall(convexUrl, "mutation", "extension:ingestCandidates", {
    deviceToken,
    candidates,
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
    ...result,
  });
}

export async function sendHeartbeat(
  convexUrl: string,
  deviceToken: string,
  redditConnected: boolean,
  lastDiscoveryAt?: number
): Promise<void> {
  await convexCall(convexUrl, "mutation", "extension:heartbeat", {
    deviceToken,
    redditConnected,
    lastDiscoveryAt,
  });
}

export async function setExtensionPaused(
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
