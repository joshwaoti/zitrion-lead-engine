import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { ensureSeedData } from "./lib/workspace";
import {
  intentValidator,
  leadStatusValidator,
} from "./lib/validators";

const queueItemValidator = v.object({
  _id: v.id("leads"),
  handle: v.string(),
  subreddit: v.string(),
  intent: intentValidator,
  score: v.number(),
  snippet: v.string(),
  status: leadStatusValidator,
});

const queueLeadDetailValidator = v.object({
  lead: v.object({
    _id: v.id("leads"),
    handle: v.string(),
    subreddit: v.string(),
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
      type: v.optional(v.union(v.literal("comment"), v.literal("dm"))),
      goal: v.optional(
        v.union(
          v.literal("help_first"),
          v.literal("soft_pitch"),
          v.literal("direct")
        )
      ),
      variantA: v.string(),
      variantB: v.string(),
      chosenVariant: v.optional(v.union(v.literal("a"), v.literal("b"))),
      editedContent: v.optional(v.string()),
      groundedRefs: v.array(v.string()),
    }),
    v.null()
  ),
});

export const bootstrap = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ensureSeedData(ctx);
    return null;
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
        handle: lead.handle,
        subreddit: lead.subreddit,
        intent: lead.intent,
        score: lead.score,
        snippet:
          lead.threadSnippet.slice(0, 80) +
          (lead.threadSnippet.length > 80 ? "…" : ""),
        status: lead.status,
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
        handle: lead.handle,
        subreddit: lead.subreddit,
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) throw new Error("Lead not found");

    const draft = await ctx.db.get("drafts", args.draftId);
    if (!draft) throw new Error("Draft not found");

    const actionType = draft.type ?? "comment";
    const targetUrl =
      args.targetUrl ??
      lead.threadUrl ??
      (lead.subreddit.startsWith("r/")
        ? `https://www.reddit.com/${lead.subreddit}`
        : `https://www.reddit.com/r/${lead.subreddit.replace(/^r\//, "")}`);

    await ctx.db.patch("drafts", args.draftId, {
      status: "approved",
      editedContent: args.content,
    });

    const now = Date.now();
    await ctx.db.patch("leads", args.leadId, {
      status: "contacted",
      lastMessageSent: args.content.slice(0, 120),
      threadUrl: targetUrl,
      updatedAt: now,
    });

    await ctx.db.insert("actions", {
      leadId: args.leadId,
      workspaceId: lead.workspaceId,
      type: actionType,
      targetUrl,
      status: "approved",
      content: args.content,
      createdAt: now,
    });

    const workspace = await ctx.db.get("workspaces", lead.workspaceId);
    if (workspace) {
      await ctx.db.patch("workspaces", workspace._id, {
        sendsToday: workspace.sendsToday + 1,
        nextSendWindowAt: now + workspace.minGapMinutes * 60 * 1000,
      });
    }

    return null;
  },
});

export const editDraft = mutation({
  args: {
    draftId: v.id("drafts"),
    content: v.string(),
    type: v.optional(v.union(v.literal("comment"), v.literal("dm"))),
    goal: v.optional(
      v.union(
        v.literal("help_first"),
        v.literal("soft_pitch"),
        v.literal("direct")
      )
    ),
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
  args: { draftId: v.id("drafts"), leadId: v.id("leads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) throw new Error("Lead not found");

    await ctx.db.patch("drafts", args.draftId, { status: "regenerating" });

    await ctx.db.insert("events", {
      workspaceId: lead.workspaceId,
      type: "draft_regenerate",
      message: `Regenerate requested for lead ${args.leadId}`,
      createdAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.pipelineAi.regenerateDraft, {
      draftId: args.draftId,
      leadId: args.leadId,
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
