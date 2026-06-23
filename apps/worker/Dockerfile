FROM mcr.microsoft.com/playwright:v1.49.1-jammy AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @zitrion/core build || true
RUN pnpm --filter @zitrion/worker typecheck

ENV NODE_ENV=production
ENV WORKER_HEADLESS=true
ENV REDDIT_USER_DATA_DIR=/data/reddit-profile
VOLUME ["/data"]
CMD ["pnpm", "--filter", "@zitrion/worker", "start"]
