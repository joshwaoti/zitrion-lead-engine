"use client";

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  accent?: boolean;
  disabled?: boolean;
}

export function Switch({
  checked,
  onCheckedChange,
  accent = true,
  disabled,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-[18px] w-8 shrink-0 rounded-full transition-colors",
        checked ? (accent ? "bg-accent" : "bg-border-strong") : "bg-border-strong"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
          checked ? "right-0.5 bg-canvas" : "left-0.5 bg-[#56534a]"
        )}
      />
    </button>
  );
}
