"use client";

import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { cn, formatRelativeTime } from "@/lib/utils";

const TYPE_STYLES: Record<string, string> = {
  "discovery.activity": "text-info",
  "discovery.ingest": "text-success",
  "pipeline.classify": "text-accent-muted",
  "pipeline.error": "text-warning",
  "poll_now": "text-muted",
  "pipeline.promoted": "text-success",
  throttle: "text-warning",
};

export function ActivityFeed({ compact = false }: { compact?: boolean }) {
  const feed = useQuery(api.events.listRecent, { limit: compact ? 8 : 20 });

  if (!feed || feed.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-border-accent bg-[#1a1912]/80 px-4 py-3 text-[12px] text-muted">
        Waiting for extension activity — load the Chrome extension, stay logged into Reddit, then
        click <span className="text-text-secondary">Poll discovery now</span>.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-[#28261d] bg-[#1a1912]",
        compact ? "max-h-[220px]" : "max-h-[320px]"
      )}
    >
      <div className="border-b border-[#28261d] px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted-darker">
        LIVE ACTIVITY
      </div>
      <ul className="overflow-y-auto px-2 py-1">
        {feed.map((item) => (
          <li
            key={item._id}
            className="flex items-start gap-2 border-b border-[#221f18]/60 px-2 py-2 last:border-0"
          >
            <span
              className={cn(
                "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                item.type.includes("error") || item.type === "throttle"
                  ? "bg-warning"
                  : item.type.includes("ingest") || item.type.includes("promoted")
                    ? "bg-success"
                    : "bg-accent animate-pulse"
              )}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-[12px]",
                  TYPE_STYLES[item.type] ?? "text-text-body"
                )}
              >
                {item.message}
              </p>
              <p className="font-mono text-[10px] text-muted-dark">
                {formatRelativeTime(item.createdAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LiveStatusBar() {
  const status = useQuery(api.discovery.getLiveStatus);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border bg-[#16150f] px-[30px] py-2 font-mono text-[10.5px] tracking-wide text-muted">
      <span>
        Reddit{" "}
        <span className={status?.redditConnected ? "text-success" : "text-muted-dark"}>
          {status?.redditConnected ? "connected" : "offline"}
        </span>
      </span>
      <span>
        Extension{" "}
        <span className={status?.sessionActive ? "text-success" : "text-muted-dark"}>
          {status?.sessionActive ? "active" : "idle"}
        </span>
      </span>
      <span>
        Raw <span className="text-cream">{status?.counts.raw ?? 0}</span>
      </span>
      <span>
        Classifying{" "}
        <span className="text-accent">{status?.counts.processing ?? 0}</span>
      </span>
      <span>
        Surfaced <span className="text-success">{status?.counts.classified ?? 0}</span>
      </span>
      <span className="text-muted-dark">
        Last poll {formatRelativeTime(status?.lastPollAt)}
      </span>
    </div>
  );
}
