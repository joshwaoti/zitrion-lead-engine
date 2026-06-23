import { pairWorker } from "./convex-client.js";
import { loadPairingConfig } from "./config.js";

async function main(): Promise<void> {
  const { convexUrl, pairingCode, workspaceId } = loadPairingConfig();
  const result = await pairWorker(convexUrl, pairingCode, workspaceId);
  console.log("Worker paired successfully.");
  console.log("Save this token as WORKER_DEVICE_TOKEN (shown once):");
  console.log(result.deviceToken);
}

main().catch((error) => {
  console.error("[zitrion:worker:pair] failed", error);
  process.exit(1);
});
