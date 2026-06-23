import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getWorkspace } from "./lib/workspace";

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
  postedAt: v.number(),
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

    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const queuedCount = await ctx.db
      .query("leads")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", workspace._id).eq("status", "queued")
      )
      .collect();

    return {
      subreddits: rules.filter((r) => r.type === "subreddit"),
      keywords: rules.filter((r) => r.type === "keyword"),
      lastPollAt: workspace.lastPollAt,
      nextPollAt: workspace.nextPollAt,
      stats: {
        found: candidates.length + 20,
        surfaced: queuedCount.length,
        deduped: candidates.filter((c) => c.status === "deduped").length,
        irrelevant: candidates.filter((c) => c.status === "irrelevant").length,
      },
    };
  },
});

export const listCandidates = query({
  args: {},
  returns: v.array(candidateValidator),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) return [];

    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    return candidates
      .sort((a, b) => b.postedAt - a.postedAt)
      .map((candidate) => ({
        _id: candidate._id,
        handle: candidate.handle,
        subreddit: candidate.subreddit,
        snippet: candidate.snippet,
        classification: candidate.classification ?? "irrelevant",
        confidence: candidate.confidence ?? 0,
        status:
          candidate.status === "raw"
            ? ("classified" as const)
            : candidate.status,
        postedAt: candidate.postedAt,
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
      handle: candidate.handle,
      subreddit: candidate.subreddit,
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
      type: "comment",
      goal: "help_first",
      variantA: "Draft pending — run AI pipeline to generate.",
      variantB: "",
      groundedRefs: [],
      status: "pending",
    });

    await ctx.db.patch("candidates", args.candidateId, {
      status: "promoted",
    });

    return leadId;
  },
});

export const dismissCandidate = mutation({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("candidates", args.candidateId, {
      status: "dismissed",
    });
    return null;
  },
});
