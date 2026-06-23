import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const createInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    type: v.union(v.literal("comment"), v.literal("dm")),
    variants: v.array(v.object({ body: v.string() })),
    status: v.union(v.literal("pending"), v.literal("skipped")),
    skip: v.optional(v.boolean()),
    skipReason: v.optional(v.string()),
  },
  returns: v.id("drafts"),
  handler: async (ctx, args) => {
    const variantA = args.variants[0]?.body ?? args.skipReason ?? "";
    const variantB = args.variants[1]?.body ?? variantA;
    return await ctx.db.insert("drafts", {
      leadId: args.leadId,
      workspaceId: args.workspaceId,
      type: args.type,
      goal: "help_first",
      variantA,
      variantB,
      groundedRefs: [],
      status: "pending",
    });
  },
});

export const updateInternal = internalMutation({
  args: {
    draftId: v.id("drafts"),
    variantA: v.string(),
    variantB: v.string(),
    status: v.union(v.literal("pending"), v.literal("regenerating")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("drafts", args.draftId, {
      variantA: args.variantA,
      variantB: args.variantB,
      status: args.status,
      editedContent: undefined,
    });
    return null;
  },
});
