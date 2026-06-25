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
  type InstagramProfileInsight,
  type VoiceContext,
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

/** Load the workspace's outbound voice and shape it for the prompt builders. */
async function resolveVoice(
  ctx: Parameters<typeof callModel>[0],
  workspaceId: import("./_generated/dataModel").Id<"workspaces">
): Promise<Partial<VoiceContext>> {
  const voice = await ctx.runQuery(internal.settings.getVoiceInternal, {
    workspaceId,
  });
  const out: Partial<VoiceContext> = {};
  if (voice.persona) out.persona = voice.persona;
  if (voice.voiceGuide) out.voiceGuide = voice.voiceGuide;
  if (voice.serviceCatalog) out.serviceCatalog = voice.serviceCatalog;
  return out;
}

/** Best-effort parse of the JSON-encoded Instagram enrichment in profileHints. */
function parseInstagramInsight(
  profileHints: string | undefined
): InstagramProfileInsight | null {
  if (!profileHints) return null;
  try {
    const parsed = JSON.parse(profileHints) as InstagramProfileInsight;
    if (parsed && typeof parsed === "object" && "handle" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Build a grounded context card from Instagram enrichment without a model call. */
function instagramContextCard(
  handle: string,
  insight: InstagramProfileInsight | null,
  trigger: string
): ContextCard {
  const name = insight?.fullName?.trim();
  const stats = [
    insight?.followerCount !== undefined
      ? `${insight.followerCount.toLocaleString()} followers`
      : "",
    insight?.category ?? "",
    insight?.isVerified ? "verified" : "",
  ]
    .filter(Boolean)
    .join(", ");

  const summaryParts = [
    name ? `${name} (@${handle})` : `@${handle}`,
    stats ? `— ${stats}` : "",
    insight?.bio ? `Bio: ${insight.bio}` : "",
    trigger,
  ].filter(Boolean);

  const highlights = [
    insight?.bio,
    insight?.externalUrl,
    ...(insight?.recentPosts ?? []),
    trigger,
  ]
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 1)
    .slice(0, 5);

  return {
    summary: summaryParts.join(" "),
    highlights,
    profile: {
      bio: insight?.bio,
    },
  };
}

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

    const voice = await resolveVoice(ctx, candidate.workspaceId);
    const { system, user } = buildScorePrompt(
      {
        intent: mapDashboardIntentToCore(candidate.classification),
        text: [candidate.snippet, candidate.postBody].filter(Boolean).join("\n\n"),
        profileSummary: candidate.profileHints,
      },
      voice
    );

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

    const voice = await resolveVoice(ctx, candidate.workspaceId);
    const { system, user } = buildDraftPrompt({
      type: draftType,
      goal: "help_first",
      threadText: candidate.snippet,
      contextCard,
      variants: 2,
      voice,
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

/**
 * Instagram cold-outreach path. Unlike the Reddit pipeline this does NOT gate
 * on buying intent: every scraped commenter/follower is a target. It grounds a
 * personalized DM in the profile enrichment (no separate research model call to
 * stay light on rate limits), then promotes straight to the review queue.
 */
export const igOutreach = internalAction({
  args: { candidateId: v.id("candidates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let workspaceId: import("./_generated/dataModel").Id<"workspaces"> | null =
      null;
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

      const insight = parseInstagramInsight(candidate.profileHints);
      const trigger = candidate.snippet || "Engaged with target content on Instagram";
      const contextCard = instagramContextCard(handle, insight, trigger);

      // Treat scraped IG prospects as warm targets so they surface in the queue.
      const followerScore = insight?.followerCount
        ? Math.min(100, 50 + Math.round(Math.log10(insight.followerCount + 1) * 10))
        : 65;
      const scoreBreakdown = {
        intentStrength: 70,
        serviceFit: followerScore,
        decisionMaker: insight?.category || insight?.externalUrl ? 75 : 55,
        threadVisibility: 60,
      };

      await ctx.runMutation(internal.candidates.applyClassifyInternal, {
        candidateId: args.candidateId,
        classification: "active_buying",
        confidence: 0.7,
        status: "classified",
      });
      await ctx.runMutation(internal.candidates.applyScoreInternal, {
        candidateId: args.candidateId,
        score: followerScore,
        scoreBreakdown,
      });
      await ctx.runMutation(internal.candidates.applyResearchInternal, {
        candidateId: args.candidateId,
        contextCard: contextCardToString(
          contextCard.summary,
          contextCard.highlights
        ),
        profileMeta:
          insight?.bio ??
          (insight?.followerCount
            ? `${insight.followerCount.toLocaleString()} followers`
            : undefined),
      });

      const voice = await resolveVoice(ctx, candidate.workspaceId);
      const { system, user } = buildDraftPrompt({
        type: "dm",
        goal: "help_first",
        threadText: trigger,
        contextCard,
        variants: 2,
        voice,
        allowSkip: false,
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
        type: "dm",
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
        message: `Drafted IG DM for @${handle}`,
      });

      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "ig outreach failed";
      await ctx.runMutation(internal.candidates.failPipelineInternal, {
        candidateId: args.candidateId,
        stage: "igOutreach",
        reason,
      });
      if (workspaceId) {
        await ctx.runMutation(internal.events.recordInternal, {
          workspaceId,
          type: "pipeline.error",
          message: `IG outreach failed for @${handle}: ${reason.slice(0, 180)}`,
        });
      }
      return null;
    }
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

    const voice = await resolveVoice(ctx, lead.workspaceId);
    const { system, user } = buildDraftPrompt({
      type,
      goal,
      threadText: lead.threadSnippet,
      contextCard,
      variants: 2,
      voice,
      allowSkip: type === "dm" ? false : true,
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
