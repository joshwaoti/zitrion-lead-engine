import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const intentType = v.union(
  v.literal("active_buying"),
  v.literal("problem_statement"),
  v.literal("competitor_mention"),
  v.literal("flagged"),
  v.literal("irrelevant")
);

const leadStatus = v.union(
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

const draftGoal = v.union(
  v.literal("help_first"),
  v.literal("soft_pitch"),
  v.literal("direct")
);

const draftType = v.union(v.literal("comment"), v.literal("dm"));
const platform = v.union(v.literal("reddit"), v.literal("instagram"));

const scoreBreakdown = v.object({
  intentStrength: v.number(),
  serviceFit: v.number(),
  decisionMaker: v.number(),
  threadVisibility: v.number(),
});

export default defineSchema({
  workspaces: defineTable({
    slug: v.string(),
    name: v.string(),
    voiceGuide: v.string(),
    serviceCatalog: v.array(
      v.object({ name: v.string(), description: v.string() })
    ),
    dailySendCeiling: v.number(),
    minGapMinutes: v.number(),
    autoPauseOnThrottle: v.boolean(),
    killSwitch: v.boolean(),
    sendsToday: v.number(),
    nextSendWindowAt: v.optional(v.number()),
    lastPollAt: v.optional(v.number()),
    nextPollAt: v.optional(v.number()),
    ownerName: v.string(),
    ownerHandle: v.string(),
    sessionActive: v.boolean(),
    redditConnected: v.boolean(),
    candidateStats: v.optional(
      v.object({
        raw: v.number(),
        processing: v.number(),
        classified: v.number(),
        irrelevant: v.number(),
        deduped: v.number(),
        dismissed: v.number(),
        promoted: v.number(),
      })
    ),
  }).index("by_slug", ["slug"]),

  accounts: defineTable({
    workspaceId: v.id("workspaces"),
    platform,
    handle: v.string(),
    displayName: v.optional(v.string()),
    connected: v.boolean(),
    deviceTokenId: v.optional(v.id("deviceTokens")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_platform", ["workspaceId", "platform"]),

  watchRules: defineTable({
    workspaceId: v.id("workspaces"),
    type: v.union(v.literal("subreddit"), v.literal("keyword")),
    value: v.string(),
    enabled: v.boolean(),
    noPromo: v.optional(v.boolean()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_type", ["workspaceId", "type"]),

  deviceTokens: defineTable({
    workspaceId: v.id("workspaces"),
    tokenHash: v.string(),
    label: v.optional(v.string()),
    executorKind: v.union(v.literal("extension"), v.literal("worker")),
    pairedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    extensionPaused: v.boolean(),
    pauseReason: v.optional(v.string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_workspace", ["workspaceId"]),

  candidates: defineTable({
    workspaceId: v.id("workspaces"),
    platform,
    handle: v.string(),
    subreddit: v.string(),
    snippet: v.string(),
    postBody: v.optional(v.string()),
    url: v.string(),
    profileHints: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    classification: v.optional(intentType),
    confidence: v.optional(v.number()),
    score: v.optional(v.number()),
    scoreBreakdown: v.optional(scoreBreakdown),
    contextCard: v.optional(v.string()),
    profileMeta: v.optional(v.string()),
    subreddits: v.optional(v.array(v.string())),
    pipelineStage: v.optional(
      v.union(
        v.literal("raw"),
        v.literal("classified"),
        v.literal("scored"),
        v.literal("researched"),
        v.literal("drafted"),
        v.literal("promoted"),
        v.literal("skipped")
      )
    ),
    status: v.union(
      v.literal("raw"),
      v.literal("processing"),
      v.literal("classified"),
      v.literal("promoted"),
      v.literal("dismissed"),
      v.literal("deduped"),
      v.literal("irrelevant")
    ),
    skipReason: v.optional(v.string()),
    postedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_workspace_and_source", ["workspaceId", "sourceId"])
    .index("by_workspace_and_posted", ["workspaceId", "postedAt"]),

  leads: defineTable({
    workspaceId: v.id("workspaces"),
    candidateId: v.optional(v.id("candidates")),
    platform: v.optional(platform),
    handle: v.string(),
    subreddit: v.string(),
    threadUrl: v.optional(v.string()),
    intent: intentType,
    score: v.number(),
    contextCard: v.string(),
    threadSnippet: v.string(),
    threadMeta: v.string(),
    subreddits: v.array(v.string()),
    profileMeta: v.string(),
    status: leadStatus,
    scoreBreakdown,
    lastMessageSent: v.optional(v.string()),
    permalink: v.optional(v.string()),
    snoozedUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_status", ["workspaceId", "status"]),

  drafts: defineTable({
    leadId: v.id("leads"),
    workspaceId: v.id("workspaces"),
    type: v.optional(draftType),
    goal: v.optional(draftGoal),
    variantA: v.string(),
    variantB: v.string(),
    chosenVariant: v.optional(v.union(v.literal("a"), v.literal("b"))),
    editedContent: v.optional(v.string()),
    groundedRefs: v.array(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("regenerating")
    ),
  })
    .index("by_lead", ["leadId"])
    .index("by_workspace", ["workspaceId"]),

  actions: defineTable({
    leadId: v.id("leads"),
    workspaceId: v.id("workspaces"),
    draftId: v.optional(v.id("drafts")),
    type: v.optional(draftType),
    targetUrl: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("executing"),
      v.literal("done"),
      v.literal("failed")
    ),
    permalink: v.optional(v.string()),
    content: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_workspace_and_status", ["workspaceId", "status"]),

  modelConfig: defineTable({
    workspaceId: v.id("workspaces"),
    classify: v.array(v.string()),
    score: v.array(v.string()),
    research: v.array(v.string()),
    draft: v.array(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  events: defineTable({
    workspaceId: v.id("workspaces"),
    type: v.string(),
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_created", ["workspaceId", "createdAt"]),
});
