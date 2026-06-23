import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { intentValidator, leadStatusValidator } from "./lib/validators";

export const getStats = query({
  args: {},
  returns: v.object({
    total: v.number(),
    stages: v.object({
      new: v.number(),
      contacted: v.number(),
      replied: v.number(),
      in_conversation: v.number(),
      qualified: v.number(),
      won: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", "default"))
      .unique();

    if (!workspace) {
      return {
        total: 0,
        stages: {
          new: 0,
          contacted: 0,
          replied: 0,
          in_conversation: 0,
          qualified: 0,
          won: 0,
        },
      };
    }

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const active = leads.filter(
      (l) => l.status !== "dismissed" && l.status !== "snoozed"
    );

    const count = (status: string) =>
      active.filter((l) => l.status === status).length;

    return {
      total: active.length,
      stages: {
        new: count("new") + count("queued"),
        contacted: count("contacted"),
        replied: count("replied"),
        in_conversation: count("in_conversation"),
        qualified: count("qualified"),
        won: count("won"),
      },
    };
  },
});

export const listLeads = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("leads"),
      handle: v.string(),
      subreddit: v.string(),
      intent: intentValidator,
      score: v.number(),
      lastMessageSent: v.optional(v.string()),
      status: leadStatusValidator,
    })
  ),
  handler: async (ctx) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", "default"))
      .unique();
    if (!workspace) return [];

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    return leads
      .filter((l) => l.status !== "dismissed" && l.status !== "snoozed")
      .sort((a, b) => b.score - a.score)
      .map((l) => ({
        _id: l._id,
        handle: l.handle,
        subreddit: l.subreddit,
        intent: l.intent,
        score: l.score,
        lastMessageSent: l.lastMessageSent,
        status: l.status,
      }));
  },
});

export const advance = mutation({
  args: {
    leadId: v.id("leads"),
    status: leadStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("leads", args.leadId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});
