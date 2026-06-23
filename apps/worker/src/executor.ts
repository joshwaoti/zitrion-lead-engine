import type { WorkerConfig } from "@zitrion/core";
import { canSendNow, msUntilNextSend } from "@zitrion/core";
import type { RedditPlaywrightAdapter } from "./redditAdapter.js";
import {
  claimApprovedAction,
  fetchWorkspacePacing,
  getSyncRequested,
  ingestInboxMessages,
  markInboxSynced,
  reportActionResult,
  reportThrottle,
  sendHeartbeat,
} from "./convex-client.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runExecutorLoop(
  config: WorkerConfig,
  adapter: RedditPlaywrightAdapter
): Promise<never> {
  console.info("[zitrion:worker] starting executor loop", {
    userDataDir: config.userDataDir,
    pollIntervalMs: config.pollIntervalMs,
    headless: config.headless,
  });

  while (true) {
    try {
      const sessionActive = await adapter.isSessionActive();
      await sendHeartbeat(config.convexUrl, config.deviceToken, sessionActive);

      if (!sessionActive) {
        console.warn("[zitrion:worker] Reddit session not active — log in via headed browser");
        await sleep(config.pollIntervalMs);
        continue;
      }

      const pacing = await fetchWorkspacePacing(
        config.convexUrl,
        config.deviceToken
      );

      if (pacing.killSwitch) {
        console.info("[zitrion:worker] kill switch active — idle");
        await sleep(config.pollIntervalMs);
        continue;
      }

      const sync = await getSyncRequested(config.convexUrl, config.deviceToken);
      if (sync.shouldSync && adapter.readInbox) {
        const messages = await adapter.readInbox(30);
        if (messages.length > 0) {
          const result = await ingestInboxMessages(
            config.convexUrl,
            config.deviceToken,
            messages
          );
          console.info("[zitrion:worker] inbox sync", result);
        }
        await markInboxSynced(config.convexUrl, config.deviceToken);
      }

      if (!canSendNow(pacing)) {
        const waitMs = Math.max(
          msUntilNextSend(pacing),
          config.pollIntervalMs
        );
        await sleep(waitMs);
        continue;
      }

      const action = await claimApprovedAction(
        config.convexUrl,
        config.deviceToken
      );

      if (!action) {
        await sleep(config.pollIntervalMs);
        continue;
      }

      console.info("[zitrion:worker] executing action", action._id, action.type);
      const result = await adapter.send({
        type: action.type,
        target: action.targetUrl,
        body: action.content,
      });

      if (result.ok) {
        await reportActionResult(config.convexUrl, config.deviceToken, {
          actionId: action._id,
          status: "done",
          permalink: result.permalink,
        });
        console.info("[zitrion:worker] action done", result.permalink);
      } else {
        await reportActionResult(config.convexUrl, config.deviceToken, {
          actionId: action._id,
          status: "failed",
          errorMessage: result.error,
        });
        const throttled = /rate|limit|verify|captcha|blocked/i.test(result.error ?? "");
        if (throttled) {
          await reportThrottle(
            config.convexUrl,
            config.deviceToken,
            result.error ?? "throttled"
          );
        }
        console.error("[zitrion:worker] action failed", result.error);
      }
    } catch (error) {
      console.error(
        "[zitrion:worker] loop error",
        error instanceof Error ? error.message : error
      );
      await sleep(config.pollIntervalMs);
    }
  }
}
