"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ActivityFeed } from "@/components/layout/activity-feed";
import {
  cn,
  formatRelativeTime,
  intentBadgeClass,
  intentLabel,
} from "@/lib/utils";

function candidateStatusLabel(status: string): string {
  const map: Record<string, string> = {
    raw: "queued · awaiting AI",
    processing: "classifying…",
    classified: "ready to promote",
    irrelevant: "irrelevant · auto-skipped",
    deduped: "deduped",
    dismissed: "dismissed",
    promoted: "promoted",
  };
  return map[status] ?? status;
}

export function DiscoveryScreen() {
  const watchData = useQuery(api.discovery.getWatchRules);
  const liveStatus = useQuery(api.discovery.getLiveStatus);
  const candidates = useQuery(api.discovery.listCandidates, {});
  const toggleRule = useMutation(api.discovery.toggleWatchRule);
  const addRule = useMutation(api.discovery.addWatchRule);
  const promote = useMutation(api.discovery.promoteCandidate);
  const dismissCandidate = useMutation(api.discovery.dismissCandidate);

  const [newKeyword, setNewKeyword] = useState("");
  const [showAddKeyword, setShowAddKeyword] = useState(false);

  const enabledSubs = watchData?.subreddits.filter((s) => s.enabled).length ?? 0;
  const keywordCount = watchData?.keywords.length ?? 0;
  const processingCount = liveStatus?.counts.processing ?? 0;

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;
    await addRule({ type: "keyword", value: newKeyword.trim() });
    setNewKeyword("");
    setShowAddKeyword(false);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-end justify-between border-b border-border px-[30px] pb-5 pt-[26px]">
        <div>
          <h1 className="font-serif text-[30px] font-normal leading-none tracking-tight">
            Discovery
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {enabledSubs} subreddits · {keywordCount} keywords ·{" "}
            <span className="text-success">
              last poll {formatRelativeTime(watchData?.lastPollAt)}
            </span>
            {processingCount > 0 && (
              <span className="ml-2 text-accent">
                · {processingCount} classifying now
              </span>
            )}
          </p>
          <p className="mt-1 text-[11px] text-muted-dark">
            Real discovery runs in the Chrome extension: poll Reddit watches or
            scrape the current Instagram post while logged in.
          </p>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">
        <div className="overflow-y-auto border-r border-border p-[22px]">
          <div className="mb-4">
            <ActivityFeed compact />
          </div>

          <div className="mb-[13px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
            SUBREDDITS · WORLDWIDE
          </div>
          <div className="mb-[26px] flex flex-col gap-[7px]">
            {watchData?.subreddits.map((rule) => (
              <div
                key={rule._id}
                className={cn(
                  "flex items-center justify-between rounded-[9px] border px-[13px] py-2.5",
                  rule.enabled
                    ? "border-[#28261d] bg-surface-raised"
                    : "border-[#221f18] bg-[#191811]"
                )}
              >
                <span
                  className={cn(
                    "font-mono text-[13px]",
                    !rule.enabled && "text-muted"
                  )}
                >
                  r/{rule.value}
                  {rule.noPromo && (
                    <span className="ml-2 font-sans text-[10px] text-warning">
                      no promo
                    </span>
                  )}
                </span>
                <Switch
                  checked={rule.enabled}
                  onCheckedChange={(enabled) =>
                    void toggleRule({ ruleId: rule._id, enabled })
                  }
                />
              </div>
            ))}
          </div>

          <div className="mb-[13px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
            KEYWORD RULES
          </div>
          <div className="mb-3.5 flex flex-wrap gap-[7px]">
            {watchData?.keywords.map((rule) => (
              <span
                key={rule._id}
                className="rounded-full border border-[#28261d] bg-[#1d1c14] px-[11px] py-[5px] text-[11.5px] text-text-body"
              >
                {rule.value}
              </span>
            ))}
            {showAddKeyword ? (
              <div className="flex w-full gap-2">
                <input
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void handleAddKeyword()}
                  placeholder="new keyword…"
                  className="flex-1 rounded-full border border-border-accent bg-surface px-3 py-1 text-sm outline-none focus:border-accent"
                  autoFocus
                />
                <Button variant="primary" className="text-xs" onClick={() => void handleAddKeyword()}>
                  Add
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddKeyword(true)}
                className="rounded-full border border-dashed border-border-accent px-[11px] py-[5px] text-[11.5px] text-muted-dark hover:text-muted"
              >
                + add rule
              </button>
            )}
          </div>
        </div>

        <div className="overflow-y-auto bg-panel p-[22px] pl-[26px]">
          <div className="mb-4 flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-[0.1em] text-muted-darker">
              LIVE CANDIDATES
            </div>
            <span className="text-[11px] text-muted-dark">
              {watchData?.stats.found ?? 0} found · {watchData?.stats.surfaced ?? 0}{" "}
              surfaced · {watchData?.stats.deduped ?? 0} deduped ·{" "}
              {watchData?.stats.irrelevant ?? 0} irrelevant
            </span>
          </div>

          {candidates === undefined && (
            <div className="rounded-[11px] border border-[#28261d] bg-surface-raised p-8 text-center text-muted">
              Loading candidates…
            </div>
          )}

          {candidates?.length === 0 && (
            <div className="rounded-[11px] border border-dashed border-border-accent bg-[#1a1912] p-8 text-center">
              <p className="text-[14px] text-text-secondary">No candidates yet</p>
              <p className="mt-2 text-[12px] text-muted">
                Open the extension popup and run Reddit discovery or scrape the
                current Instagram post. Activity appears in the feed on the left.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {candidates?.map((c) => {
              const isActive = c.status === "classified";
              const isProcessing = c.status === "raw" || c.status === "processing";
              const isDim =
                c.status === "irrelevant" ||
                c.status === "deduped" ||
                c.status === "dismissed";

              return (
                <div
                  key={c._id}
                  className={cn(
                    "rounded-[11px] border bg-surface-raised p-[15px] pl-[17px]",
                    isActive && "border-[#2a2820] border-l-2 border-l-success",
                    isProcessing && "border-l-2 border-l-accent animate-pulse",
                    c.classification === "problem_statement" &&
                      isActive &&
                      "border-l-info",
                    isDim && "border-[#221f18] bg-[#191811] opacity-60"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "truncate text-[13px] font-medium",
                          isDim && "text-muted"
                        )}
                      >
                        {c.platform === "instagram" ? "@" : "u/"}
                        {c.handle.replace(/^u\//, "")}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-muted-dark">
                        {c.platform === "instagram"
                          ? "instagram"
                          : `r/${c.subreddit.replace(/^r\//, "")}`}{" "}
                        ·{" "}
                        {formatRelativeTime(c.postedAt)}
                      </span>
                    </div>
                    {isActive && c.classification ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-[3px] text-[10px]",
                          intentBadgeClass(c.classification)
                        )}
                      >
                        {intentLabel(c.classification)} ·{" "}
                        {(c.confidence ?? 0).toFixed(2)}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-[3px] text-[10px]",
                          isProcessing
                            ? "bg-[#26241a] text-accent"
                            : "bg-surface-active text-muted-dark"
                        )}
                      >
                        {candidateStatusLabel(c.status)}
                      </span>
                    )}
                  </div>

                  <div className="mb-2 text-[12.5px] leading-normal text-text-dim">
                    &ldquo;{c.snippet}&rdquo;
                  </div>

                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-2 block truncate font-mono text-[10px] text-muted-dark hover:text-accent"
                    >
                      {c.url}
                    </a>
                  )}

                  {isActive && (
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="border border-accent bg-[#26241a] text-accent hover:bg-[#26241a]"
                        onClick={() => void promote({ candidateId: c._id })}
                      >
                        Promote to queue
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void dismissCandidate({ candidateId: c._id })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
