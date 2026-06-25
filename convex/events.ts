import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getWorkspace } from "./lib/workspace";

export const recordInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    type: v.string(),
    message: v.string(),
    data: v.optional(v.string()),
    leadId: v.optional(v.id("leads")),
    draftId: v.optional(v.id("drafts")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("events", {
      workspaceId: args.workspaceId,
      type: args.type,
      message: args.message,
      createdAt: Date.now(),
    });
    return null;
  },
});

const eventItemValidator = v.object({
  _id: v.id("events"),
  type: v.string(),
  message: v.string(),
  createdAt: v.number(),
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(eventItemValidator),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) return [];

    const limit = Math.min(args.limit ?? 20, 50);
    const events = await ctx.db
      .query("events")
      .withIndex("by_workspace_and_created", (q) =>
        q.eq("workspaceId", workspace._id)
      )
      .order("desc")
      .take(limit);

    return events.map((event) => ({
      _id: event._id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt,
    }));
  },
});
