import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  generateDeviceToken,
  hashDeviceToken,
  requireDeviceSession,
  resolveWorkspaceId,
} from "./lib/deviceAuth";
import { buildSourceDedupeKey } from "./lib/leadLogic";
import { transitionCandidateStat } from "./lib/candidateStats";
import { platformValidator, watchRuleValidator } from "./lib/validators";

const rawCandidateValidator = v.object({
  platform: platformValidator,
  handle: v.string(),
  subreddit: v.string(),
  snippet: v.string(),
  postBody: v.string(),
  url: v.string(),
  profileHints: v.optional(v.string()),
  postedAt: v.number(),
  sourceId: v.string(),
});

const approvedActionValidator = v.object({
  _id: v.id("actions"),
  leadId: v.id("leads"),
  type: v.union(v.literal("comment"), v.literal("dm")),
  targetUrl: v.string(),
  content: v.string(),
  createdAt: v.number(),
});

export const pairDevice = mutation({
  args: {
    pairingCode: v.string(),
    workspaceId: v.string(),
    label: v.optional(v.string()),
    executorKind: v.optional(
      v.union(v.literal("extension"), v.literal("worker"))
    ),
  },
  returns: v.object({
    deviceToken: v.string(),
    workspaceId: v.id("workspaces"),
  }),
  handler: async (ctx, args) => {
    const secret = process.env.EXTENSION_PAIRING_SECRET;
    if (!secret || args.pairingCode !== secret) {
      throw new Error("Invalid pairing code");
    }

    const workspaceId = await resolveWorkspaceId(ctx, args.workspaceId);
    const deviceToken = generateDeviceToken();
    const tokenHash = await hashDeviceToken(deviceToken);

    await ctx.db.insert("deviceTokens", {
      workspaceId,
      tokenHash,
      label: args.label,
      executorKind: args.executorKind ?? "extension",
      pairedAt: Date.now(),
      extensionPaused: false,
    });

    return { deviceToken, workspaceId };
  },
});

export const getWatchRules = query({
  args: { deviceToken: v.string() },
  returns: v.array(watchRuleValidator),
  handler: async (ctx, args) => {
    const { workspace } = await requireDeviceSession(ctx, args.deviceToken);
    const rules = await ctx.db
      .query("watchRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    return rules
      .filter((rule) => rule.enabled)
      .map((rule) => ({
        _id: rule._id,
        type: rule.type,
        value: rule.value,
        enabled: rule.enabled,
        noPromo: rule.noPromo,
      }));
  },
});

export const getWorkspacePacing = query({
  args: { deviceToken: v.string() },
  returns: v.object({
    dailySendCeiling: v.number(),
    minGapMinutes: v.number(),
    sendsToday: v.number(),
    killSwitch: v.boolean(),
    autoPauseOnThrottle: v.boolean(),
    nextSendWindowAt: v.optional(v.number()),
    extensionPaused: v.boolean(),
    pauseReason: v.optional(v.string()),
    sessionActive: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { session, workspace } = await requireDeviceSession(ctx, args.deviceToken);
    return {
      dailySendCeiling: workspace.dailySendCeiling,
      minGapMinutes: workspace.minGapMinutes,
      sendsToday: workspace.sendsToday,
      killSwitch: workspace.killSwitch,
      autoPauseOnThrottle: workspace.autoPauseOnThrottle,
      nextSendWindowAt: workspace.nextSendWindowAt,
      extensionPaused: session.extensionPaused,
      pauseReason: session.pauseReason,
      sessionActive: workspace.sessionActive,
    };
  },
});

type RawCandidateInput = {
  platform: "reddit" | "instagram";
  handle: string;
  subreddit: string;
  snippet: string;
  postBody: string;
  url: string;
  profileHints?: string;
  postedAt: number;
  sourceId: string;
};

async function ingestOneCandidate(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  candidate: RawCandidateInput
): Promise<"inserted" | "deduped"> {
  const sourceId = candidate.sourceId.trim();
  if (!sourceId) return "deduped";

  const existing = await ctx.db
    .query("candidates")
    .withIndex("by_workspace_and_source", (q) =>
      q.eq("workspaceId", workspaceId).eq("sourceId", sourceId)
    )
    .first();

  if (existing) return "deduped";

  const candidateId = await ctx.db.insert("candidates", {
    workspaceId,
    platform: candidate.platform,
    handle: candidate.handle,
    subreddit: candidate.subreddit,
    snippet: candidate.snippet,
    postBody: candidate.postBody,
    url: candidate.url,
    profileHints: candidate.profileHints,
    sourceId,
    postedAt: candidate.postedAt,
    status: "raw",
    pipelineStage: "raw",
  });

  await transitionCandidateStat(ctx, workspaceId, null, "raw");
  await ctx.scheduler.runAfter(0, internal.pipelineAi.classify, { candidateId });
  return "inserted";
}

export const ingestCandidates = mutation({
  args: {
    deviceToken: v.string(),
    candidates: v.array(rawCandidateValidator),
  },
  returns: v.object({ inserted: v.number(), deduped: v.number() }),
  handler: async (ctx, args) => {
    const { workspace } = await requireDeviceSession(ctx, args.deviceToken);

    let inserted = 0;
    let deduped = 0;

    for (const candidate of args.candidates) {
      buildSourceDedupeKey(candidate.platform, candidate.sourceId);
      const result = await ingestOneCandidate(ctx, workspace._id, candidate);
      if (result === "inserted") inserted += 1;
      else deduped += 1;
    }

    const now = Date.now();
    await ctx.db.patch("workspaces", workspace._id, {
      lastPollAt: now,
      nextPollAt: now + 15 * 60 * 1000,
    });

    await ctx.db.insert("events", {
      workspaceId: workspace._id,
      type: "discovery.ingest",
      message: `Extension ingested ${inserted} new · ${deduped} deduped`,
      createdAt: now,
    });

    return { inserted, deduped };
  },
});

export const ingestCandidate = mutation({
  args: {
    deviceToken: v.string(),
    candidate: rawCandidateValidator,
  },
  returns: v.object({ inserted: v.number(), deduped: v.number() }),
  handler: async (ctx, args) => {
    const { workspace } = await requireDeviceSession(ctx, args.deviceToken);
    const result = await ingestOneCandidate(ctx, workspace._id, args.candidate);
    return {
      inserted: result === "inserted" ? 1 : 0,
      deduped: result === "deduped" ? 1 : 0,
    };
  },
});

export const claimApprovedAction = mutation({
  args: { deviceToken: v.string() },
  returns: v.union(approvedActionValidator, v.null()),
  handler: async (ctx, args) => {
    const { session, workspace } = await requireDeviceSession(ctx, args.deviceToken);

    if (
      workspace.killSwitch ||
      session.extensionPaused ||
      workspace.sendsToday >= workspace.dailySendCeiling
    ) {
      return null;
    }

    const now = Date.now();
    if (workspace.nextSendWindowAt && workspace.nextSendWindowAt > now) {
      return null;
    }

    const approved = await ctx.db
      .query("actions")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", workspace._id).eq("status", "approved")
      )
      .collect();

    const action = approved.sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!action) return null;

    await ctx.db.patch("actions", action._id, { status: "executing" });

    return {
      _id: action._id,
      leadId: action.leadId,
      type: action.type ?? "comment",
      targetUrl: action.targetUrl ?? "",
      content: action.content ?? "",
      createdAt: action.createdAt,
    };
  },
});

export const reportActionResult = mutation({
  args: {
    deviceToken: v.string(),
    actionId: v.id("actions"),
    status: v.union(v.literal("done"), v.literal("failed")),
    permalink: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspace } = await requireDeviceSession(ctx, args.deviceToken);
    const action = await ctx.db.get("actions", args.actionId);
    if (!action || action.workspaceId !== workspace._id) {
      throw new Error("Action not found");
    }

    const now = Date.now();

    if (args.status === "done") {
      await ctx.db.patch("actions", args.actionId, {
        status: "done",
        permalink: args.permalink,
        completedAt: now,
      });
      await ctx.db.patch("leads", action.leadId, {
        permalink: args.permalink,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("actions", args.actionId, {
        status: "failed",
        error: args.errorMessage ?? "Execution failed",
        completedAt: now,
      });
    }

    await ctx.db.insert("events", {
      workspaceId: workspace._id,
      type: args.status === "done" ? "action.done" : "action.failed",
      message:
        args.status === "done"
          ? `Action ${args.actionId} completed`
          : `Action ${args.actionId} failed: ${args.errorMessage ?? "unknown"}`,
      createdAt: now,
    });

    return null;
  },
});

export const heartbeat = mutation({
  args: {
    deviceToken: v.string(),
    redditConnected: v.boolean(),
    lastDiscoveryAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { session, workspace } = await requireDeviceSession(ctx, args.deviceToken);
    const now = Date.now();

    await ctx.db.patch("deviceTokens", session._id, {
      lastSeenAt: now,
    });

    await ctx.db.patch("workspaces", workspace._id, {
      redditConnected: args.redditConnected,
      sessionActive: args.redditConnected,
      ...(args.lastDiscoveryAt !== undefined
        ? { lastPollAt: args.lastDiscoveryAt }
        : {}),
    });

    return null;
  },
});

export const setExtensionPaused = mutation({
  args: {
    deviceToken: v.string(),
    paused: v.boolean(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { session } = await requireDeviceSession(ctx, args.deviceToken);
    await ctx.db.patch("deviceTokens", session._id, {
      extensionPaused: args.paused,
      pauseReason: args.paused ? args.reason : undefined,
    });
    return null;
  },
});

export const reportActivity = mutation({
  args: {
    deviceToken: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspace } = await requireDeviceSession(ctx, args.deviceToken);
    await ctx.db.insert("events", {
      workspaceId: workspace._id,
      type: "discovery.activity",
      message: args.message,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const reportThrottle = mutation({
  args: {
    deviceToken: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { session, workspace } = await requireDeviceSession(ctx, args.deviceToken);

    if (workspace.autoPauseOnThrottle) {
      await ctx.db.patch("deviceTokens", session._id, {
        extensionPaused: true,
        pauseReason: args.reason,
      });
    }

    await ctx.db.insert("events", {
      workspaceId: workspace._id,
      type: "extension.throttle",
      message: args.reason,
      createdAt: Date.now(),
    });

    return null;
  },
});
