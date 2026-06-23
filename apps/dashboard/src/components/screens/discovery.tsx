"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  cn,
  formatRelativeTime,
  intentBadgeClass,
  intentLabel,
} from "@/lib/utils";

export function DiscoveryScreen() {
  const watchData = useQuery(api.discovery.getWatchRules);
  const candidates = useQuery(api.discovery.listCandidates);
  const toggleRule = useMutation(api.discovery.toggleWatchRule);
  const addRule = useMutation(api.discovery.addWatchRule);
  const pollNow = useMutation(api.discovery.pollNow);
  const promote = useMutation(api.discovery.promoteCandidate);
  const dismissCandidate = useMutation(api.discovery.dismissCandidate);

  const [newKeyword, setNewKeyword] = useState("");
  const [showAddKeyword, setShowAddKeyword] = useState(false);

  const enabledSubs = watchData?.subreddits.filter((s) => s.enabled).length ?? 0;
  const keywordCount = watchData?.keywords.length ?? 0;

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) return;
    await addRule({ type: "keyword", value: newKeyword.trim() });
    setNewKeyword("");
    setShowAddKeyword(false);
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-end justify-between border-b border-border px-[30px] pb-5 pt-[26px]">
        <div>
          <h1 className="font-serif text-[30px] font-normal leading-none tracking-tight">
            Discovery
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            Watching {enabledSubs} subreddits · {keywordCount} keyword rules ·{" "}
            <span className="text-success">
              last poll {formatRelativeTime(watchData?.lastPollAt)}
            </span>
            , next {formatRelativeTime(watchData?.nextPollAt)}
          </p>
        </div>
        <Button
          variant="primary"
          className="px-[15px] py-2 font-semibold"
          onClick={() => void pollNow({})}
        >
          Poll now
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr]">
        {/* Watch rules */}
        <div className="overflow-y-auto border-r border-border p-[22px]">
          <div className="mb-[13px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
            SUBREDDITS
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
                      ⚑ no promo
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

        {/* Candidate feed */}
        <div className="overflow-y-auto bg-panel p-[22px] pl-[26px]">
          <div className="mb-4 flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-[0.1em] text-muted-darker">
              LIVE CANDIDATES · CLASSIFIED
            </div>
            <span className="text-[11px] text-muted-dark">
              {watchData?.stats.found ?? 0} found · {watchData?.stats.surfaced ?? 0}{" "}
              surfaced · {watchData?.stats.deduped ?? 0} deduped ·{" "}
              {watchData?.stats.irrelevant ?? 0} irrelevant
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {candidates?.map((c) => {
              const isActive = c.status === "classified";
              const isDim =
                c.status === "irrelevant" || c.status === "deduped";

              return (
                <div
                  key={c._id}
                  className={cn(
                    "rounded-[11px] border bg-surface-raised p-[15px] pl-[17px]",
                    isActive && "border-[#2a2820] border-l-2 border-l-success",
                    c.classification === "problem_statement" &&
                      isActive &&
                      "border-l-info",
                    isDim && "border-[#221f18] bg-[#191811] opacity-60"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-[13px] font-medium",
                          isDim && "text-muted"
                        )}
                      >
                        {c.handle}
                      </span>
                      <span className="font-mono text-[10.5px] text-muted-dark">
                        {c.subreddit} · {formatRelativeTime(c.postedAt)}
                      </span>
                    </div>
                    {isActive ? (
                      <span
                        className={cn(
                          "rounded-md px-2 py-[3px] text-[10px]",
                          intentBadgeClass(c.classification)
                        )}
                      >
                        {c.classification ? intentLabel(c.classification) : "pending"} ·{" "}
                        {(c.confidence ?? 0).toFixed(2)}
                      </span>
                    ) : (
                      <span className="rounded-md bg-surface-active px-2 py-[3px] text-[10px] text-muted-dark">
                        {c.status === "irrelevant"
                          ? "irrelevant · auto-skipped"
                          : c.status === "deduped"
                            ? "deduped · already actioned"
                            : c.status}
                      </span>
                    )}
                  </div>

                  {isActive && (
                    <>
                      <div className="mb-2.5 text-[12.5px] leading-normal text-text-dim">
                        &ldquo;{c.snippet}&rdquo;
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="border border-accent bg-[#26241a] text-accent hover:bg-[#26241a]"
                          onClick={() => void promote({ candidateId: c._id })}
                        >
                          → Promote to queue
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
                    </>
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
