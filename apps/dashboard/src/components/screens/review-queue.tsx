"use client";

import { useEffect, useMemo, useState } from "react";
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

export function ReviewQueueScreen() {
  const queue = useQuery(api.queue.list);
  const toggleKillSwitch = useMutation(api.settings.toggleKillSwitch);
  const approve = useMutation(api.queue.approve);
  const editDraft = useMutation(api.queue.editDraft);
  const regenerate = useMutation(api.queue.regenerate);
  const snooze = useMutation(api.queue.snooze);
  const dismiss = useMutation(api.queue.dismiss);

  const [selectedId, setSelectedId] = useState<Id<"leads"> | null>(null);
  const detail = useQuery(
    api.queue.getDetail,
    selectedId ? { leadId: selectedId } : "skip"
  );

  const [draftType, setDraftType] = useState<DraftType>("comment");
  const [draftGoal, setDraftGoal] = useState<DraftGoal>("help_first");
  const [chosenVariant, setChosenVariant] = useState<"a" | "b">("a");
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    if (queue?.length && !selectedId) {
      setSelectedId(queue[0]._id);
    }
  }, [queue, selectedId]);

  useEffect(() => {
    if (!detail?.draft) return;
    setDraftType(detail.draft.type ?? "comment");
    setDraftGoal(detail.draft.goal ?? "help_first");
    setChosenVariant(detail.draft.chosenVariant ?? "a");
    const content =
      detail.draft.editedContent ??
      (detail.draft.chosenVariant === "b"
        ? detail.draft.variantB
        : detail.draft.variantA);
    setEditContent(content);
    setEditMode(false);
  }, [detail]);

  const displayContent = useMemo(() => {
    if (!detail?.draft) return "";
    if (editMode) return editContent;
    return chosenVariant === "b"
      ? detail.draft.variantB
      : detail.draft.variantA;
  }, [detail, editMode, editContent, chosenVariant]);

  const handleApprove = async () => {
    if (!selectedId || !detail?.draft) return;
    const content = editMode ? editContent : displayContent;
    await approve({
      leadId: selectedId,
      draftId: detail.draft._id,
      content,
    });
    const next = queue?.find((l) => l._id !== selectedId);
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
            Review Queue
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {queue?.length ?? 0} conversations surfaced today ·{" "}
            <span className="text-text-secondary">
              best 15, scored & researched
            </span>{" "}
            · you approve every send
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="danger-outline"
            onClick={() => void toggleKillSwitch({ enabled: true })}
          >
            ● Kill switch
          </Button>
          <Button>Filters</Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[268px_1fr_1fr]">
        {/* Queue rail */}
        <div className="flex flex-col gap-[7px] overflow-y-auto border-r border-border p-3.5">
          <div className="px-2 pb-1.5 font-mono text-[10px] tracking-[0.1em] text-muted-darker">
            TODAY · {queue?.length ?? 0}
          </div>
          {queue?.map((item) => {
            const active = item._id === selectedId;
            const dimmed = item.score < 50;
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
                <div className="mb-[7px] flex items-center justify-between">
                  <span
                    className={cn(
                      "text-[13px]",
                      active ? "font-semibold" : "font-medium text-text-body"
                    )}
                  >
                    {item.handle}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[13px] font-medium",
                      scoreColor(item.score)
                    )}
                  >
                    {item.score}
                  </span>
                </div>
                <div className="mb-2 text-[11.5px] leading-snug text-[#8c8779]">
                  &ldquo;{item.snippet}&rdquo;
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-[5px] px-[7px] py-0.5 text-[10px] font-medium",
                      intentBadgeClass(item.intent)
                    )}
                  >
                    {intentLabel(item.intent)}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted-dark">
                    {item.subreddit}
                  </span>
                </div>
              </button>
            );
          })}
          {queue?.length === 0 && (
            <p className="px-2 text-sm text-muted">Queue is empty.</p>
          )}
        </div>

        {/* Context card */}
        <div className="overflow-y-auto border-r border-border px-[26px] py-6">
          {detail ? (
            <>
              <div className="mb-[18px] flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-xl border border-border-accent bg-[repeating-linear-gradient(135deg,#2a2820_0_6px,#242219_6px_12px)]" />
                <div>
                  <div className="text-[17px] font-semibold tracking-tight">
                    {detail.lead.handle}
                  </div>
                  <div className="mt-[3px] font-mono text-[11.5px] text-muted">
                    {detail.lead.profileMeta}
                  </div>
                </div>
              </div>

              <div className="mb-[22px] flex flex-wrap gap-2">
                {detail.lead.subreddits.map((sub) => (
                  <span
                    key={sub}
                    className="rounded-full border border-[#28261d] bg-[#1d1c14] px-2.5 py-1 text-[11px] text-text-secondary"
                  >
                    {sub}
                  </span>
                ))}
              </div>

              <div className="mb-[11px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                CONTEXT CARD
              </div>
              <p className="mb-5 text-[13.5px] leading-relaxed text-text-body">
                {detail.lead.contextCard}
              </p>

              <div className="mb-[11px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                THE THREAD
              </div>
              <div className="mb-5 rounded-[11px] border border-border bg-[#1a1912] p-4">
                <div className="mb-2 font-mono text-[11px] text-muted">
                  {detail.lead.threadMeta}
                </div>
                <div className="text-[13.5px] leading-relaxed text-[#dad5c7]">
                  &ldquo;{detail.lead.threadSnippet}&rdquo;
                </div>
              </div>

              <div className="mb-[11px] font-mono text-[10px] tracking-[0.1em] text-muted-darker">
                SCORE · {detail.lead.score}
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
                        style={{ width: `${value}%` }}
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

        {/* Draft panel */}
        <div className="flex flex-col overflow-y-auto bg-panel px-[26px] py-6">
          {detail?.draft ? (
            <>
              <div className="mb-4 flex gap-1.5 rounded-[9px] border border-[#28261d] bg-[#1c1b14] p-[3px]">
                {(["comment", "dm"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setDraftType(type);
                      void editDraft({
                        draftId: detail.draft!._id,
                        content: editContent,
                        type,
                      });
                    }}
                    className={cn(
                      "flex-1 rounded-md py-1.5 text-center text-xs",
                      draftType === type
                        ? "bg-[#2a2820] text-cream"
                        : "text-muted"
                    )}
                  >
                    {type === "comment" ? "Comment reply" : "Chat / DM"}
                  </button>
                ))}
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

              {detail.draft.groundedRefs.length > 0 && (
                <div className="mb-3.5 flex items-center gap-2 rounded-lg border border-[#233322] bg-[#172017] px-[11px] py-2 text-[11px] text-success">
                  ✓ Grounded · references{" "}
                  {detail.draft.groundedRefs.map((ref, i) => (
                    <span key={ref}>
                      {i > 0 && " & "}
                      <span className="text-text-body">{ref}</span>
                    </span>
                  ))}
                </div>
              )}

              {editMode ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="mb-5 min-h-[200px] w-full resize-y rounded-[11px] border border-border-accent bg-surface-raised p-4 text-[13.5px] leading-relaxed text-[#dad5c7] outline-none focus:border-accent"
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
                      Save edits
                    </Button>
                    <Button className="w-full" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      className="w-full py-3 text-sm"
                      onClick={() => void handleApprove()}
                    >
                      Approve & send
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 py-2.5"
                        onClick={() => {
                          setEditContent(displayContent);
                          setEditMode(true);
                        }}
                      >
                        Edit then send
                      </Button>
                      <Button
                        className="flex-1 py-2.5"
                        onClick={() =>
                          void regenerate({
                            draftId: detail.draft!._id,
                            leadId: selectedId!,
                          })
                        }
                      >
                        Regenerate
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        className="flex-1 py-2"
                        onClick={() => selectedId && void snooze({ leadId: selectedId })}
                      >
                        Snooze
                      </Button>
                      <Button
                        variant="ghost"
                        className="flex-1 py-2"
                        onClick={() => {
                          if (!selectedId) return;
                          void dismiss({ leadId: selectedId });
                          const next = queue?.find((l) => l._id !== selectedId);
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
