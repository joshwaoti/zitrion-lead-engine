import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

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

  const now = Date.now();
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
    dailySendCeiling: 12,
    minGapMinutes: 18,
    autoPauseOnThrottle: true,
    killSwitch: false,
    sendsToday: 5,
    nextSendWindowAt: now + 22 * 60 * 1000,
    lastPollAt: now - 2 * 60 * 1000,
    nextPollAt: now + 6 * 60 * 1000,
    ownerName: "Josh Otieno",
    ownerHandle: "u/zitrion_josh",
    sessionActive: true,
    redditConnected: true,
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
      classify: [
        "google/gemini-2.0-flash-exp:free",
        "meta-llama/llama-3.3-70b-instruct:free",
        "mistralai/mistral-small-24b-instruct-2501:free",
      ],
      score: [
        "deepseek/deepseek-chat-v3-0324:free",
        "qwen/qwen3-235b-a22b:free",
        "meta-llama/llama-3.3-70b-instruct:free",
      ],
      research: [
        "meta-llama/llama-4-maverick:free",
        "google/gemini-2.0-flash-exp:free",
        "qwen/qwen3-235b-a22b:free",
      ],
      draft: [
        "deepseek/deepseek-r1:free",
        "qwen/qwen3-235b-a22b:free",
        "meta-llama/llama-3.3-70b-instruct:free",
      ],
    });
  }

  const watchRuleCount = await ctx.db
    .query("watchRules")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect();

  if (watchRuleCount.length === 0) {
    for (const sub of [
      { value: "Kenya", enabled: true },
      { value: "nairobi", enabled: true },
      { value: "webdev", enabled: true },
      { value: "SaaS", enabled: true, noPromo: true },
      { value: "smallbusiness", enabled: false },
    ]) {
      await ctx.db.insert("watchRules", {
        workspaceId: workspace._id,
        type: "subreddit",
        value: sub.value,
        enabled: sub.enabled,
        noPromo: sub.noPromo,
      });
    }
    for (const kw of [
      "need a website",
      "booking system",
      "church management software",
      "web developer Nairobi",
      "SaaS MVP",
    ]) {
      await ctx.db.insert("watchRules", {
        workspaceId: workspace._id,
        type: "keyword",
        value: kw,
        enabled: true,
      });
    }
  }

  const leadCount = await ctx.db
    .query("leads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
    .collect();

  if (leadCount.length === 0) {
    await seedLeadsAndCandidates(ctx, workspace._id);
  }

  return workspace;
}

async function seedLeadsAndCandidates(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
) {
  const now = Date.now();

  const queueLeads = [
    {
      handle: "u/grace_buildsKE",
      subreddit: "r/Kenya",
      intent: "active_buying" as const,
      score: 91,
      contextCard:
        "Runs SparkleWash, a 2-bay car wash in Westlands. Posts about operations, not tech — uses a no-code booking widget that double-books on weekends. Tone is practical, budget-aware, hands-on. Already tried two off-the-shelf tools and churned.",
      threadSnippet:
        "Need a proper booking site for my car wash — the current one keeps double-booking slots on Saturdays and I'm losing customers. Don't want to pay a fortune. Anyone in Nairobi build these?",
      threadMeta: "r/Kenya · 4h ago · 23 comments",
      subreddits: ["r/Kenya", "r/smallbusiness", "r/Entrepreneur"],
      profileMeta: "2.4k karma · 3y account · r/Kenya regular",
      scoreBreakdown: {
        intentStrength: 95,
        serviceFit: 90,
        decisionMaker: 88,
        threadVisibility: 70,
      },
      variantA:
        "Double-booking on Saturdays is almost always the booking tool not locking the slot while payment confirms — a race condition, not your fault. A small custom booking flow with real slot-locking fixes it for good (and skips the per-booking fees). I build these for Nairobi businesses — happy to show you a quick one I did for a barbershop if useful. Either way, that's the thing to look for.",
      variantB:
        "Saturday double-bookings usually mean your widget isn't holding the slot during checkout. The durable fix is a booking flow with proper slot-locking — owned, no per-booking cut. That's exactly the kind of build I do here in Nairobi if you want a hand.",
      groundedRefs: ["the Saturday double-booking", "SparkleWash"],
    },
    {
      handle: "u/sam_nrb",
      subreddit: "r/webdev",
      intent: "problem_statement" as const,
      score: 78,
      contextCard:
        "Church admin volunteer with technical leanings. Managing a 400-member congregation.",
      threadSnippet:
        "Our church management software is a mess, looking to rebuild the members portal.",
      threadMeta: "r/webdev · 6h ago · 12 comments",
      subreddits: ["r/webdev"],
      profileMeta: "890 karma · 2y account",
      scoreBreakdown: {
        intentStrength: 75,
        serviceFit: 82,
        decisionMaker: 70,
        threadVisibility: 65,
      },
      variantA:
        "Member portals usually break when you bolt donations, events, and roster onto generic CMS plugins. A purpose-built admin + member view with one auth layer fixes most of the mess.",
      variantB:
        "If the current stack is plugin soup, a clean rebuild with a single member database and role-based views is usually cheaper than patching.",
      groundedRefs: ["members portal", "church management"],
    },
    {
      handle: "u/mwangi_eats",
      subreddit: "r/nairobi",
      intent: "active_buying" as const,
      score: 73,
      contextCard: "Restaurant owner in Kilimani. Wants owned ordering channel.",
      threadSnippet:
        "Restaurant needs online ordering that doesn't take 18% per order. Suggestions?",
      threadMeta: "r/nairobi · 8h ago · 31 comments",
      subreddits: ["r/nairobi", "r/Kenya"],
      profileMeta: "1.1k karma · 4y account",
      scoreBreakdown: {
        intentStrength: 80,
        serviceFit: 75,
        decisionMaker: 85,
        threadVisibility: 60,
      },
      variantA:
        "The 18% cut is the aggregator tax — owned ordering with M-Pesa checkout cuts that to near-zero per order after build.",
      variantB:
        "Skip marketplaces for repeat customers: simple web menu, M-Pesa, and a kitchen dashboard.",
      groundedRefs: ["18% per order", "online ordering"],
    },
    {
      handle: "u/devshop_ann",
      subreddit: "r/SaaS",
      intent: "competitor_mention" as const,
      score: 64,
      contextCard: "First-time founder exploring MVP options.",
      threadSnippet:
        "Anyone used [competitor] for a SaaS MVP? Quotes feel steep for what you get.",
      threadMeta: "r/SaaS · 10h ago · 45 comments",
      subreddits: ["r/SaaS", "r/startups"],
      profileMeta: "420 karma · 1y account",
      scoreBreakdown: {
        intentStrength: 55,
        serviceFit: 70,
        decisionMaker: 60,
        threadVisibility: 75,
      },
      variantA:
        "Agency MVP quotes often bundle discovery you already did yourself. Scope to one core workflow + auth + billing stub.",
      variantB:
        "Steep quotes usually mean full product roadmap disguised as MVP. Nail one painful workflow first.",
      groundedRefs: ["SaaS MVP", "quotes"],
    },
    {
      handle: "u/lena_writes",
      subreddit: "r/webdev",
      intent: "flagged" as const,
      score: 41,
      contextCard: "Insufficient public history to personalise outreach.",
      threadSnippet: "Looking for someone to help with a website.",
      threadMeta: "r/webdev · 12h ago · 3 comments",
      subreddits: ["r/webdev"],
      profileMeta: "12 karma · 2mo account",
      scoreBreakdown: {
        intentStrength: 30,
        serviceFit: 45,
        decisionMaker: 35,
        threadVisibility: 40,
      },
      variantA:
        "Need a bit more context on what you're building before I can be useful — what's the site for?",
      variantB:
        "Happy to help once I know the use case — what kind of site are you after?",
      groundedRefs: [] as string[],
    },
  ];

  for (const lead of queueLeads) {
    const leadId = await ctx.db.insert("leads", {
      workspaceId,
      handle: lead.handle,
      subreddit: lead.subreddit,
      intent: lead.intent,
      score: lead.score,
      contextCard: lead.contextCard,
      threadSnippet: lead.threadSnippet,
      threadMeta: lead.threadMeta,
      subreddits: lead.subreddits,
      profileMeta: lead.profileMeta,
      status: "queued",
      scoreBreakdown: lead.scoreBreakdown,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("drafts", {
      leadId,
      workspaceId,
      type: "comment",
      goal: "help_first",
      variantA: lead.variantA,
      variantB: lead.variantB,
      chosenVariant: "a",
      groundedRefs: lead.groundedRefs,
      status: "pending",
    });
  }

  for (const lead of [
    {
      handle: "u/sarah_clinic",
      subreddit: "r/kenya",
      intent: "active_buying" as const,
      score: 94,
      status: "won" as const,
      lastMessageSent: "Sent booking-flow demo link →",
    },
    {
      handle: "u/peter_saas",
      subreddit: "r/SaaS",
      intent: "competitor_mention" as const,
      score: 88,
      status: "qualified" as const,
      lastMessageSent: "Sent MVP scope breakdown →",
    },
    {
      handle: "u/mary_ngo",
      subreddit: "r/nonprofit",
      intent: "problem_statement" as const,
      score: 81,
      status: "in_conversation" as const,
      lastMessageSent: "Replied — asked about timeline",
    },
    {
      handle: "u/dev_kev",
      subreddit: "r/webdev",
      intent: "problem_statement" as const,
      score: 76,
      status: "replied" as const,
      lastMessageSent: "Sent layout-shift fix tip →",
    },
    {
      handle: "u/amani_shop",
      subreddit: "r/nairobi",
      intent: "active_buying" as const,
      score: 72,
      status: "contacted" as const,
      lastMessageSent: "Comment posted →",
    },
    {
      handle: "u/grace_buildsKE",
      subreddit: "r/kenya",
      intent: "active_buying" as const,
      score: 91,
      status: "new" as const,
      lastMessageSent: "— in review queue",
    },
  ]) {
    if (lead.handle === "u/grace_buildsKE") continue;
    await ctx.db.insert("leads", {
      workspaceId,
      handle: lead.handle,
      subreddit: lead.subreddit,
      intent: lead.intent,
      score: lead.score,
      contextCard: "",
      threadSnippet: "",
      threadMeta: "",
      subreddits: [lead.subreddit],
      profileMeta: "",
      status: lead.status,
      scoreBreakdown: {
        intentStrength: 70,
        serviceFit: 70,
        decisionMaker: 70,
        threadVisibility: 70,
      },
      lastMessageSent: lead.lastMessageSent,
      createdAt: now - 86400000,
      updatedAt: now - 86400000,
    });
  }

  for (const c of [
    {
      handle: "u/grace_buildsKE",
      subreddit: "r/Kenya",
      snippet:
        "Need a proper booking site for my car wash — keeps double-booking on Saturdays…",
      classification: "active_buying" as const,
      confidence: 0.96,
      status: "classified" as const,
      postedAt: now - 4 * 3600000,
      platform: "reddit" as const,
      url: "https://reddit.com/r/Kenya/example1",
    },
    {
      handle: "u/sam_nrb",
      subreddit: "r/webdev",
      snippet:
        "Our church management software is a mess, looking to rebuild the members portal.",
      classification: "problem_statement" as const,
      confidence: 0.84,
      status: "classified" as const,
      postedAt: now - 6 * 3600000,
      platform: "reddit" as const,
      url: "https://reddit.com/r/webdev/example2",
    },
    {
      handle: "u/randomuser_99",
      subreddit: "r/webdev",
      snippet: "Just learning HTML, any tips?",
      classification: "irrelevant" as const,
      confidence: 0.12,
      status: "irrelevant" as const,
      postedAt: now - 7 * 3600000,
      platform: "reddit" as const,
      url: "https://reddit.com/r/webdev/example3",
    },
    {
      handle: "u/mwangi_eats",
      subreddit: "r/nairobi",
      snippet: "Restaurant needs online ordering…",
      classification: "active_buying" as const,
      confidence: 0.88,
      status: "deduped" as const,
      postedAt: now - 8 * 3600000,
      platform: "reddit" as const,
      url: "https://reddit.com/r/nairobi/example4",
    },
  ]) {
    await ctx.db.insert("candidates", { workspaceId, ...c });
  }
}
