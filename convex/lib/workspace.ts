import { DEFAULT_MODEL_CHAINS } from "@zitrion/core";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { EMPTY_CANDIDATE_STATS } from "./candidateStats";

export const DEFAULT_SUBREDDIT_RULES = [
  { value: "webdev", enabled: true },
  { value: "SaaS", enabled: true, noPromo: true },
  { value: "startups", enabled: true },
  { value: "Entrepreneur", enabled: true },
  { value: "datascience", enabled: true },
  { value: "MachineLearning", enabled: true },
  { value: "UI_Design", enabled: true },
  { value: "graphic_design", enabled: true },
  { value: "software", enabled: true },
  { value: "devops", enabled: true },
  { value: "sideproject", enabled: true },
  { value: "smallbusiness", enabled: false },
] as const;

export const DEFAULT_KEYWORD_RULES = [
  "need a website",
  "looking for developer",
  "build an MVP",
  "custom software",
  "booking system",
  "UI redesign",
  "data pipeline",
  "hire developer",
  "SaaS MVP",
  "looking for agency",
] as const;

export async function getWorkspace(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (q) => q.eq("slug", "default"))
    .unique();
}

export async function requireDefaultWorkspace(ctx: MutationCtx) {
  const workspace = await getWorkspace(ctx);
  if (workspace) return workspace;
  return await ensureDefaultWorkspace(ctx);
}

export async function ensureDefaultWorkspace(ctx: MutationCtx) {
  const existing = await getWorkspace(ctx);
  if (existing) return existing;

  const workspaceId = await ctx.db.insert("workspaces", {
    slug: "default",
    name: "Zitrion",
    voiceGuide:
      "Direct and helpful-first. Lead with the actual fix, then mention I do this for a living — never the other way round. Plain Nairobi-tech English, no corporate filler, no \"I hope this finds you well.\" Confident but not pushy. If I've got nothing specific to say, I say nothing.",
    serviceCatalog: [
      {
        name: "Premium websites",
        description: "Custom, fast, owned. KES 80k–300k.",
      },
      {
        name: "SaaS / MVP builds",
        description: "Full-stack product from scope to ship.",
      },
      {
        name: "Booking & ordering systems",
        description: "Slot-locking, no per-transaction cut.",
      },
    ],
    dailySendCeiling: 50,
    minGapMinutes: 4,
    autoPauseOnThrottle: true,
    killSwitch: false,
    sendsToday: 0,
    nextSendWindowAt: undefined,
    lastPollAt: undefined,
    nextPollAt: undefined,
    ownerName: "Josh Otieno",
    ownerHandle: "u/zitrion_josh",
    sessionActive: false,
    redditConnected: false,
    candidateStats: { ...EMPTY_CANDIDATE_STATS },
  });

  return (await ctx.db.get("workspaces", workspaceId))!;
}

export async function ensureSeedData(ctx: MutationCtx) {
  const workspace = await ensureDefaultWorkspace(ctx);

  const modelConfig = await ctx.db
    .query("modelConfig")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .first();

  if (!modelConfig) {
    await ctx.db.insert("modelConfig", {
      workspaceId: workspace._id,
      classify: [...DEFAULT_MODEL_CHAINS.classify],
      score: [...DEFAULT_MODEL_CHAINS.score],
      research: [...DEFAULT_MODEL_CHAINS.research],
      draft: [...DEFAULT_MODEL_CHAINS.draft],
    });
  }

  const watchRuleCount = await ctx.db
    .query("watchRules")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect();

  if (watchRuleCount.length === 0) {
    await insertDefaultWatchRules(ctx, workspace._id);
  }

  return workspace;
}

async function insertDefaultWatchRules(ctx: MutationCtx, workspaceId: Id<"workspaces">) {
  for (const sub of DEFAULT_SUBREDDIT_RULES) {
    await ctx.db.insert("watchRules", {
      workspaceId,
      type: "subreddit",
      value: sub.value,
      enabled: sub.enabled,
      noPromo: "noPromo" in sub ? sub.noPromo : undefined,
    });
  }
  for (const kw of DEFAULT_KEYWORD_RULES) {
    await ctx.db.insert("watchRules", {
      workspaceId,
      type: "keyword",
      value: kw,
      enabled: true,
    });
  }
}

export async function resetDefaultWatchRules(ctx: MutationCtx) {
  const workspace = await getWorkspace(ctx);
  if (!workspace) throw new Error("Workspace not found");

  for (const rule of await ctx.db
    .query("watchRules")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect()) {
    await ctx.db.delete("watchRules", rule._id);
  }

  await insertDefaultWatchRules(ctx, workspace._id);
  return { subredditCount: DEFAULT_SUBREDDIT_RULES.length, keywordCount: DEFAULT_KEYWORD_RULES.length };
}

export async function syncDefaultModelConfig(ctx: MutationCtx) {
  const workspace = await getWorkspace(ctx);
  if (!workspace) throw new Error("Workspace not found");

  const config = await ctx.db
    .query("modelConfig")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .first();

  const payload = {
    classify: [...DEFAULT_MODEL_CHAINS.classify],
    score: [...DEFAULT_MODEL_CHAINS.score],
    research: [...DEFAULT_MODEL_CHAINS.research],
    draft: [...DEFAULT_MODEL_CHAINS.draft],
  };

  if (config) {
    await ctx.db.patch("modelConfig", config._id, payload);
  } else {
    await ctx.db.insert("modelConfig", { workspaceId: workspace._id, ...payload });
  }

  return payload;
}

export async function applyDefaultPacing(ctx: MutationCtx) {
  const workspace = await getWorkspace(ctx);
  if (!workspace) throw new Error("Workspace not found");

  await ctx.db.patch("workspaces", workspace._id, {
    dailySendCeiling: 50,
    minGapMinutes: 4,
  });

  return { dailySendCeiling: 50, minGapMinutes: 4 };
}

export async function clearWorkspaceOperationalData(ctx: MutationCtx) {
  const workspace = await getWorkspace(ctx);
  if (!workspace) return { deleted: 0 };

  let deleted = 0;

  for (const action of await ctx.db
    .query("actions")
    .withIndex("by_workspace_and_status", (q) =>
      q.eq("workspaceId", workspace._id)
    )
    .collect()) {
    await ctx.db.delete("actions", action._id);
    deleted += 1;
  }

  for (const draft of await ctx.db
    .query("drafts")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect()) {
    await ctx.db.delete("drafts", draft._id);
    deleted += 1;
  }

  for (const lead of await ctx.db
    .query("leads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect()) {
    await ctx.db.delete("leads", lead._id);
    deleted += 1;
  }

  for (const candidate of await ctx.db
    .query("candidates")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect()) {
    await ctx.db.delete("candidates", candidate._id);
    deleted += 1;
  }

  for (const event of await ctx.db
    .query("events")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect()) {
    await ctx.db.delete("events", event._id);
    deleted += 1;
  }

  await ctx.db.patch("workspaces", workspace._id, {
    sendsToday: 0,
    nextSendWindowAt: undefined,
    lastPollAt: undefined,
    nextPollAt: undefined,
    sessionActive: false,
    redditConnected: false,
    candidateStats: { ...EMPTY_CANDIDATE_STATS },
  });

  return { deleted };
}
