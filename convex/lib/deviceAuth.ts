import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function hashDeviceToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function generateDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function resolveWorkspaceId(
  ctx: QueryCtx | MutationCtx,
  workspaceIdOrSlug: string
): Promise<Id<"workspaces">> {
  const bySlug = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (q) => q.eq("slug", workspaceIdOrSlug))
    .unique();
  if (bySlug) return bySlug._id;

  try {
    const workspace = await ctx.db.get(
      "workspaces",
      workspaceIdOrSlug as Id<"workspaces">
    );
    if (workspace) return workspace._id;
  } catch {
    // Not a valid Convex id string.
  }

  throw new Error("Workspace not found");
}

export async function requireDeviceSession(
  ctx: QueryCtx | MutationCtx,
  deviceToken: string
) {
  const tokenHash = await hashDeviceToken(deviceToken);
  const session = await ctx.db
    .query("deviceTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session) throw new Error("Invalid device token");

  const workspace = await ctx.db.get("workspaces", session.workspaceId);
  if (!workspace) throw new Error("Workspace not found");

  return { session, workspace };
}
