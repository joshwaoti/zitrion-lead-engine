"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type ModelSection = "classify" | "score" | "research" | "draft";

const SECTION_LABELS: Record<ModelSection, string> = {
  classify: "Classify",
  score: "Score",
  research: "Research synthesis",
  draft: "Draft",
};

export function SettingsScreen() {
  const settings = useQuery(api.settings.getWorkspaceSettings);
  const modelConfig = useQuery(api.settings.getModelConfig);
  const updateVoice = useMutation(api.settings.updateVoiceGuide);
  const updatePacing = useMutation(api.settings.updatePacing);
  const toggleKillSwitch = useMutation(api.settings.toggleKillSwitch);
  const updateModels = useMutation(api.settings.updateModelConfig);

  const [voiceGuide, setVoiceGuide] = useState("");
  const [editingSection, setEditingSection] = useState<ModelSection | null>(null);
  const [modelDraft, setModelDraft] = useState("");

  useEffect(() => {
    if (settings?.voiceGuide) setVoiceGuide(settings.voiceGuide);
  }, [settings?.voiceGuide]);

  const startEditModels = (section: ModelSection) => {
    if (!modelConfig) return;
    setEditingSection(section);
    setModelDraft(modelConfig[section].join("\n"));
  };

  const saveModels = async () => {
    if (!editingSection) return;
    const models = modelDraft
      .split("\n")
      .map((m) => m.trim())
      .filter(Boolean);
    await updateModels({ section: editingSection, models });
    setEditingSection(null);
  };

  return (
    <div className="flex h-screen flex-col overflow-y-auto">
      <header className="shrink-0 border-b border-border px-[30px] pb-5 pt-[26px]">
        <h1 className="font-serif text-[30px] font-normal leading-none tracking-tight">
          Settings
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Voice, catalog, pacing & connections — what grounds every draft and
          keeps the account safe
        </p>
      </header>

      <div className="grid max-w-[1100px] grid-cols-2 gap-5 px-[30px] py-6 pb-10">
        {/* Voice guide */}
        <div className="col-span-2 rounded-[13px] border border-border bg-surface p-[20px_22px]">
          <div className="mb-1 font-serif text-lg">Voice guide</div>
          <p className="mb-3.5 text-xs text-muted">
            How drafts should sound. Fed into every generation.
          </p>
          <textarea
            value={voiceGuide}
            onChange={(e) => setVoiceGuide(e.target.value)}
            onBlur={() => voiceGuide && void updateVoice({ voiceGuide })}
            className="min-h-[120px] w-full rounded-[9px] border border-[#28261d] bg-panel p-[15px] text-[13px] leading-relaxed text-text-body outline-none focus:border-accent"
          />
        </div>

        {/* Service catalog */}
        <div className="rounded-[13px] border border-border bg-surface p-[20px_22px]">
          <div className="mb-3.5 font-serif text-lg">Service catalog</div>
          <div className="flex flex-col gap-2">
            {settings?.serviceCatalog.map((svc) => (
              <div
                key={svc.name}
                className="rounded-[9px] border border-[#28261d] bg-panel px-3.5 py-3"
              >
                <div className="text-[13px] font-medium">{svc.name}</div>
                <div className="mt-[3px] text-[11.5px] text-muted">
                  {svc.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pacing & safety */}
        <div className="rounded-[13px] border border-border bg-surface p-[20px_22px]">
          <div className="mb-3.5 font-serif text-lg">Pacing & safety</div>
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-2 flex justify-between text-[12.5px]">
                <span className="text-text-secondary">Daily send ceiling</span>
                <span className="font-mono text-accent">
                  {settings?.sendsToday ?? 0} / {settings?.dailySendCeiling ?? 50} today
                </span>
              </label>
              <input
                type="range"
                min={5}
                max={150}
                step={1}
                value={settings?.dailySendCeiling ?? 50}
                onChange={(e) =>
                  void updatePacing({ dailySendCeiling: Number(e.target.value) })
                }
                className="w-full accent-[#c4a035]"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-dark">
                <span>5</span>
                <span>150</span>
              </div>
            </div>
            <div>
              <label className="mb-2 flex justify-between text-[12.5px]">
                <span className="text-text-secondary">Min gap between sends</span>
                <span className="font-mono text-text-body">
                  {settings?.minGapMinutes ?? 4} min
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={settings?.minGapMinutes ?? 4}
                onChange={(e) =>
                  void updatePacing({ minGapMinutes: Number(e.target.value) })
                }
                className="w-full accent-[#8a7a4a]"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-dark">
                <span>1 min</span>
                <span>30 min</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-text-secondary">
                Auto-pause on challenge / throttle
              </span>
              <Switch
                checked={settings?.autoPauseOnThrottle ?? true}
                onCheckedChange={(checked) =>
                  void updatePacing({ autoPauseOnThrottle: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-danger">Global kill switch</span>
              <Switch
                checked={settings?.killSwitch ?? false}
                accent={false}
                onCheckedChange={(enabled) =>
                  void toggleKillSwitch({ enabled })
                }
              />
            </div>
          </div>
        </div>

        {/* Connections */}
        <div className="col-span-2 rounded-[13px] border border-border bg-surface p-[20px_22px]">
          <div className="mb-3.5 font-serif text-lg">Connections</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[10px] border border-[#28261d] bg-panel p-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium">Reddit session</span>
                <span
                  className={`h-[7px] w-[7px] rounded-full ${settings?.redditConnected ? "bg-success" : "bg-muted"}`}
                />
              </div>
              <div className="text-[11.5px] text-muted">
                {settings?.ownerHandle ?? "—"} ·{" "}
                {settings?.sessionActive ? "session active" : "offline"} ·
                Playwright on VPS
              </div>
            </div>
            <div className="rounded-[10px] border border-[#221f18] bg-panel p-4 opacity-65">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-muted">
                  Instagram
                </span>
                <span className="font-mono text-[10px] text-muted-dark">
                  PHASE 2
                </span>
              </div>
              <div className="text-[11.5px] text-muted-dark">
                Same flow, behind SocialAdapter
              </div>
            </div>
          </div>
        </div>

        {/* Models registry */}
        <div className="col-span-2 rounded-[13px] border border-border bg-surface p-[20px_22px]">
          <div className="mb-1 font-serif text-lg">Models registry</div>
          <p className="mb-4 text-xs text-muted">
            OpenRouter free-model fallback chains per pipeline section (3 models
            each). Editable — roster validated on boot.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {(["classify", "score", "research", "draft"] as ModelSection[]).map(
              (section) => (
                <div
                  key={section}
                  className="rounded-[9px] border border-[#28261d] bg-panel p-3.5"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-medium">
                      {SECTION_LABELS[section]}
                    </span>
                    <Button
                      className="px-2 py-1 text-[11px]"
                      onClick={() => startEditModels(section)}
                    >
                      Edit
                    </Button>
                  </div>
                  {editingSection === section ? (
                    <div className="space-y-2">
                      <textarea
                        value={modelDraft}
                        onChange={(e) => setModelDraft(e.target.value)}
                        rows={4}
                        className="w-full rounded border border-border-accent bg-canvas p-2 font-mono text-[11px] text-text-body outline-none"
                        placeholder="one model per line"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          className="text-xs"
                          onClick={() => void saveModels()}
                        >
                          Save
                        </Button>
                        <Button
                          className="text-xs"
                          onClick={() => setEditingSection(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <ol className="list-decimal space-y-1 pl-4 font-mono text-[11px] text-muted">
                      {modelConfig?.[section].map((model, i) => (
                        <li key={model} className={i === 0 ? "text-accent" : ""}>
                          {model}
                        </li>
                      )) ?? (
                        <li className="list-none pl-0 text-muted-dark">
                          Loading…
                        </li>
                      )}
                    </ol>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
