# Infrastructure - Zitrion Lead Engine

Self-hosted Convex backend and app services are deployed to Dokploy.

## Dokploy Project

- Project: `zitrion-lead-engine`
- `projectId`: `_6d0mYYCh1Xmp9mM7H1CZ`
- Production `environmentId`: `jSxwQ8n4MP4T-La3zPePO`
- GitHub repo: `https://github.com/joshwaoti/zitrion-lead-engine`

## Deployed Services

- Postgres: `zitrion-lead-postgres`
  - `postgresId`: `ugehq-zZq578mz7uhHEMs`
  - internal app name: `zitrion-lead-postgres-zxvyep`
- Convex backend: `zitrion-convex-backend`
  - `applicationId`: `D6c822ISylyNePL-Nmaen`
  - image: `ghcr.io/get-convex/convex-backend:latest`
  - API: `https://convex-lead.zitrion.tech` -> port `3210`
  - HTTP/site actions: `https://convex-site-lead.zitrion.tech` -> port `3211`
- Convex admin dashboard: `zitrion-convex-dashboard`
  - `applicationId`: `KR3hpFftejoQYJRQGNFRd`
  - URL: `https://convex-dashboard-lead.zitrion.tech` -> port `6791`
- App dashboard: `zitrion-lead-dashboard`
  - `applicationId`: `24ulbXw_JnI6c6wue_iDt`
  - URL: `https://lead.zitrion.tech` -> port `3000`
  - build: `apps/dashboard/Dockerfile` from repo root
- VPS worker: `zitrion-lead-worker`
  - `applicationId`: `vpIHoFS44g1hNcspHsud_`
  - build: `apps/worker/Dockerfile` from repo root

## Local Secret Files

Generated secrets are stored locally and intentionally ignored by git:

- `infra/.env.deploy.local`: Dokploy/Convex deployment secrets, URLs, generated worker token.
- `.env.local`: Convex CLI values for pushing to the self-hosted backend.

Do not commit these files.

## Convex Deployment

Convex schema and functions were pushed with:

```bash
npx convex deploy
```

Required Convex deployment env vars are set with `npx convex env set`:

- `EXTENSION_PAIRING_SECRET`
- `OPENROUTER_API_KEY`
- `OPENROUTER_APP_URL`
- `OPENROUTER_APP_TITLE`

The seeded default workspace id is `k978c7vfeap486dcxfwxwsw6bn8964ph`.

## DNS Records

Point these hosts at the Dokploy VPS:

- `lead.zitrion.tech`
- `convex-lead.zitrion.tech`
- `convex-site-lead.zitrion.tech`
- `convex-dashboard-lead.zitrion.tech`

Dokploy is configured to request Let's Encrypt certificates for all four hosts.
