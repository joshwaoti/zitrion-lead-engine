import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
  ensureSeedData,
  clearWorkspaceOperationalData,
  resetDefaultWatchRules,
  syncDefaultModelConfig,
  applyDefaultPacing,
} from "./lib/workspace";
import {
  intentValidator,
  leadStatusValidator,
} from "./lib/validators";

const draftTypeValidator = v.union(v.literal("comment"), v.literal("dm"));
const draftGoalValidator = v.union(
  v.literal("help_first"),
  v.literal("soft_pitch"),
  v.literal("direct")
);
const platformValidator = v.union(v.literal("reddit"), v.literal("instagram"));

const queueItemValidator = v.object({
  _id: v.id("leads"),
  platform: platformValidator,
  handle: v.string(),
  subreddit: v.string(),
  intent: intentValidator,
  score: v.number(),
  snippet: v.string(),
  status: leadStatusValidator,
  recommendedAction: draftTypeValidator,
});

const queueLeadDetailValidator = v.object({
  lead: v.object({
    _id: v.id("leads"),
    platform: platformValidator,
    handle: v.string(),
    subreddit: v.string(),
    threadUrl: v.optional(v.string()),
    intent: intentValidator,
    score: v.number(),
    contextCard: v.string(),
    threadSnippet: v.string(),
    threadMeta: v.string(),
    subreddits: v.array(v.string()),
    profileMeta: v.string(),
    scoreBreakdown: v.object({
      intentStrength: v.number(),
      serviceFit: v.number(),
      decisionMaker: v.number(),
      threadVisibility: v.number(),
    }),
  }),
  draft: v.union(
    v.object({
      _id: v.id("drafts"),
      type: v.optional(draftTypeValidator),
      goal: v.optional(draftGoalValidator),
      variantA: v.string(),
      variantB: v.string(),
      chosenVariant: v.optional(v.union(v.literal("a"), v.literal("b"))),
      editedContent: v.optional(v.string()),
      groundedRefs: v.array(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("regenerating")
      ),
    }),
    v.null()
  ),
});

function recommendedAction(lead: {
  platform?: "reddit" | "instagram";
  intent: "active_buying" | "problem_statement" | "competitor_mention" | "flagged" | "irrelevant";
  score: number;
}): "comment" | "dm" {
  if (lead.platform === "instagram") return "dm";
  if (lead.intent === "active_buying" && lead.score >= 75) return "dm";
  return "comment";
}

export const bootstrap = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ensureSeedData(ctx);
    return null;
  },
});

export const clearDemoData = mutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    return await clearWorkspaceOperationalData(ctx);
  },
});

export const syncLiveDefaults = mutation({
  args: {},
  returns: v.object({
    watchRules: v.object({ subredditCount: v.number(), keywordCount: v.number() }),
    requeued: v.number(),
    pacing: v.object({ dailySendCeiling: v.number(), minGapMinutes: v.number() }),
  }),
  handler: async (ctx): Promise<{
    watchRules: { subredditCount: number; keywordCount: number };
    requeued: number;
    pacing: { dailySendCeiling: number; minGapMinutes: number };
  }> => {
    await ensureSeedData(ctx);
    const watchRules = await resetDefaultWatchRules(ctx);
    await syncDefaultModelConfig(ctx);
    const pacing = await applyDefaultPacing(ctx);
    const requeued: number = await ctx.runMutation(internal.candidates.requeueStuckInternal, {
      maxAgeMs: 0,
    });
    return { watchRules, requeued, pacing };
  },
});

export const list = query({
  args: {},
  returns: v.array(queueItemValidator),
  handler: async (ctx) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", "default"))
      .unique();

    if (!workspace) return [];

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", workspace._id).eq("status", "queued")
      )
      .collect();

    return leads
      .sort((a, b) => b.score - a.score)
      .map((lead) => ({
        _id: lead._id,
        platform: lead.platform ?? "reddit",
        handle: lead.handle,
        subreddit: lead.subreddit,
        intent: lead.intent,
        score: lead.score,
        snippet:
          lead.threadSnippet.slice(0, 80) +
          (lead.threadSnippet.length > 80 ? "…" : ""),
        status: lead.status,
        recommendedAction: recommendedAction({
          platform: lead.platform ?? "reddit",
          intent: lead.intent,
          score: lead.score,
        }),
      }));
  },
});

export const getDetail = query({
  args: { leadId: v.id("leads") },
  returns: v.union(queueLeadDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) return null;

    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_lead", (q) => q.eq("leadId", args.leadId))
      .first();

    return {
      lead: {
        _id: lead._id,
        platform: lead.platform ?? "reddit",
        handle: lead.handle,
        subreddit: lead.subreddit,
        threadUrl: lead.threadUrl,
        intent: lead.intent,
        score: lead.score,
        contextCard: lead.contextCard,
        threadSnippet: lead.threadSnippet,
        threadMeta: lead.threadMeta,
        subreddits: lead.subreddits,
        profileMeta: lead.profileMeta,
        scoreBreakdown: lead.scoreBreakdown,
      },
      draft: draft
        ? {
            _id: draft._id,
            type: draft.type,
            goal: draft.goal,
            variantA: draft.variantA,
            variantB: draft.variantB,
            chosenVariant: draft.chosenVariant,
            editedContent: draft.editedContent,
            groundedRefs: draft.groundedRefs,
            status: draft.status,
          }
        : null,
    };
  },
});

export const approve = mutation({
  args: {
    leadId: v.id("leads"),
    draftId: v.id("drafts"),
    content: v.string(),
    targetUrl: v.optional(v.string()),
    type: v.optional(draftTypeValidator),
    goal: v.optional(draftGoalValidator),
    chosenVariant: v.optional(v.union(v.literal("a"), v.literal("b"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) throw new Error("Lead not found");

    const draft = await ctx.db.get("drafts", args.draftId);
    if (!draft) throw new Error("Draft not found");

    await ctx.db.patch("drafts", args.draftId, {
      status: "approved",
      editedContent: args.content,
      ...(args.type !== undefined ? { type: args.type } : {}),
      ...(args.goal !== undefined ? { goal: args.goal } : {}),
      ...(args.chosenVariant !== undefined
        ? { chosenVariant: args.chosenVariant }
        : {}),
    });

    await ctx.db.patch("leads", args.leadId, {
      ...(args.targetUrl !== undefined ? { threadUrl: args.targetUrl } : {}),
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const markSent = mutation({
  args: {
    leadId: v.id("leads"),
    draftId: v.id("drafts"),
    content: v.string(),
    targetUrl: v.optional(v.string()),
    type: v.optional(draftTypeValidator),
    permalink: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) throw new Error("Lead not found");

    const draft = await ctx.db.get("drafts", args.draftId);
    if (!draft) throw new Error("Draft not found");

    const now = Date.now();
    await ctx.db.patch("drafts", args.draftId, {
      status: "approved",
      editedContent: args.content,
      ...(args.type !== undefined ? { type: args.type } : {}),
    });

    await ctx.db.patch("leads", args.leadId, {
      status: "contacted",
      lastMessageSent: args.content.slice(0, 120),
      ...(args.targetUrl !== undefined ? { threadUrl: args.targetUrl } : {}),
      ...(args.permalink !== undefined ? { permalink: args.permalink } : {}),
      updatedAt: now,
    });

    const workspace = await ctx.db.get("workspaces", lead.workspaceId);
    if (workspace) {
      await ctx.db.patch("workspaces", workspace._id, {
        sendsToday: workspace.sendsToday + 1,
        nextSendWindowAt: now + workspace.minGapMinutes * 60 * 1000,
      });
    }

    await ctx.db.insert("events", {
      workspaceId: lead.workspaceId,
      type: "manual_send",
      message: `Marked ${lead.handle} as contacted manually`,
      createdAt: now,
    });

    return null;
  },
});

export const editDraft = mutation({
  args: {
    draftId: v.id("drafts"),
    content: v.string(),
    type: v.optional(draftTypeValidator),
    goal: v.optional(draftGoalValidator),
    chosenVariant: v.optional(v.union(v.literal("a"), v.literal("b"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { draftId, content, type, goal, chosenVariant } = args;
    await ctx.db.patch("drafts", draftId, {
      editedContent: content,
      ...(type !== undefined ? { type } : {}),
      ...(goal !== undefined ? { goal } : {}),
      ...(chosenVariant !== undefined ? { chosenVariant } : {}),
    });
    return null;
  },
});

export const regenerate = mutation({
  args: {
    draftId: v.id("drafts"),
    leadId: v.id("leads"),
    type: v.optional(draftTypeValidator),
    goal: v.optional(draftGoalValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) throw new Error("Lead not found");

    await ctx.db.patch("drafts", args.draftId, {
      status: "regenerating",
      ...(args.type !== undefined ? { type: args.type } : {}),
      ...(args.goal !== undefined ? { goal: args.goal } : {}),
    });

    await ctx.db.insert("events", {
      workspaceId: lead.workspaceId,
      type: "draft_regenerate",
      message: `Regenerate requested for lead ${args.leadId}`,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.pipelineAi.regenerateDraft, {
      draftId: args.draftId,
      leadId: args.leadId,
      type: args.type,
      goal: args.goal,
    });

    return null;
  },
});

export const snooze = mutation({
  args: { leadId: v.id("leads"), hours: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hours = args.hours ?? 24;
    await ctx.db.patch("leads", args.leadId, {
      status: "snoozed",
      snoozedUntil: Date.now() + hours * 3600000,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const dismiss = mutation({
  args: { leadId: v.id("leads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("leads", args.leadId, {
      status: "dismissed",
      updatedAt: Date.now(),
    });
    return null;
  },
});
