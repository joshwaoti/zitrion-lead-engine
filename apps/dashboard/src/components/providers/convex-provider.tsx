"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convex = convexUrl
  ? new ConvexReactClient(convexUrl)
  : null;

function Bootstrap({ children }: { children: ReactNode }) {
  const bootstrap = useMutation(api.queue.bootstrap);

  useEffect(() => {
    if (convexUrl) {
      void bootstrap({});
    }
  }, [bootstrap]);

  return <>{children}</>;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas text-cream">
        <div className="max-w-md text-center space-y-3 p-8">
          <h1 className="font-serif text-2xl">Convex not configured</h1>
          <p className="text-muted text-sm">
            Set <code className="font-mono text-text-secondary">NEXT_PUBLIC_CONVEX_URL</code> in{" "}
            <code className="font-mono text-text-secondary">apps/dashboard/.env.local</code> and run{" "}
            <code className="font-mono text-text-secondary">npx convex dev</code> from the repo root.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <Bootstrap>{children}</Bootstrap>
    </ConvexProvider>
  );
}
