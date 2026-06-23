"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/queue", label: "Review Queue", key: "queue" as const },
  { href: "/pipeline", label: "Pipeline", key: "pipeline" as const },
  { href: "/discovery", label: "Discovery", key: "discovery" as const },
  { href: "/settings", label: "Settings", key: "settings" as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const stats = useQuery(api.settings.getSidebarStats);
  const toggleKillSwitch = useMutation(api.settings.toggleKillSwitch);

  const sendsPct =
    stats && stats.dailySendCeiling > 0
      ? Math.min(100, (stats.sendsToday / stats.dailySendCeiling) * 100)
      : 0;

  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-border bg-sidebar px-4 py-[22px]">
      <div className="flex items-center gap-[11px] px-2 pb-[22px]">
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-accent font-serif text-[17px] font-bold text-canvas">
          Z
        </div>
        <div>
          <div className="text-[14.5px] font-semibold leading-none tracking-wide">
            Zitrion
          </div>
          <div className="mt-[3px] font-mono text-[10.5px] tracking-wide text-muted">
            LEAD ENGINE
          </div>
        </div>
      </div>

      <div className="px-2.5 pb-2 font-mono text-[10px] tracking-[0.12em] text-muted-darker">
        WORKSPACE
      </div>
      <nav className="flex flex-col gap-[3px]">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-[11px] py-2.5 text-[13.5px] font-medium tracking-wide transition-colors",
                active
                  ? "bg-[#211f15] text-cream shadow-nav-active"
                  : "text-text-secondary hover:bg-surface-raised/50"
              )}
            >
              {item.label}
              {item.key === "queue" && stats && stats.queueCount > 0 && (
                <span className="ml-auto rounded-full bg-accent px-[7px] py-px font-mono text-[11px] font-semibold text-canvas">
                  {stats.queueCount}
                </span>
              )}
              {item.key === "pipeline" && stats && (
                <span className="ml-auto font-mono text-[11px] text-muted">
                  {stats.pipelineCount}
                </span>
              )}
              {item.key === "discovery" && stats?.discoveryActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3.5">
        <div className="rounded-[10px] border border-[#28261d] bg-[#1c1b14] p-3.5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] tracking-wide text-text-secondary">
              Sends today
            </span>
            <span className="font-mono text-xs text-cream">
              {stats?.sendsToday ?? 0} / {stats?.dailySendCeiling ?? 12}
            </span>
          </div>
          <div className="h-[5px] overflow-hidden rounded bg-[#2a2820]">
            <div
              className="h-full rounded bg-accent transition-all"
              style={{ width: `${sendsPct}%` }}
            />
          </div>
          <div className="mt-2 text-[10.5px] leading-snug text-muted-dark">
            Paced · next send window{" "}
            <span className="text-text-secondary">
              {formatRelativeTime(stats?.nextSendWindowAt)}
            </span>
          </div>
        </div>

        {stats?.killSwitch && (
          <Button
            variant="danger-outline"
            className="w-full text-xs"
            onClick={() => void toggleKillSwitch({ enabled: false })}
          >
            ● Kill switch ON — click to resume
          </Button>
        )}

        <div className="flex items-center gap-2 px-2">
          <div className="h-[26px] w-[26px] shrink-0 rounded-full border border-[#3a382c] bg-[#2e2c22]" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12.5px] font-medium">
              {stats?.ownerName ?? "—"}
            </div>
            <div className="truncate text-[10.5px] text-muted-dark">
              {stats?.ownerHandle ?? "—"}
            </div>
          </div>
          <div
            className={cn(
              "ml-auto h-[7px] w-[7px] shrink-0 rounded-full",
              stats?.sessionActive ? "bg-success" : "bg-muted"
            )}
            title={stats?.sessionActive ? "session active" : "session offline"}
          />
        </div>
      </div>
    </aside>
  );
}
