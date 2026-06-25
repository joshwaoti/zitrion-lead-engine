"use client";

import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { ActivityFeed } from "@/components/layout/activity-feed";
import {
  cn,
  intentLabel,
  scoreColor,
  statusBadgeClass,
  statusLabel,
} from "@/lib/utils";

const STAGE_CONFIG = [
  { key: "new", label: "New", highlight: false },
  { key: "contacted", label: "Contacted", highlight: false },
  { key: "replied", label: "Replied", highlight: false },
  { key: "in_conversation", label: "In conversation", highlight: false },
  { key: "qualified", label: "Qualified", highlight: true },
  { key: "won", label: "Won", highlight: "success" as const },
] as const;

export function PipelineScreen() {
  const stats = useQuery(api.pipeline.getStats);
  const leads = useQuery(api.pipeline.listLeads);

  return (
    <div className="flex h-screen flex-col overflow-y-auto">
      <header className="shrink-0 border-b border-border px-[30px] pb-5 pt-[26px]">
        <h1 className="font-serif text-[30px] font-normal leading-none tracking-tight">
          Pipeline
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          {stats?.total ?? 0} leads tracked in Convex
        </p>
      </header>

      <div className="px-[30px] pb-4 pt-2">
        <ActivityFeed compact />
      </div>

      <div className="flex flex-wrap gap-2.5 px-[30px] pb-1 pt-3">
        {STAGE_CONFIG.map(({ key, label, highlight }) => {
          const count =
            stats?.stages[key as keyof typeof stats.stages] ?? 0;
          return (
            <div
              key={key}
              className="min-w-[120px] rounded-[10px] border border-[#28261d] bg-surface-raised px-[17px] py-3"
            >
              <div
                className={cn(
                  "font-mono text-[22px]",
                  highlight === true && "text-accent",
                  highlight === "success" && "text-success"
                )}
              >
                {count}
              </div>
              <div className="mt-[3px] text-[11.5px] text-muted">{label}</div>
            </div>
          );
        })}
      </div>

      <div className="px-[30px] pb-10 pt-[18px]">
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="grid grid-cols-[1.4fr_0.8fr_1.4fr_0.7fr_1.6fr_1fr] bg-[#1a1912] px-[18px] py-[11px] font-mono text-[10.5px] tracking-wide text-muted-dark">
            <span>HANDLE</span>
            <span>FOUND IN</span>
            <span>INTENT</span>
            <span>SCORE</span>
            <span>LAST MESSAGE SENT</span>
            <span>STATUS · NEXT</span>
          </div>

          {leads?.map((lead) => (
            <div
              key={lead._id}
              className="grid grid-cols-[1.4fr_0.8fr_1.4fr_0.7fr_1.6fr_1fr] items-center border-t border-[#221f18] px-[18px] py-3.5 text-[12.5px]"
            >
              <span className="font-medium">{lead.handle}</span>
              <span className="font-mono text-[11px] text-muted">
                {lead.subreddit}
              </span>
              <span
                className={cn(
                  "capitalize",
                  lead.intent === "active_buying" && "text-success",
                  lead.intent === "competitor_mention" && "text-warning",
                  lead.intent === "problem_statement" && "text-info"
                )}
              >
                {intentLabel(lead.intent).split(" ")[0]}
                {lead.intent === "competitor_mention" ? "" : ""}
                {lead.intent === "active_buying"
                  ? " buying"
                  : lead.intent === "competitor_mention"
                    ? "competitor"
                    : lead.intent === "problem_statement"
                      ? "problem"
                      : ""}
              </span>
              <span className={cn("font-mono", scoreColor(lead.score))}>
                {lead.score}
              </span>
              <span className="text-[#8c8779]">
                {lead.lastMessageSent ?? "—"}
              </span>
              <span>
                <span
                  className={cn(
                    "rounded-md px-2 py-[3px] text-[10.5px]",
                    statusBadgeClass(lead.status)
                  )}
                >
                  {statusLabel(lead.status)}
                </span>
              </span>
            </div>
          ))}

          {leads?.length === 0 && (
            <div className="border-t border-[#221f18] p-8 text-center text-muted">
              No leads in pipeline yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
