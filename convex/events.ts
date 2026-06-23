import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

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
