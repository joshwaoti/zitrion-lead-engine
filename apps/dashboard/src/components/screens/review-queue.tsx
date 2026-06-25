"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Mail, MessageCircle, RotateCcw, Send } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  cn,
  intentBadgeClass,
  intentLabel,
  scoreColor,
} from "@/lib/utils";

type DraftType = "comment" | "dm";
type DraftGoal = "help_first" | "soft_pitch" | "direct";

function profileUrl(platform: "reddit" | "instagram", handle: string): string {
  const normalized = handle.replace(/^u\//i, "").replace(/^@/, "");
  if (platform === "instagram") return `https://www.instagram.com/${normalized}/`;
  return `https://www.reddit.com/user/${normalized}/`;
}

function composeUrl(platform: "reddit" | "instagram", handle: string): string {
  const normalized = handle.replace(/^u\//i, "").replace(/^@/, "");
  if (platform === "instagram") return `https://www.instagram.com/${normalized}/`;
  return `https://www.reddit.com/message/compose/?to=${encodeURIComponent(normalized)}`;
}

function targetLabel(type: DraftType): string {
  return type === "dm" ? "DM" : "Reply";
}

export function ReviewQueueScreen() {
  const queue = useQuery(api.queue.list);
  const toggleKillSwitch = useMutation(api.settings.toggleKillSwitch);
  const editDraft = useMutation(api.queue.editDraft);
  const regenerate = useMutation(api.queue.regenerate);
  const snooze = useMutation(api.queue.snooze);
  const dismiss = useMutation(api.queue.dismiss);
  const advanceLead = useMutation(api.pipeline.advance);
  const approveAndQueue = useMutation(api.queue.approveAndQueue);

  const [selectedId, setSelectedId] = useState<Id<"leads"> | null>(null);
  const detail = useQuery(
    api.queue.getDetail,
    selectedId ? { leadId: selectedId } : "skip"
  );

  const selectedQueueItem = queue?.find((item) => item._id === selectedId);
  const [draftType, setDraftType] = useState<DraftType>("comment");
  const [draftGoal, setDraftGoal] = useState<DraftGoal>("help_first");
  const [chosenVariant, setChosenVariant] = useState<"a" | "b">("a");
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    if (queue?.length && !selectedId) {
      setSelectedId(queue[0]._id);
    }
  }, [queue, selectedId]);

  useEffect(() => {
    if (!detail?.draft) return;
    const platform =
      detail.lead.platform ??
      (detail.lead.subreddit === "instagram" ? "instagram" : "reddit");
    const recommended =
      selectedQueueItem?.recommendedAction ??
      (platform === "instagram" ? "dm" : "comment");
    const type = detail.draft.type ?? recommended;
    const variant = detail.draft.chosenVariant ?? "a";
    const content =
      detail.draft.editedContent ??
      (variant === "b" ? detail.draft.variantB : detail.draft.variantA);

    setDraftType(type);
    setDraftGoal(detail.draft.goal ?? "help_first");
    setChosenVariant(variant);
    setEditContent(content);
    setEditMode(false);
    setCopyState("idle");
  }, [detail, selectedQueueItem?.recommendedAction]);

  const displayContent = useMemo(() => {
    if (!detail?.draft) return "";
    if (editMode) return editContent;
    return (
      detail.draft.editedContent ??
      (chosenVariant === "b" ? detail.draft.variantB : detail.draft.variantA)
    );
  }, [detail, editMode, editContent, chosenVariant]);

  const leadPlatform =
    detail?.lead.platform ??
    (detail?.lead.subreddit === "instagram" ? "instagram" : "reddit");
  const sourceUrl = detail?.lead.threadUrl;
  const leadProfileUrl = detail
    ? profileUrl(leadPlatform, detail.lead.handle)
    : "#";
  const leadComposeUrl = detail
    ? composeUrl(leadPlatform, detail.lead.handle)
    : "#";

  const handleSaveReady = async () => {
    if (!selectedId || !detail?.draft) return;
    const content = editMode ? editContent : displayContent;
    await editDraft({
      content,
      draftId: detail.draft._id,
      type: draftType,
      goal: draftGoal,
      chosenVariant,
    });
    setEditMode(false);
  };

  const handleCopy = async () => {
    if (!displayContent) return;
    await navigator.clipboard.writeText(displayContent);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1600);
  };

  const handleMarkSent = async () => {
    if (!selectedId || !detail?.draft) return;
    const content = editMode ? editContent : displayContent;
    await editDraft({
      content,
      draftId: detail.draft._id,
      type: draftType,
      goal: draftGoal,
      chosenVariant,
    });
    await advanceLead({ leadId: selectedId, status: "contacted" });
    const next = queue?.find((lead) => lead._id !== selectedId);
    setSelectedId(next?._id ?? null);
  };

  const handleApproveAndSend = async () => {
    if (!selectedId || !detail?.draft) return;
    const content = editMode ? editContent : displayContent;
    await approveAndQueue({
      leadId: selectedId,
      draftId: detail.draft._id,
      content,
      type: draftType,
      goal: draftGoal,
      chosenVariant,
    });
    const next = queue?.find((lead) => lead._id !== selectedId);
    setSelectedId(next?._id ?? null);
  };

  const handleEditSave = async () => {
    if (!detail?.draft) return;
    await editDraft({
      draftId: detail.draft._id,
      content: editContent,
      type: draftType,
      goal: draftGoal,
      chosenVariant,
    });
    setEditMode(false);
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-end justify-between border-b border-border px-[30px] pb-5 pt-[26px]">
        <div>
          <h1 className="font-serif text-[30px] font-normal leading-none tracking-tight">
            Targets & Drafts
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {queue?.length ?? 0} ready leads - pick a target, copy the draft,
            send from the live browser, then mark sent
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="danger-outline"
            onClick={() => void toggleKillSwitch({ enabled: true })}
          >
            <CheckCircle2 className="h-4 w-4" />
            Pause all
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr_1fr]">
        <div className="flex flex-col gap-[7px] overflow-y-auto border-r border-border p-3.5">
          <div className="px-2 pb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-darker">
            REVIEW - {queue?.length ?? 0}
          </div>
          {queue?.map((item) => {
            const active = item._id === selectedId;
            const dimmed = item.score < 50;
            const itemPlatform =
              item.platform ??
              (item.subreddit === "instagram" ? "instagram" : "reddit");
            const action =
              item.recommendedAction ??
              (itemPlatform === "instagram" ? "dm" : "comment");
            const TargetIcon = action === "dm" ? Mail : MessageCircle;
            return (
              <button
                key={item._id}
                type="button"
                onClick={() => setSelectedId(item._id)}
                className={cn(
                  "rounded-[10px] border p-3 text-left transition-colors",
                  active
                    ? "border-[#3a3622] bg-[#201e15] shadow-nav-active"
                    : "border-[#24221a] bg-[#1a1912] hover:border-border",
                  dimmed && "opacity-60"
                )}
              >
                <div className="mb-[7px] flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "min-w-0 truncate text-[13px]",
                      active ? "font-semibold" : "font-medium text-text-body"
                    )}
                  >
                    {itemPlatform === "instagram" ? "@" : "u/"}
                    {item.handle.replace(/^u\//, "")}
                  </span>
                  <span className={cn("font-mono text-[13px] font-medium", scoreColor(item.score))}>
                    {item.score}
                  </span>
                </div>
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md border border-[#2a2820] px-1.5 py-[3px] text-[10px] text-muted">
                    <TargetIcon className="h-3 w-3" />
                    {targetLabel(action)}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted-dark">
                    {itemPlatform === "instagram"
                      ? "instagram"
                      : `r/${item.subreddit.replace(/^r\//, "")}`}
                  </span>
                </div>
                <div className="mb-2 text-[11.5px] leading-snug text-[#8c8779]">
                  "{item.snippet}"
                </div>
                <span
                  className={cn(
                    "rounded-[5px] px-[7px] py-0.5 text-[10px] font-medium",
                    intentBadgeClass(item.intent)
                  )}
                >
                  {intentLabel(item.intent)}
                </span>
              </button>
            );
          })}
          {queue?.length === 0 && (
            <p className="px-2 text-sm text-muted">No ready leads yet.</p>
          )}
        </div>

        <div className="overflow-y-auto border-r border-border px-[26px] py-6">
          {detail ? (
            <>
              <div className="mb-[18px] flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border-accent bg-[#242219] font-mono text-[13px] text-accent">
                  {leadPlatform === "instagram" ? "IG" : "RD"}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-semibold tracking-tight">
                    {leadPlatform === "instagram" ? "@" : "u/"}
                    {detail.lead.handle.replace(/^u\//, "")}
                  </div>
                  <div className="mt-[3px] truncate font-mono text-[11.5px] text-muted">
                    {detail.lead.profileMeta || leadProfileUrl}
                  </div>
                </div>
              </div>

              <div className="mb-[18px] flex flex-wrap gap-2">
                {detail.lead.subreddits.map((sub) => (
                  <span
                    key={sub}
                    className="rounded-full border border-[#28261d] bg-[#1d1c14] px-2.5 py-1 text-[11px] text-text-secondary"
                  >
                    {leadPlatform === "instagram" ? "instagram" : sub}
                  </span>
                ))}
              </div>

              <div className="mb-[11px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                WHY THIS PERSON
              </div>
              <p className="mb-5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-body">
                {detail.lead.contextCard}
              </p>

              <div className="mb-[11px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                SOURCE
              </div>
              <div className="mb-5 rounded-[11px] border border-border bg-[#1a1912] p-4">
                <div className="mb-2 font-mono text-[11px] text-muted">
                  {detail.lead.threadMeta}
                </div>
                <div className="text-[13.5px] leading-relaxed text-[#dad5c7]">
                  "{detail.lead.threadSnippet}"
                </div>
              </div>

              <div className="mb-[11px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                SCORE - {detail.lead.score}
              </div>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["Intent strength", detail.lead.scoreBreakdown.intentStrength, "bg-success"],
                    ["Service fit", detail.lead.scoreBreakdown.serviceFit, "bg-accent"],
                    ["Decision-maker", detail.lead.scoreBreakdown.decisionMaker, "bg-accent"],
                    ["Thread visibility", detail.lead.scoreBreakdown.threadVisibility, "bg-accent-muted"],
                  ] as const
                ).map(([label, value, barColor]) => (
                  <div key={label} className="flex items-center gap-[11px]">
                    <span className="w-[120px] shrink-0 text-xs text-text-secondary">
                      {label}
                    </span>
                    <div className="h-[5px] flex-1 rounded bg-[#2a2820]">
                      <div
                        className={cn("h-full rounded", barColor)}
                        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted">Select a lead from the queue.</p>
          )}
        </div>

        <div className="flex flex-col overflow-y-auto bg-panel px-[26px] py-6">
          {detail?.draft ? (
            <>
              <div className="mb-4 flex gap-1.5 rounded-[9px] border border-[#28261d] bg-[#1c1b14] p-[3px]">
                {(["comment", "dm"] as const).map((type) => {
                  const Icon = type === "dm" ? Mail : MessageCircle;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDraftType(type)}
                      className={cn(
                        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-center text-xs",
                        draftType === type
                          ? "bg-[#2a2820] text-cream"
                          : "text-muted"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {type === "comment" ? "Reply" : "DM"}
                    </button>
                  );
                })}
              </div>

              <div className="mb-4 flex items-center gap-2">
                <span className="font-mono text-[11px] text-muted-dark">GOAL</span>
                <div className="flex flex-1 gap-1">
                  {(
                    [
                      ["help_first", "Help-first"],
                      ["soft_pitch", "Soft pitch"],
                      ["direct", "Direct"],
                    ] as const
                  ).map(([goal, label]) => (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => setDraftGoal(goal)}
                      className={cn(
                        "flex-1 rounded-md border py-1 text-center text-[11.5px]",
                        draftGoal === goal
                          ? "border-accent bg-[#26241a] text-accent"
                          : "border-[#2a2820] text-muted"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {detail.draft.status === "approved" && (
                <div className="mb-3.5 rounded-lg border border-[#243322] bg-[#172017] px-[11px] py-2 text-[11px] text-success">
                  Ready to send manually
                </div>
              )}

              {editMode ? (
                <textarea
                  value={editContent}
                  onChange={(event) => setEditContent(event.target.value)}
                  className="mb-5 min-h-[220px] w-full resize-y rounded-[11px] border border-border-accent bg-surface-raised p-4 text-[13.5px] leading-relaxed text-[#dad5c7] outline-none focus:border-accent"
                />
              ) : (
                <>
                  <div className="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                    VARIANT A
                  </div>
                  <button
                    type="button"
                    onClick={() => setChosenVariant("a")}
                    className={cn(
                      "mb-3.5 w-full rounded-[11px] border p-4 text-left text-[13.5px] leading-relaxed",
                      chosenVariant === "a"
                        ? "border-border-accent bg-surface-raised text-[#dad5c7]"
                        : "border-border bg-[#1a1912] text-text-dim"
                    )}
                  >
                    {detail.draft.variantA}
                  </button>

                  {detail.draft.variantB && (
                    <>
                      <div className="mb-2.5 font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                        VARIANT B
                      </div>
                      <button
                        type="button"
                        onClick={() => setChosenVariant("b")}
                        className={cn(
                          "mb-5 w-full rounded-[11px] border p-4 text-left text-[13.5px] leading-relaxed",
                          chosenVariant === "b"
                            ? "border-border-accent bg-surface-raised text-[#dad5c7]"
                            : "border-border bg-[#1a1912] text-text-dim"
                        )}
                      >
                        {detail.draft.variantB}
                      </button>
                    </>
                  )}
                </>
              )}

              <div className="mt-auto flex flex-col gap-2">
                {editMode ? (
                  <>
                    <Button
                      variant="primary"
                      className="w-full py-3 text-sm"
                      onClick={() => void handleEditSave()}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Save edits
                    </Button>
                    <Button className="w-full" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="primary"
                        className="py-3 text-sm"
                        onClick={() => void handleSaveReady()}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Save ready
                      </Button>
                      <Button className="py-3 text-sm" onClick={() => void handleCopy()}>
                        <Copy className="h-4 w-4" />
                        {copyState === "copied" ? "Copied" : "Copy"}
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={draftType === "dm" ? leadComposeUrl : sourceUrl ?? leadProfileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2e2c20] bg-[#1f1d15] px-3 py-2.5 text-[12.5px] font-medium text-cream transition-colors hover:bg-surface-raised"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open {targetLabel(draftType)}
                      </a>
                      <a
                        href={leadProfileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#2e2c20] bg-[#1f1d15] px-3 py-2.5 text-[12.5px] font-medium text-cream transition-colors hover:bg-surface-raised"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Profile
                      </a>
                    </div>

                    <Button
                      variant="primary"
                      className="w-full py-3 text-sm"
                      onClick={() => void handleApproveAndSend()}
                    >
                      <Send className="h-4 w-4" />
                      {draftType === "dm"
                        ? "Approve & auto-send DM"
                        : "Approve & queue send"}
                    </Button>

                    <Button
                      className="w-full py-2.5"
                      onClick={() => void handleMarkSent()}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Mark sent manually
                    </Button>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        className="py-2.5"
                        onClick={() => {
                          setEditContent(displayContent);
                          setEditMode(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        className="py-2.5"
                        onClick={() =>
                          void regenerate({
                            draftId: detail.draft!._id,
                            leadId: selectedId!,
                          })
                        }
                      >
                        <RotateCcw className="h-4 w-4" />
                        Regenerate
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="ghost"
                        className="py-2"
                        onClick={() => selectedId && void snooze({ leadId: selectedId })}
                      >
                        Snooze
                      </Button>
                      <Button
                        variant="ghost"
                        className="py-2"
                        onClick={() => {
                          if (!selectedId) return;
                          void dismiss({ leadId: selectedId });
                          const next = queue?.find((lead) => lead._id !== selectedId);
                          setSelectedId(next?._id ?? null);
                        }}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted">No draft available.</p>
          )}
        </div>
      </div>
    </div>
  );
}
