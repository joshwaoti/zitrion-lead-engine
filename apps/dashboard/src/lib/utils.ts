import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return "—";
  const diff = timestamp - Date.now();
  const absDiff = Math.abs(diff);
  const minutes = Math.round(absDiff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return diff < 0 ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  return diff < 0 ? `${hours}h ago` : `in ${hours}h`;
}

export function intentLabel(intent: string): string {
  const map: Record<string, string> = {
    active_buying: "active buying intent",
    problem_statement: "problem statement",
    competitor_mention: "competitor mention",
    flagged: "flagged · research more",
    irrelevant: "irrelevant",
  };
  return map[intent] ?? intent;
}

export function intentBadgeClass(intent: string): string {
  const map: Record<string, string> = {
    active_buying: "bg-[#1d2a1c] text-success",
    problem_statement: "bg-[#1d2330] text-info",
    competitor_mention: "bg-[#2e2718] text-warning",
    flagged: "bg-[#241f17] text-[#9a8f6a]",
    irrelevant: "bg-surface-active text-muted-dark",
  };
  return map[intent] ?? "bg-surface-active text-muted";
}

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    new: "bg-surface-active text-text-secondary border border-border-strong",
    queued: "bg-surface-active text-text-secondary border border-border-strong",
    contacted: "bg-[#241f17] text-[#9a8f6a]",
    replied: "bg-[#1d2330] text-info",
    in_conversation: "bg-[#1d2330] text-info",
    qualified: "bg-[#2a2718] text-accent",
    won: "bg-[#1d2a1c] text-success",
    lost: "bg-surface text-muted",
  };
  return map[status] ?? "bg-surface text-muted";
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    new: "New",
    queued: "New",
    contacted: "Contacted",
    replied: "Replied",
    in_conversation: "In conversation",
    qualified: "Qualified",
    won: "Won",
    lost: "Lost",
  };
  return map[status] ?? status;
}

export function scoreColor(score: number): string {
  if (score >= 85) return "text-accent";
  if (score >= 70) return "text-accent-muted";
  if (score >= 55) return "text-[#9a8f5a]";
  return "text-muted";
}
