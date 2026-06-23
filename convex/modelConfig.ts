import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { pipelineSectionValidator } from "./lib/validators";

/** Internal model-chain lookup for the OpenRouter gateway. */
export const getChainInternal = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    section: pipelineSectionValidator,
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("modelConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();

    if (!config) return [];

    switch (args.section) {
      case "classify":
        return config.classify;
      case "score":
        return config.score;
      case "research":
        return config.research;
      case "draft":
        return config.draft;
    }
  },
});
