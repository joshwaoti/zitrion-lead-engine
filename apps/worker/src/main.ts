import { loadConfig } from "./config.js";
import { runExecutorLoop } from "./executor.js";
import { launchRedditContext } from "./redditAdapter.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const { context, adapter } = await launchRedditContext(
    config.userDataDir,
    config.headless
  );

  process.on("SIGINT", () => {
    void context.close().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void context.close().then(() => process.exit(0));
  });

  await runExecutorLoop(config, adapter);
}

main().catch((error) => {
  console.error("[zitrion:worker] fatal", error);
  process.exit(1);
});
