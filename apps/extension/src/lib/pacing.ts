import type { WorkspacePacing } from "@zitrion/core";

export function canSendNow(pacing: WorkspacePacing, now = Date.now()): boolean {
  if (pacing.killSwitch) return false;
  if (pacing.sendsToday >= pacing.dailySendCeiling) return false;
  if (pacing.nextSendWindowAt && pacing.nextSendWindowAt > now) return false;
  return true;
}

export function randomGapMs(minGapMinutes: number): number {
  const base = minGapMinutes * 60_000;
  const jitter = Math.floor(Math.random() * base);
  return base + jitter;
}

export function msUntilNextSend(pacing: WorkspacePacing, now = Date.now()): number {
  if (!pacing.nextSendWindowAt) return 0;
  return Math.max(0, pacing.nextSendWindowAt - now);
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Ready";
  const minutes = Math.ceil(ms / 60_000);
  return `${minutes}m`;
}
