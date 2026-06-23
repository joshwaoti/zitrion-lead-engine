"use node";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { defaultChainFor, type PipelineSection } from "@zitrion/core";
import { extractJson } from "./json";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const MAX_RATE_LIMIT_RETRIES = 4;
const MAX_BACKOFF_MS = 30_000;

interface OpenRouterMessage {
  content?: string | null;
  reasoning?: string | null;
}

interface OpenRouterChoice {
  message?: OpenRouterMessage;
}

interface OpenRouterChatResponse {
  choices?: OpenRouterChoice[];
}

interface SingleCallResult {
  ok: boolean;
  rateLimited: boolean;
  retryAfterMs: number | null;
  errorMessage?: string;
  content: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function buildHeaders(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set in the Convex environment");
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const appUrl = process.env.OPENROUTER_APP_URL;
  const appTitle = process.env.OPENROUTER_APP_TITLE;
  if (appUrl) headers["HTTP-Referer"] = appUrl;
  if (appTitle) headers["X-Title"] = appTitle;
  return headers;
}

async function callOnce(
  model: string,
  system: string,
  user: string
): Promise<SingleCallResult> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.6,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      rateLimited: false,
      retryAfterMs: null,
      content: null,
      errorMessage: err instanceof Error ? err.message : "network error",
    };
  }

  if (response.status === 429) {
    return {
      ok: false,
      rateLimited: true,
      retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      content: null,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      rateLimited: false,
      retryAfterMs: null,
      content: null,
      errorMessage: `HTTP ${response.status}`,
    };
  }

  const data = (await response.json()) as OpenRouterChatResponse;
  const message = data.choices?.[0]?.message;
  const content =
    message?.content && message.content.trim().length > 0
      ? message.content
      : (message?.reasoning ?? null);

  return {
    ok: true,
    rateLimited: false,
    retryAfterMs: null,
    content,
  };
}

async function resolveChain(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  section: PipelineSection
): Promise<string[]> {
  const configured = await ctx.runQuery(internal.modelConfig.getChainInternal, {
    workspaceId,
    section,
  });
  if (configured.length > 0) return configured;
  return defaultChainFor(section);
}

export interface CallModelOptions<T> {
  workspaceId: Id<"workspaces">;
  section: PipelineSection;
  system: string;
  user: string;
  validate: (parsed: unknown) => T | null;
}

export async function callModel<T>(
  ctx: ActionCtx,
  options: CallModelOptions<T>
): Promise<T> {
  const chain = await resolveChain(ctx, options.workspaceId, options.section);
  const failures: string[] = [];

  for (const model of chain) {
    let rateLimitAttempts = 0;

    while (true) {
      const result = await callOnce(model, options.system, options.user);

      if (result.rateLimited) {
        if (rateLimitAttempts >= MAX_RATE_LIMIT_RETRIES) {
          failures.push(
            `${model}: rate-limited (gave up after ${rateLimitAttempts} retries)`
          );
          break;
        }
        const backoff =
          result.retryAfterMs ??
          Math.min(MAX_BACKOFF_MS, 1000 * 2 ** rateLimitAttempts);
        await sleep(backoff + Math.floor(Math.random() * 250));
        rateLimitAttempts += 1;
        continue;
      }

      if (!result.ok) {
        failures.push(`${model}: ${result.errorMessage ?? "request failed"}`);
        break;
      }

      if (!result.content || result.content.trim().length === 0) {
        failures.push(`${model}: empty content`);
        break;
      }

      const parsed = extractJson(result.content);
      if (parsed === undefined) {
        failures.push(`${model}: unparseable JSON`);
        break;
      }

      const validated = options.validate(parsed);
      if (validated === null) {
        failures.push(`${model}: JSON failed schema validation`);
        break;
      }

      return validated;
    }
  }

  throw new Error(
    `Model gateway exhausted chain for section "${options.section}": ${failures.join("; ")}`
  );
}

interface OpenRouterModelsResponse {
  data?: { id: string }[];
}

export async function fetchAvailableModelIds(): Promise<Set<string>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const headers: Record<string, string> = apiKey
    ? { Authorization: `Bearer ${apiKey}` }
    : {};
  const response = await fetch(OPENROUTER_MODELS_URL, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenRouter models list: HTTP ${response.status}`
    );
  }
  const data = (await response.json()) as OpenRouterModelsResponse;
  return new Set((data.data ?? []).map((model) => model.id));
}

export function findMissingModels(
  configured: string[],
  available: Set<string>
): string[] {
  return configured.filter((id) => !available.has(id));
}
