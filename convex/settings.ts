import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getWorkspace } from "./lib/workspace";

const serviceCatalogValidator = v.array(
  v.object({
    name: v.string(),
    description: v.string(),
  })
);

export const getWorkspaceSettings = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("workspaces"),
      voiceGuide: v.string(),
      serviceCatalog: serviceCatalogValidator,
      dailySendCeiling: v.number(),
      minGapMinutes: v.number(),
      autoPauseOnThrottle: v.boolean(),
      killSwitch: v.boolean(),
      sendsToday: v.number(),
      ownerName: v.string(),
      ownerHandle: v.string(),
      sessionActive: v.boolean(),
      redditConnected: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) return null;

    return {
      _id: workspace._id,
      voiceGuide: workspace.voiceGuide,
      serviceCatalog: workspace.serviceCatalog,
      dailySendCeiling: workspace.dailySendCeiling,
      minGapMinutes: workspace.minGapMinutes,
      autoPauseOnThrottle: workspace.autoPauseOnThrottle,
      killSwitch: workspace.killSwitch,
      sendsToday: workspace.sendsToday,
      ownerName: workspace.ownerName,
      ownerHandle: workspace.ownerHandle,
      sessionActive: workspace.sessionActive,
      redditConnected: workspace.redditConnected,
    };
  },
});

/**
 * Internal: resolve the workspace's outbound voice (persona, voice guide,
 * service catalog) so the AI draft/score prompts speak as the operator and
 * pitch the operator's real services rather than the hardcoded default.
 */
export const getVoiceInternal = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    persona: v.string(),
    voiceGuide: v.string(),
    serviceCatalog: v.string(),
  }),
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get("workspaces", args.workspaceId);
    if (!workspace) {
      return { persona: "", voiceGuide: "", serviceCatalog: "" };
    }

    const catalog = workspace.serviceCatalog
      .map((service) =>
        service.description
          ? `${service.name}: ${service.description}`
          : service.name
      )
      .join("; ");

    const persona = workspace.ownerName
      ? `${workspace.ownerName} from ${workspace.name}`
      : workspace.name;

    return {
      persona,
      voiceGuide: workspace.voiceGuide ?? "",
      serviceCatalog: catalog,
    };
  },
});

export const updateVoiceGuide = mutation({
  args: { voiceGuide: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");
    await ctx.db.patch("workspaces", workspace._id, {
      voiceGuide: args.voiceGuide,
    });
    return null;
  },
});

export const updatePacing = mutation({
  args: {
    dailySendCeiling: v.optional(v.number()),
    minGapMinutes: v.optional(v.number()),
    autoPauseOnThrottle: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");

    if (args.dailySendCeiling !== undefined) {
      if (args.dailySendCeiling < 1 || args.dailySendCeiling > 200) {
        throw new Error("Daily send ceiling must be between 1 and 200");
      }
    }
    if (args.minGapMinutes !== undefined) {
      if (args.minGapMinutes < 1 || args.minGapMinutes > 60) {
        throw new Error("Min gap must be between 1 and 60 minutes");
      }
    }

    await ctx.db.patch("workspaces", workspace._id, {
      ...(args.dailySendCeiling !== undefined
        ? { dailySendCeiling: args.dailySendCeiling }
        : {}),
      ...(args.minGapMinutes !== undefined
        ? { minGapMinutes: args.minGapMinutes }
        : {}),
      ...(args.autoPauseOnThrottle !== undefined
        ? { autoPauseOnThrottle: args.autoPauseOnThrottle }
        : {}),
    });
    return null;
  },
});

export const toggleKillSwitch = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");
    await ctx.db.patch("workspaces", workspace._id, {
      killSwitch: args.enabled,
    });
    return null;
  },
});

export const getModelConfig = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("modelConfig"),
      classify: v.array(v.string()),
      score: v.array(v.string()),
      research: v.array(v.string()),
      draft: v.array(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) return null;

    const config = await ctx.db
      .query("modelConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .first();

    if (!config) return null;

    return {
      _id: config._id,
      classify: config.classify,
      score: config.score,
      research: config.research,
      draft: config.draft,
    };
  },
});

export const updateModelConfig = mutation({
  args: {
    section: v.union(
      v.literal("classify"),
      v.literal("score"),
      v.literal("research"),
      v.literal("draft")
    ),
    models: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) throw new Error("Workspace not found");

    const config = await ctx.db
      .query("modelConfig")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .first();

    if (!config) throw new Error("Model config not found");

    await ctx.db.patch("modelConfig", config._id, {
      [args.section]: args.models,
    });
    return null;
  },
});

export const getSidebarStats = query({
  args: {},
  returns: v.object({
    queueCount: v.number(),
    pipelineCount: v.number(),
    sendsToday: v.number(),
    dailySendCeiling: v.number(),
    nextSendWindowAt: v.optional(v.number()),
    killSwitch: v.boolean(),
    sessionActive: v.boolean(),
    ownerName: v.string(),
    ownerHandle: v.string(),
    discoveryActive: v.boolean(),
  }),
  handler: async (ctx) => {
    const workspace = await getWorkspace(ctx);
    if (!workspace) {
      return {
        queueCount: 0,
        pipelineCount: 0,
        sendsToday: 0,
        dailySendCeiling: 12,
        killSwitch: false,
        sessionActive: false,
        ownerName: "",
        ownerHandle: "",
        discoveryActive: false,
      };
    }

    const queue = await ctx.db
      .query("leads")
      .withIndex("by_workspace_and_status", (q) =>
        q.eq("workspaceId", workspace._id).eq("status", "queued")
      )
      .collect();

    const activeRules = await ctx.db
      .query("watchRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    return {
      queueCount: queue.length,
      pipelineCount: queue.length,
      sendsToday: workspace.sendsToday,
      dailySendCeiling: workspace.dailySendCeiling,
      nextSendWindowAt: workspace.nextSendWindowAt,
      killSwitch: workspace.killSwitch,
      sessionActive: workspace.sessionActive,
      ownerName: workspace.ownerName,
      ownerHandle: workspace.ownerHandle,
      discoveryActive: activeRules.some((r) => r.enabled),
    };
  },
});
