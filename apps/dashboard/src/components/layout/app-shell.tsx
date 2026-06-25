import { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { LiveStatusBar } from "./activity-feed";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <LiveStatusBar />
        {children}
      </main>
    </div>
  );
}
