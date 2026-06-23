#!/bin/sh
set -eu

apk add --no-cache git curl
rm -rf /app
mkdir -p /app
cd /app

git clone --depth 1 --branch master https://github.com/joshwaoti/zitrion-lead-engine.git .
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile

export NEXT_PUBLIC_CONVEX_URL="${NEXT_PUBLIC_CONVEX_URL:-https://convex-lead.zitrion.tech}"
pnpm --filter @zitrion/dashboard build

cd /app/apps/dashboard
export HOSTNAME=0.0.0.0
export PORT=3000
exec pnpm start
