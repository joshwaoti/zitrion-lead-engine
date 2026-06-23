# VPS Playwright Worker (secondary executor)

Node + Playwright worker that long-polls Convex for **approved** actions and executes them when the Chrome extension is offline. Uses the same `SocialAdapter` contract as the MV3 extension.

## Prerequisites

1. Self-hosted or managed Convex deployment with `extension:pairDevice` and `conversationSync:*` functions deployed.
2. Log into Reddit once in a persistent browser profile (headed mode recommended for first login).
3. Pair the worker and save the device token.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONVEX_URL` | yes | Convex deployment URL |
| `WORKER_DEVICE_TOKEN` | yes | Token from `pnpm pair` |
| `WORKER_WORKSPACE_ID` | pair only | Workspace id (e.g. default workspace `_id`) |
| `EXTENSION_PAIRING_SECRET` | pair only | Same secret as extension pairing |
| `REDDIT_USER_DATA_DIR` | no | Persistent Chromium profile dir (default: `./.data/reddit-profile`) |
| `WORKER_POLL_INTERVAL_MS` | no | Long-poll interval (default `30000`) |
| `WORKER_HEADLESS` | no | Set `false` for first login / debugging |

## Pairing (one-time)

```bash
cd apps/worker
pnpm install
CONVEX_URL=https://your.convex.site \
EXTENSION_PAIRING_SECRET=your-secret \
WORKER_WORKSPACE_ID=your_workspace_id \
pnpm pair
```

Copy the printed token into `WORKER_DEVICE_TOKEN`.

## Run

```bash
# First login (headed — complete Reddit auth in the opened browser)
WORKER_HEADLESS=false REDDIT_USER_DATA_DIR=./.data/reddit-profile \
CONVEX_URL=https://your.convex.site \
WORKER_DEVICE_TOKEN=... \
pnpm start

# Production (headless after session is warm)
pnpm start
```

## Behaviour

- **Yields to extension**: if a Chrome extension heartbeat was seen within 5 minutes, the worker will not claim actions.
- **Paced sends**: respects workspace `dailySendCeiling`, `minGapMinutes`, and kill switch from Convex.
- **Inbox sync (Phase 1)**: reads Reddit chat previews via Playwright and pushes inbound messages to `conversationSync:ingestInboxMessages`; cron + internal mutations match leads and advance pipeline (`contacted → replied → in_conversation`).

## Stub vs implemented

| Feature | Status |
|---------|--------|
| Long-poll approved actions | Implemented |
| Reddit comment + DM via Playwright | Implemented (best-effort selectors) |
| Persistent `userDataDir` session | Implemented |
| Inbox read + pipeline advance | Implemented (chat list previews) |
| Instagram | Stub (`InstagramAdapterStub` in `@zitrion/core`) |
| Discovery scrape on worker | Available via adapter but not wired in main loop |
