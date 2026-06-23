#!/bin/sh
set -eu

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y git
rm -rf /app
mkdir -p /app
cd /app

git clone --depth 1 --branch master https://github.com/joshwaoti/zitrion-lead-engine.git .
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
exec pnpm --filter @zitrion/worker start
