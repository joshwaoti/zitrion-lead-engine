"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  buildClassifyPrompt,
  buildScorePrompt,
  buildResearchPrompt,
  buildDraftPrompt,
  defaultChainFor,
  PIPELINE_SECTIONS,
  type ContextCard,
} from "@zitrion/core";
import {
  callModel,
  fetchAvailableModelIds,
  findMissingModels,
} from "./lib/modelGateway";
import {
  parseClassifyOutput,
  parseScoreOutput,
  parseContextCard,
  parseDraftOutput,
} from "./lib/parse";
import {
  clampScore,
  contextCardToString,
  isPromotableCoreIntent,
  mapCoreIntentToDashboard,
  mapDashboardIntentToCore,
} from "./lib/leadLogic";
import { parseLeadContextCard } from "./leads";

const PROMOTE_RELEVANCE_THRESHOLD = 0.4;
const SCORE_CONTINUE_THRESHOLD = 45;

export const classify = internalAction({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let workspaceId: import("./_generated/dataModel").Id<"workspaces"> | null = null;
    let handle = "candidate";

    try {
      const candidate = await ctx.runQuery(internal.candidates.getInternal, {
        candidateId: args.candidateId,
      });
      if (!candidate) return null;
      if (candidate.status !== "raw" && candidate.status !== "processing") {
        return null;
      }

      workspaceId = candidate.workspaceId;
      handle = candidate.handle;

      await ctx.runMutation(internal.candidates.setProcessingInternal, {
        candidateId: args.candidateId,
      });

      const { system, user } = buildClassifyPrompt({
        platform: candidate.platform,
        sourceUrl: candidate.url,
        text: [candidate.snippet, candidate.postBody].filter(Boolean).join("\n\n"),
      });

      const result = await callModel(ctx, {
        workspaceId: candidate.workspaceId,
        section: "classify",
        system,
        user,
        validate: parseClassifyOutput,
      });

      const dashboardIntent = mapCoreIntentToDashboard(result.intent);
      const promotable =
        isPromotableCoreIntent(result.intent) &&
        result.relevance >= PROMOTE_RELEVANCE_THRESHOLD;

      if (!promotable) {
        await ctx.runMutation(internal.candidates.applyClassifyInternal, {
          candidateId: args.candidateId,
          classification: dashboardIntent,
          confidence: result.relevance,
          status: dashboardIntent === "irrelevant" ? "irrelevant" : "dismissed",
          skipReason: result.reason,
        });
        return null;
      }

      await ctx.runMutation(internal.candidates.applyClassifyInternal, {
        candidateId: args.candidateId,
        classification: dashboardIntent,
        confidence: result.relevance,
        status: "classified",
      });

      await ctx.scheduler.runAfter(0, internal.pipelineAi.score, {
        candidateId: args.candidateId,
      });
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "classify failed";
      await ctx.runMutation(internal.candidates.failPipelineInternal, {
        candidateId: args.candidateId,
        stage: "classify",
        reason,
      });
      if (workspaceId) {
        await ctx.runMutation(internal.events.recordInternal, {
          workspaceId,
          type: "pipeline.error",
          message: `Classify failed for ${handle}: ${reason.slice(0, 180)}`,
        });
      }
      return null;
    }
  },
});

export const score = internalAction({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.runQuery(internal.candidates.getInternal, {
      candidateId: args.candidateId,
    });
    if (!candidate || candidate.status !== "classified" || !candidate.classification) {
      return null;
    }

    const { system, user } = buildScorePrompt({
      intent: mapDashboardIntentToCore(candidate.classification),
      text: [candidate.snippet, candidate.postBody].filter(Boolean).join("\n\n"),
      profileSummary: candidate.profileHints,
    });

    const result = await callModel(ctx, {
      workspaceId: candidate.workspaceId,
      section: "score",
      system,
      user,
      validate: parseScoreOutput,
    });

    const score = clampScore(result.score);
    const scoreBreakdown = {
      intentStrength: Math.round((candidate.confidence ?? 0) * 100),
      serviceFit: score,
      decisionMaker: Math.min(100, Math.round(score * 0.85)),
      threadVisibility: Math.min(100, Math.round(score * 0.7)),
    };

    await ctx.runMutation(internal.candidates.applyScoreInternal, {
      candidateId: args.candidateId,
      score,
      scoreBreakdown,
    });

    if (score < SCORE_CONTINUE_THRESHOLD) {
      await ctx.runMutation(internal.candidates.skipInternal, {
        candidateId: args.candidateId,
        reason: `Score ${score} below threshold`,
      });
      return null;
    }

    await ctx.scheduler.runAfter(0, internal.pipelineAi.researchSynthesis, {
      candidateId: args.candidateId,
    });
    return null;
  },
});

export const researchSynthesis = internalAction({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.runQuery(internal.candidates.getInternal, {
      candidateId: args.candidateId,
    });
    if (!candidate || candidate.status !== "classified") return null;

    const { system, user } = buildResearchPrompt({
      handle: candidate.handle,
      platform: candidate.platform,
      threadText: [candidate.snippet, candidate.postBody].filter(Boolean).join("\n\n"),
      profile: candidate.profileHints
        ? { bio: candidate.profileHints }
        : undefined,
    });

    const contextCard = await callModel(ctx, {
      workspaceId: candidate.workspaceId,
      section: "research",
      system,
      user,
      validate: parseContextCard,
    });

    await ctx.runMutation(internal.candidates.applyResearchInternal, {
      candidateId: args.candidateId,
      contextCard: contextCardToString(
        contextCard.summary,
        contextCard.highlights
      ),
      profileMeta: contextCard.profile?.bio,
    });

    await ctx.scheduler.runAfter(0, internal.pipelineAi.draft, {
      candidateId: args.candidateId,
    });
    return null;
  },
});

export const draft = internalAction({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const candidate = await ctx.runQuery(internal.candidates.getInternal, {
      candidateId: args.candidateId,
    });
    if (!candidate || candidate.status !== "classified") return null;

    const contextCard: ContextCard = candidate.contextCard
      ? parseLeadContextCard(candidate.contextCard)
      : { summary: candidate.snippet, highlights: [] };
    const draftType = candidate.platform === "instagram" ? "dm" : "comment";

    const { system, user } = buildDraftPrompt({
      type: draftType,
      goal: "help_first",
      threadText: candidate.snippet,
      contextCard,
      variants: 2,
    });

    const result = await callModel(ctx, {
      workspaceId: candidate.workspaceId,
      section: "draft",
      system,
      user,
      validate: parseDraftOutput,
    });

    if (result.skip) {
      await ctx.runMutation(internal.candidates.skipInternal, {
        candidateId: args.candidateId,
        reason: result.reason,
      });
      return null;
    }

    const variantA = result.variants[0]?.body ?? "";
    const variantB = result.variants[1]?.body ?? variantA;

    await ctx.runMutation(internal.leads.promoteFromCandidateInternal, {
      candidateId: args.candidateId,
      type: draftType,
      variantA,
      variantB,
      groundedRefs: contextCard.highlights.slice(0, 3),
    });

    await ctx.runMutation(internal.candidates.markPromotedInternal, {
      candidateId: args.candidateId,
    });

    await ctx.runMutation(internal.events.recordInternal, {
      workspaceId: candidate.workspaceId,
      type: "pipeline.promoted",
      message: `Promoted ${candidate.handle} to review queue`,
    });

    return null;
  },
});

export const regenerateDraft = internalAction({
  args: {
    draftId: v.id("drafts"),
    leadId: v.id("leads"),
    type: v.optional(v.union(v.literal("comment"), v.literal("dm"))),
    goal: v.optional(
      v.union(
        v.literal("help_first"),
        v.literal("soft_pitch"),
        v.literal("direct")
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.runQuery(internal.leads.getInternal, {
      leadId: args.leadId,
    });
    if (!lead) return null;

    const contextCard = parseLeadContextCard(lead.contextCard);
    const type = args.type ?? "comment";
    const goal = args.goal ?? "help_first";

    const { system, user } = buildDraftPrompt({
      type,
      goal,
      threadText: lead.threadSnippet,
      contextCard,
      variants: 2,
    });

    const result = await callModel(ctx, {
      workspaceId: lead.workspaceId,
      section: "draft",
      system,
      user,
      validate: parseDraftOutput,
    });

    if (result.skip) {
      await ctx.runMutation(internal.drafts.updateInternal, {
        draftId: args.draftId,
        variantA: `Skipped: ${result.reason}`,
        variantB: "",
        status: "pending",
      });
      return null;
    }

    const variantA = result.variants[0]?.body ?? "";
    const variantB = result.variants[1]?.body ?? variantA;

    await ctx.runMutation(internal.drafts.updateInternal, {
      draftId: args.draftId,
      variantA,
      variantB,
      status: "pending",
    });
    return null;
  },
});

export const validateModelRoster = internalAction({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({ section: v.string(), missing: v.array(v.string()) })
  ),
  handler: async (ctx, args) => {
    const available = await fetchAvailableModelIds();
    const report: { section: string; missing: string[] }[] = [];

    for (const section of PIPELINE_SECTIONS) {
      const configured = await ctx.runQuery(internal.modelConfig.getChainInternal, {
        workspaceId: args.workspaceId,
        section,
      });
      const chain = configured.length > 0 ? configured : defaultChainFor(section);
      const missing = findMissingModels(chain, available);
      if (missing.length > 0) {
        await ctx.runMutation(internal.events.recordInternal, {
          workspaceId: args.workspaceId,
          type: "models.unavailable",
          message: `Section "${section}" references unavailable models: ${missing.join(", ")}`,
          data: JSON.stringify(missing),
        });
      }
      report.push({ section, missing });
    }

    return report;
  },
});
