import { v } from "convex/values";

export const intentValidator = v.union(
  v.literal("active_buying"),
  v.literal("problem_statement"),
  v.literal("competitor_mention"),
  v.literal("flagged"),
  v.literal("irrelevant")
);

export const leadStatusValidator = v.union(
  v.literal("new"),
  v.literal("queued"),
  v.literal("contacted"),
  v.literal("replied"),
  v.literal("in_conversation"),
  v.literal("qualified"),
  v.literal("won"),
  v.literal("lost"),
  v.literal("dismissed"),
  v.literal("snoozed")
);

export const platformValidator = v.union(
  v.literal("reddit"),
  v.literal("instagram")
);

export const scoreBreakdownValidator = v.object({
  intentStrength: v.number(),
  serviceFit: v.number(),
  decisionMaker: v.number(),
  threadVisibility: v.number(),
});

export const pipelineSectionValidator = v.union(
  v.literal("classify"),
  v.literal("score"),
  v.literal("research"),
  v.literal("draft")
);

export const watchRuleValidator = v.object({
  _id: v.id("watchRules"),
  type: v.union(v.literal("subreddit"), v.literal("keyword")),
  value: v.string(),
  enabled: v.boolean(),
  noPromo: v.optional(v.boolean()),
});

export const workspaceSummaryValidator = v.object({
  _id: v.id("workspaces"),
  slug: v.string(),
  name: v.string(),
  voiceGuide: v.string(),
  dailySendCeiling: v.number(),
  minGapMinutes: v.number(),
  killSwitch: v.boolean(),
  sendsToday: v.number(),
  nextSendWindowAt: v.optional(v.number()),
  sessionActive: v.boolean(),
  redditConnected: v.boolean(),
});

export const modelConfigValidator = v.object({
  _id: v.id("modelConfig"),
  classify: v.array(v.string()),
  score: v.array(v.string()),
  research: v.array(v.string()),
  draft: v.array(v.string()),
});
