# API server and its scheduled jobs, one image. The command picks what runs:
#   default                                   the HTTP API (dist/index.mjs)
#   node dist/jobs/expire-orders.mjs          close unpaid abandoned orders
#   node dist/jobs/retry-notifications.mjs    retry failed email deliveries
# esbuild bundles every dependency into dist/, so the runtime stage carries no node_modules.

FROM node:24-slim AS build
RUN corepack enable && corepack prepare pnpm@11 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @workspace/api-server... \
 && pnpm --filter @workspace/api-server run build

FROM node:24-slim
ENV NODE_ENV=production
# The jobs load the same env validation as the server, which requires PORT. Cloud Run services
# override it; Cloud Run Jobs do not set one.
ENV PORT=8080
WORKDIR /app
COPY --from=build /repo/artifacts/api-server/dist ./dist
USER node
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
