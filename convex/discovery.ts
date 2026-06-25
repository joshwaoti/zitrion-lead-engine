import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
  candidateStatusKey,
  readCandidateStats,
  rebuildCandidateStats,
  transitionCandidateStat,
} from "./lib/candidateStats";
import { getWorkspace, resetDefaultWatchRules } from "./lib/workspace";

const intentValidator = v.union(
  v.literal("active_buying"),
  v.literal("problem_statement"),
  v.literal("competitor_mention"),
  v.literal("flagged"),
  v.literal("irrelevant")
);

const watchRuleValidator = v.object({
  _id: v.id("watchRules"),
  type: v.union(v.literal("subreddit"), v.literal("keyword")),
  value: v.string(),
  enabled: v.boolean(),
  noPromo: v.optional(v.boolean()),
});

const candidateValidator = v.object({
  _id: v.id("candidates"),
  platform: v.union(v.literal("reddit"), v.literal("instagram")),
  handle: v.string(),
  subreddit: v.string(),
  snippet: v.string(),
  classification: v.optional(intentValidator),
  confidence: v.optional(v.number()),
  status: v.union(
    v.literal("raw"),
    v.literal("processing"),
    v.literal("classified"),
    v.literal("promoted"),
    v.literal("dismissed"),
    v.literal("deduped"),
    v.literal("irrelevant")
  ),
  pipelineStage: v.optional(v.string()),
  postedAt: v.number(),
  url: v.optional(v.string()),
});

export const getLiveStatus = query({
  args: {},
  returns: v.object({
    redditConnected: v.boolean(),
    sessionActive: v.boolean(),
    lastPollAt: v.optional(v.number()),
    nextPollAt: v.optional(v.number()),
    counts: v.object({
      raw: v.number(),
      processing: v.number(),
      classified: v.number(),
      irrelevant: v.number(),
      deduped: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) {
      return {
        redditConnected: false,
        sessionActive: false,
        counts: { raw: 0, processing: 0, classified: 0, irrelevant: 0, deduped: 0 },
      };
    }

    const counts = readCandidateStats(workspace.candidateStats);

    return {
      redditConnected: workspace.redditConnected,
      sessionActive: workspace.sessionActive,
      lastPollAt: workspace.lastPollAt,
      nextPollAt: workspace.nextPollAt,
      counts: {
        raw: counts.raw,
        processing: counts.processing,
        classified: counts.classified,
        irrelevant: counts.irrelevant,
        deduped: counts.deduped,
      },
    };
  },
});

export const getWatchRules = query({
  args: {},
  returns: v.object({
    subreddits: v.array(watchRuleValidator),
    keywords: v.array(watchRuleValidator),
    lastPollAt: v.optional(v.number()),
    nextPollAt: v.optional(v.number()),
    stats: v.object({
      found: v.number(),
      surfaced: v.number(),
      deduped: v.number(),
      irrelevant: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) {
      return {
        subreddits: [],
        keywords: [],
        stats: { found: 0, surfaced: 0, deduped: 0, irrelevant: 0 },
      };
    }

    const rules = await ctx.db
      .query("watchRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const counts = readCandidateStats(workspace.candidateStats);

    const mapWatchRule = (rule: (typeof rules)[number]) => ({
      _id: rule._id,
      type: rule.type,
      value: rule.value,
      enabled: rule.enabled,
      noPromo: rule.noPromo,
    });

    return {
      subreddits: rules
        .filter((r) => r.type === "subreddit")
        .map(mapWatchRule),
      keywords: rules.filter((r) => r.type === "keyword").map(mapWatchRule),
      lastPollAt: workspace.lastPollAt,
      nextPollAt: workspace.nextPollAt,
      stats: {
        found: counts.found,
        surfaced: counts.classified,
        deduped: counts.deduped,
        irrelevant: counts.irrelevant,
      },
    };
  },
});

export const listCandidates = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(candidateValidator),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) return [];

    const limit = Math.min(args.limit ?? 50, 100);
    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_workspace_and_posted", (q) =>
        q.eq("workspaceId", workspace._id)
      )
      .order("desc")
      .take(limit);

    return candidates.map((candidate) => ({
        _id: candidate._id,
        platform: candidate.platform,
        handle: candidate.handle,
        subreddit: candidate.subreddit,
        snippet: candidate.snippet,
        classification: candidate.classification,
        confidence: candidate.confidence,
        status: candidate.status,
        pipelineStage: candidate.pipelineStage,
        postedAt: candidate.postedAt,
        url: candidate.url,
      }));
  },
});

export const toggleWatchRule = mutation({
  args: { ruleId: v.id("watchRules"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("watchRules", args.ruleId, { enabled: args.enabled });
    return null;
  },
});

export const addWatchRule = mutation({
  args: {
    type: v.union(v.literal("subreddit"), v.literal("keyword")),
    value: v.string(),
  },
  returns: v.id("watchRules"),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");

    return await ctx.db.insert("watchRules", {
      workspaceId: workspace._id,
      type: args.type,
      value: args.value,
      enabled: true,
    });
  },
});

export const resetWatchRules = mutation({
  args: {},
  returns: v.object({ subredditCount: v.number(), keywordCount: v.number() }),
  handler: async (ctx) => {
    return await resetDefaultWatchRules(ctx);
  },
});

export const pollNow = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");

    const now = Date.now();
    await ctx.db.patch("workspaces", workspace._id, {
      lastPollAt: now,
      nextPollAt: now + 8 * 60 * 1000,
    });

    await ctx.db.insert("events", {
      workspaceId: workspace._id,
      type: "poll_now",
      message: "Manual poll triggered from dashboard",
      createdAt: now,
    });

    return null;
  },
});

/** Re-run AI classify on raw candidates (e.g. after fixing OpenRouter). */
export const reclassifyRaw = mutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ scheduled: v.number() }),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");

    const raw = await ctx.db
      .query("candidates")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", workspace._id).eq("status", "raw")
      )
      .take(args.limit ?? 500);

    const batch = raw;

    for (let i = 0; i < batch.length; i += 1) {
      const candidate = batch[i]!;
      await ctx.db.patch("candidates", candidate._id, {
        skipReason: undefined,
        pipelineStage: "raw",
      });
      await ctx.scheduler.runAfter(i * 3000, internal.pipelineAi.classify, {
        candidateId: candidate._id,
      });
    }

    const now = Date.now();
    await ctx.db.insert("events", {
      workspaceId: workspace._id,
      type: "pipeline.classify",
      message: `Re-classify scheduled for ${batch.length} raw candidate${batch.length === 1 ? "" : "s"}`,
      createdAt: now,
    });

    return { scheduled: batch.length };
  },
});

export const rebuildStats = mutation({
  args: {},
  returns: v.object({
    raw: v.number(),
    processing: v.number(),
    classified: v.number(),
    irrelevant: v.number(),
    deduped: v.number(),
    dismissed: v.number(),
    promoted: v.number(),
    found: v.number(),
  }),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");
    return await rebuildCandidateStats(ctx, workspace._id);
  },
});

export const promoteCandidate = mutation({
  args: { candidateId: v.id("candidates") },
  returns: v.id("leads"),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get("candidates", args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    if (!candidate.classification) {
      throw new Error("Candidate must be classified before promotion");
    }
    const confidence = candidate.confidence ?? 0;

    const leadId = await ctx.db.insert("leads", {
      workspaceId: candidate.workspaceId,
      candidateId: candidate._id,
      platform: candidate.platform,
      handle: candidate.handle,
      subreddit: candidate.subreddit,
      threadUrl: candidate.url,
      intent: candidate.classification,
      score: Math.round(confidence * 100),
      contextCard: "Promoted from discovery — awaiting research pipeline.",
      threadSnippet: candidate.snippet,
      threadMeta: `${candidate.subreddit} · recently`,
      subreddits: [candidate.subreddit],
      profileMeta: "",
      status: "queued",
      scoreBreakdown: {
        intentStrength: Math.round(confidence * 100),
        serviceFit: 70,
        decisionMaker: 60,
        threadVisibility: 50,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("drafts", {
      leadId,
      workspaceId: candidate.workspaceId,
      type: candidate.platform === "instagram" ? "dm" : "comment",
      goal: "help_first",
      variantA: "Draft pending — run AI pipeline to generate.",
      variantB: "",
      groundedRefs: [],
      status: "pending",
    });

    await ctx.db.patch("candidates", args.candidateId, {
      status: "promoted",
    });
    await transitionCandidateStat(ctx, candidate.workspaceId, "classified", "promoted");

    return leadId;
  },
});

export const dismissCandidate = mutation({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get("candidates", args.candidateId);
    if (!candidate) throw new Error("Candidate not found");

    await transitionCandidateStat(
      ctx,
      candidate.workspaceId,
      candidateStatusKey(candidate.status),
      "dismissed"
    );
    await ctx.db.patch("candidates", args.candidateId, {
      status: "dismissed",
    });
    return null;
  },
});
