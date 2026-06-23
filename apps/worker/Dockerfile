FROM mcr.microsoft.com/playwright:v1.49.1-jammy AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# The Playwright v1.49.1 image ships Node 22.12 with an old corepack whose
# bundled pnpm signing keys are stale. pnpm 11.9.0 also requires Node >= 22.13.
# Install a current Node 22.x from NodeSource, refresh corepack, then activate pnpm.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g corepack@latest \
    && corepack enable \
    && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @zitrion/core build || true

ENV NODE_ENV=production
ENV WORKER_HEADLESS=true
ENV REDDIT_USER_DATA_DIR=/data/reddit-profile
VOLUME ["/data"]
CMD ["pnpm", "--filter", "@zitrion/worker", "start"]
