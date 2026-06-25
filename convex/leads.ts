import { v } from "convex/values";
import type { ContextCard } from "@zitrion/core";
import { internalMutation, internalQuery } from "./_generated/server";
import { contextCardJson, contextCardToString } from "./lib/leadLogic";

export const getInternal = internalQuery({
  args: { leadId: v.id("leads") },
  returns: v.union(
    v.object({
      _id: v.id("leads"),
      workspaceId: v.id("workspaces"),
      handle: v.string(),
      subreddit: v.string(),
      threadSnippet: v.string(),
      contextCard: v.string(),
      candidateId: v.optional(v.id("candidates")),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) return null;
    return {
      _id: lead._id,
      workspaceId: lead.workspaceId,
      handle: lead.handle,
      subreddit: lead.subreddit,
      threadSnippet: lead.threadSnippet,
      contextCard: lead.contextCard,
      candidateId: lead.candidateId,
    };
  },
});

export const promoteFromCandidateInternal = internalMutation({
  args: {
    candidateId: v.id("candidates"),
    type: v.optional(v.union(v.literal("comment"), v.literal("dm"))),
    variantA: v.string(),
    variantB: v.string(),
    groundedRefs: v.array(v.string()),
  },
  returns: v.object({ leadId: v.id("leads"), draftId: v.id("drafts") }),
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get("candidates", args.candidateId);
    if (!candidate) throw new Error("Candidate not found");
    if (!candidate.classification) {
      throw new Error("Candidate must be classified before promotion");
    }

    const now = Date.now();
    const score = candidate.score ?? Math.round((candidate.confidence ?? 0) * 100);
    const scoreBreakdown = candidate.scoreBreakdown ?? {
      intentStrength: Math.round((candidate.confidence ?? 0) * 100),
      serviceFit: score,
      decisionMaker: 60,
      threadVisibility: 50,
    };

    const leadId = await ctx.db.insert("leads", {
      workspaceId: candidate.workspaceId,
      candidateId: candidate._id,
      platform: candidate.platform,
      handle: candidate.handle,
      subreddit: candidate.subreddit,
      threadUrl: candidate.url,
      intent: candidate.classification,
      score,
      contextCard:
        candidate.contextCard ?? contextCardToString(candidate.snippet, []),
      threadSnippet: candidate.snippet,
      threadMeta: `${candidate.subreddit} · recently`,
      subreddits: [candidate.subreddit],
      profileMeta: candidate.profileMeta ?? candidate.profileHints ?? "",
      status: "queued",
      scoreBreakdown,
      createdAt: now,
      updatedAt: now,
    });

    const draftId = await ctx.db.insert("drafts", {
      leadId,
      workspaceId: candidate.workspaceId,
      type: args.type ?? "comment",
      goal: "help_first",
      variantA: args.variantA,
      variantB: args.variantB,
      groundedRefs: args.groundedRefs,
      status: "pending",
    });

    return { leadId, draftId };
  },
});

export const setContextCardInternal = internalMutation({
  args: {
    leadId: v.id("leads"),
    contextCard: v.object({
      summary: v.string(),
      highlights: v.array(v.string()),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("leads", args.leadId, {
      contextCard: contextCardJson(args.contextCard),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export function parseLeadContextCard(contextCard: string): ContextCard {
  try {
    return JSON.parse(contextCard) as ContextCard;
  } catch {
    return { summary: contextCard, highlights: [] };
  }
}

export const getSheetDataInternal = internalQuery({
  args: { leadId: v.id("leads") },
  returns: v.union(
    v.object({
      lead: v.object({
        _id: v.id("leads"),
        workspaceId: v.id("workspaces"),
        platform: v.string(),
        handle: v.string(),
        sourceUrl: v.string(),
        intent: v.string(),
        score: v.number(),
        status: v.string(),
        createdAt: v.number(),
      }),
      lastAction: v.union(
        v.object({
          body: v.string(),
          executedAt: v.optional(v.number()),
          permalink: v.optional(v.string()),
        }),
        v.null()
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get("leads", args.leadId);
    if (!lead) return null;

    const actions = await ctx.db
      .query("actions")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", lead.workspaceId).eq("status", "done")
      )
      .collect();

    const lastAction = actions
      .filter((a) => a.leadId === lead._id)
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    return {
      lead: {
        _id: lead._id,
        workspaceId: lead.workspaceId,
        platform: lead.platform ?? "reddit",
        handle: lead.handle,
        sourceUrl: lead.threadUrl ?? "",
        intent: lead.intent,
        score: lead.score,
        status: lead.status,
        createdAt: lead.createdAt,
      },
      lastAction: lastAction
        ? {
            body: lastAction.content ?? "",
            executedAt: lastAction.completedAt,
            permalink: lastAction.permalink,
          }
        : null,
    };
  },
});
