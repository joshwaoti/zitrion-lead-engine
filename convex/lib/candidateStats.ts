import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const EMPTY_CANDIDATE_STATS = {
  raw: 0,
  processing: 0,
  classified: 0,
  irrelevant: 0,
  deduped: 0,
  dismissed: 0,
  promoted: 0,
} as const;

export type CandidateStatKey = keyof typeof EMPTY_CANDIDATE_STATS;

export type CandidateStatsSnapshot = {
  raw: number;
  processing: number;
  classified: number;
  irrelevant: number;
  deduped: number;
  dismissed: number;
  promoted: number;
  found: number;
};

type WorkspaceStats = Partial<Record<CandidateStatKey, number>>;

export function readCandidateStats(
  stats: WorkspaceStats | undefined
): CandidateStatsSnapshot {
  const merged = { ...EMPTY_CANDIDATE_STATS, ...stats };
  return {
    ...merged,
    found:
      merged.raw +
      merged.processing +
      merged.classified +
      merged.irrelevant +
      merged.deduped +
      merged.dismissed +
      merged.promoted,
  };
}

export async function transitionCandidateStat(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  from: CandidateStatKey | null,
  to: CandidateStatKey
): Promise<void> {
  const workspace = await ctx.db.get("workspaces", workspaceId);
  if (!workspace) return;

  const stats: Record<CandidateStatKey, number> = {
    ...EMPTY_CANDIDATE_STATS,
    ...workspace.candidateStats,
  };

  if (from) {
    stats[from] = Math.max(0, stats[from] - 1);
  }
  stats[to] += 1;

  await ctx.db.patch("workspaces", workspaceId, { candidateStats: stats });
}

export async function rebuildCandidateStats(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<CandidateStatsSnapshot> {
  const candidates = await ctx.db
    .query("candidates")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();

  const stats: Record<CandidateStatKey, number> = { ...EMPTY_CANDIDATE_STATS };
  for (const candidate of candidates) {
    const key = candidate.status as CandidateStatKey;
    if (key in stats) {
      stats[key] += 1;
    }
  }

  await ctx.db.patch("workspaces", workspaceId, { candidateStats: stats });
  return readCandidateStats(stats);
}

export function candidateStatusKey(
  status: Doc<"candidates">["status"]
): CandidateStatKey {
  return status;
}
