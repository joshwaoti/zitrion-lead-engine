import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getWorkspace, requireDefaultWorkspace } from "./lib/workspace";
import { intentValidator, platformValidator, scoreBreakdownValidator } from "./lib/validators";

const candidateInternalValidator = v.object({
  _id: v.id("candidates"),
  workspaceId: v.id("workspaces"),
  platform: platformValidator,
  handle: v.string(),
  subreddit: v.string(),
  snippet: v.string(),
  postBody: v.optional(v.string()),
  url: v.string(),
  profileHints: v.optional(v.string()),
  classification: v.optional(intentValidator),
  confidence: v.optional(v.number()),
  score: v.optional(v.number()),
  scoreBreakdown: v.optional(scoreBreakdownValidator),
  contextCard: v.optional(v.string()),
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
  skipReason: v.optional(v.string()),
  postedAt: v.number(),
});

export const getInternal = internalQuery({
  args: { candidateId: v.id("candidates") },
  returns: v.union(candidateInternalValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("candidates", args.candidateId);
  },
});

export const setProcessingInternal = internalMutation({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("candidates", args.candidateId, {
      status: "processing",
      pipelineStage: "raw",
    });
    return null;
  },
});

export const applyClassifyInternal = internalMutation({
  args: {
    candidateId: v.id("candidates"),
    classification: intentValidator,
    confidence: v.number(),
    status: v.union(v.literal("classified"), v.literal("irrelevant"), v.literal("dismissed")),
    skipReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("candidates", args.candidateId, {
      classification: args.classification,
      confidence: args.confidence,
      status: args.status,
      pipelineStage: args.status === "classified" ? "classified" : "skipped",
      skipReason: args.skipReason,
    });
    return null;
  },
});

export const applyScoreInternal = internalMutation({
  args: {
    candidateId: v.id("candidates"),
    score: v.number(),
    scoreBreakdown: scoreBreakdownValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("candidates", args.candidateId, {
      score: args.score,
      scoreBreakdown: args.scoreBreakdown,
      pipelineStage: "scored",
    });
    return null;
  },
});

export const applyResearchInternal = internalMutation({
  args: {
    candidateId: v.id("candidates"),
    contextCard: v.string(),
    profileMeta: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("candidates", args.candidateId, {
      contextCard: args.contextCard,
      profileMeta: args.profileMeta,
      pipelineStage: "researched",
    });
    return null;
  },
});

export const markPromotedInternal = internalMutation({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("candidates", args.candidateId, {
      status: "promoted",
      pipelineStage: "promoted",
    });
    return null;
  },
});

export const skipInternal = internalMutation({
  args: { candidateId: v.id("candidates"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("candidates", args.candidateId, {
      status: "dismissed",
      pipelineStage: "skipped",
      skipReason: args.reason,
    });
    return null;
  },
});

export const ingest = mutation({
  args: {
    platform: platformValidator,
    handle: v.string(),
    subreddit: v.string(),
    snippet: v.string(),
    postBody: v.optional(v.string()),
    url: v.string(),
    profileHints: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    postedAt: v.number(),
  },
  returns: v.id("candidates"),
  handler: async (ctx, args) => {
    const workspace = await requireDefaultWorkspace(ctx);
    if (args.sourceId) {
      const existing = await ctx.db
        .query("candidates")
        .withIndex("by_workspace_and_source", (q) =>
          q.eq("workspaceId", workspace._id).eq("sourceId", args.sourceId)
        )
        .first();
      if (existing) return existing._id;
    }

    const candidateId = await ctx.db.insert("candidates", {
      workspaceId: workspace._id,
      platform: args.platform,
      handle: args.handle,
      subreddit: args.subreddit,
      snippet: args.snippet,
      postBody: args.postBody,
      url: args.url,
      profileHints: args.profileHints,
      sourceId: args.sourceId,
      status: "raw",
      pipelineStage: "raw",
      postedAt: args.postedAt,
    });

    await ctx.scheduler.runAfter(0, internal.pipelineAi.classify, { candidateId });
    return candidateId;
  },
});

export const listFeed = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("candidates"),
      handle: v.string(),
      subreddit: v.string(),
      snippet: v.string(),
      status: v.string(),
      postedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) return [];
    const rows = await ctx.db
      .query("candidates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();
    return rows
      .sort((a, b) => b.postedAt - a.postedAt)
      .slice(0, args.limit ?? 50)
      .map((candidate) => ({
        _id: candidate._id,
        handle: candidate.handle,
        subreddit: candidate.subreddit,
        snippet: candidate.snippet,
        status: candidate.status,
        postedAt: candidate.postedAt,
      }));
  },
});
