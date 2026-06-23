# Infrastructure - Zitrion Lead Engine

Self-hosted Convex backend on Dokploy. Mirrors the working `tiptoo` deployment pattern.

## What is already done (via Dokploy MCP)

- Dokploy project **`zitrion-lead-engine`** created.
  - `projectId`: `_6d0mYYCh1Xmp9mM7H1CZ`
  - `environmentId` (production): `jSxwQ8n4MP4T-La3zPePO`

## Why the rest is a guided manual step

The Dokploy MCP exposes project / application / postgres / mysql CRUD, but **no `compose-create`** tool, and self-hosted Convex must run as a multi-service compose stack. Admin-key generation also needs a container run. So the Convex stack is deployed once through the Dokploy UI using the files in this folder.

## Deploy steps

1. In Dokploy, open project **zitrion-lead-engine** -> **Create Service -> Compose**.
2. Source = **Raw**; paste [`docker-compose.prod.yml`](./docker-compose.prod.yml).
3. Open the **Environment** tab and paste the contents of [`.env.example`](./.env.example).
   - Change `CONVEX_CLOUD_ORIGIN` / `CONVEX_SITE_ORIGIN` to real domains you control.
   - Secrets (`INSTANCE_SECRET`, `POSTGRES_PASSWORD`) are pre-generated; keep them private.
4. Add **Domains** in Dokploy:
   - `CONVEX_CLOUD_ORIGIN` host -> service `convex-backend`, container port `3210`.
   - `CONVEX_SITE_ORIGIN` host -> service `convex-backend`, container port `3211`.
   - (optional) a host -> service `convex-dashboard`, container port `6791` for the Convex admin dashboard.
5. **Deploy**. Wait for `convex-backend` to become healthy.
6. Read the logs of the **`convex-admin-key`** service. It prints a key like
   `convex-self-hosted|...`. Copy it into `CONVEX_SELF_HOSTED_ADMIN_KEY` in the env, and into the repo `.env.local` (see below). Re-deploy if you changed compose env.

## Push the Convex schema + functions

From the repo root, with the admin key in hand:

```bash
# .env.local at repo root (consumed by the convex CLI)
CONVEX_SELF_HOSTED_URL=https://convex-lead.zitrion.tech      # = CONVEX_CLOUD_ORIGIN
CONVEX_SELF_HOSTED_ADMIN_KEY=convex-self-hosted|...          # from step 6

npx convex deploy   # pushes convex/ schema + functions to the self-hosted backend
```

The dashboard reads `NEXT_PUBLIC_CONVEX_URL=$CONVEX_CLOUD_ORIGIN`.

## App services (deploy after the code is built)

- `apps/dashboard` (Next.js) and `apps/worker` (Playwright) deploy as their own Dokploy
  applications/compose in the same project, with `NEXT_PUBLIC_CONVEX_URL` and
  `OPENROUTER_API_KEY` set in their env.
