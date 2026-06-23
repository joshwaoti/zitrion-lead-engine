import type { WorkspacePacing } from "./executorTypes.js";

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
