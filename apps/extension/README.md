# Zitrion Lead Engine — Chrome Extension

MV3 extension (Vite + CRXJS) that runs as the **primary executor** on your live Reddit Chrome session — Instaworm-style discovery + paced auto-send.

## Structure

```
apps/extension/
├── manifest.json              # MV3 permissions (reddit, storage, alarms)
├── vite.config.ts
├── package.json
├── icons/                     # 16/48/128 PNG placeholders
└── src/
    ├── background/
    │   └── service-worker.ts  # Convex pairing, alarms, action queue
    ├── content/
    │   ├── reddit/
    │   │   ├── index.ts       # Message bridge + throttle observer
    │   │   ├── scraper.ts     # Subreddit/keyword discovery + DOM scrape
    │   │   └── executor.ts    # Comment + Reddit Chat DM executor
    │   └── instagram/
    │       └── stub.ts        # Phase 2 placeholder
    ├── lib/
    │   ├── convex-client.ts   # Convex HTTP API client
    │   ├── storage.ts         # chrome.storage.local config + status
    │   ├── pacing.ts          # Daily ceiling + gap helpers
    │   ├── throttle-detector.ts
    │   └── messages.ts        # Typed message contracts
    └── popup/
        ├── popup.html         # Status, kill switch, dashboard link
        ├── popup.ts
        └── popup.css
```

Shared types live in `packages/core` (`@zitrion/core`).

## Development

From repo root:

```bash
pnpm install
pnpm --filter @zitrion/extension dev
```

Build for loading unpacked:

```bash
pnpm --filter @zitrion/extension build
```

Output: `apps/extension/dist/`

## Load unpacked in Chrome

1. Run `pnpm --filter @zitrion/extension build` (or `dev` for watch mode).
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select `apps/extension/dist`.
6. Log into Reddit in the same Chrome profile.
7. Open the extension popup → **Pairing / config**:
   - **Convex URL** — your self-hosted Convex cloud origin (e.g. `https://convex-lead.zitrion.tech`)
   - **Workspace ID** — Convex `workspaces` document id
   - **Device token** — from `extension:pairDevice` (one-time pairing via dashboard/CLI)
   - **Dashboard URL** — link for “Open dashboard”

## Pairing (first run)

Call the Convex mutation once (dashboard or CLI):

```bash
npx convex run extension:pairDevice '{"pairingCode":"YOUR_SECRET","workspaceId":"..."}'
```

Set `EXTENSION_PAIRING_SECRET` in your Convex deployment env. The mutation returns a `deviceToken` — paste it into the popup and save.

## Convex endpoints used

| Function | Type | Purpose |
|----------|------|---------|
| `extension:pairDevice` | mutation | One-time device pairing (returns token) |
| `extension:getWatchRules` | query | Fetch enabled subreddit/keyword rules |
| `extension:getWorkspacePacing` | query | Kill switch, sends today, gaps, pause state |
| `extension:ingestCandidate` | mutation | Ingest single raw candidate |
| `extension:ingestCandidates` | mutation | Batch ingest (discovery poll) |
| `extension:claimApprovedAction` | mutation | Claim one approved action (marks `executing`) |
| `extension:reportActionResult` | mutation | Report done/failed + permalink |
| `extension:heartbeat` | mutation | Session liveness + last poll |
| `extension:setExtensionPaused` | mutation | Manual/auto pause |
| `extension:reportThrottle` | mutation | Throttle/verification detection → auto-pause |

## Behavior

- **Discovery alarm** (every 15 min): pulls watch rules, scrapes Reddit JSON + visible DOM via content script, pushes raw candidates.
- **Action poll alarm** (every 2 min): claims one approved action, opens target tab, executes comment or DM on live session, reports result.
- **Pacing**: respects workspace `dailySendCeiling`, `minGapMinutes` + random jitter (set server-side on success).
- **Kill switch**: local popup toggle + workspace `killSwitch` from Convex.
- **Auto-pause**: content script + executor detect captcha/rate-limit copy; background calls `reportThrottle` + pauses when `autoPauseOnThrottle` is enabled.

## Permissions

- `storage`, `alarms`, `tabs`, `scripting`
- Host: `reddit.com`, `old.reddit.com`, Convex URLs

No Reddit credentials are stored — the extension uses your existing logged-in session cookies.
