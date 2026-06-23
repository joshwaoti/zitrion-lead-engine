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

STANDALONE=/app/apps/dashboard/.next/standalone
mkdir -p "$STANDALONE/apps/dashboard/.next"
cp -r /app/apps/dashboard/.next/static "$STANDALONE/apps/dashboard/.next/static"
cp -r /app/apps/dashboard/public "$STANDALONE/apps/dashboard/public"

cd "$STANDALONE"
export HOSTNAME=0.0.0.0
export PORT=3000
exec node apps/dashboard/server.js
