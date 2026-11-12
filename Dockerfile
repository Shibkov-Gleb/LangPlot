FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
RUN npm install --global pnpm@10.28.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/agents/package.json ./packages/agents/
RUN --mount=type=cache,id=langplot-pnpm-v10,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM dependencies AS api-build
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma
COPY scripts/build-api.mjs ./scripts/build-api.mjs
RUN pnpm --filter @langplot/api db:generate && pnpm --filter @langplot/api build
RUN --mount=type=cache,id=langplot-pnpm-v10,target=/pnpm/store,sharing=locked \
    pnpm --store-dir=/pnpm/store --config.inject-workspace-packages=true --filter @langplot/api deploy --prod --offline /opt/api
RUN pnpm --filter @langplot/api exec prisma generate --schema=/opt/api/prisma/schema.prisma

FROM dependencies AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web/src ./apps/web/src
COPY apps/web/next.config.ts apps/web/tsconfig.json apps/web/next-env.d.ts apps/web/postcss.config.mjs ./apps/web/
COPY scripts/web.mjs ./scripts/web.mjs
RUN NEXT_STANDALONE=1 API_ORIGIN=http://api:4000 pnpm --filter @langplot/web build

FROM base AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 OWNER_INVITE_FILE=/app/var/admin-invite.txt
COPY --from=api-build --chown=node:node /opt/api/node_modules ./apps/api/node_modules
COPY --from=api-build --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=api-build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=api-build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --chown=node:node content ./content
COPY --chown=node:node apps/web/public/assets/voices/en-a2/manifest.json ./apps/web/public/assets/voices/en-a2/manifest.json
RUN mkdir -p /app/var && chown node:node /app/var
USER node
EXPOSE 4000
CMD ["node", "--use-system-ca", "apps/api/dist/server.mjs"]

FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=web-build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node apps/web/public ./apps/web/public
RUN mkdir -p /app/apps/web/.next/cache && chown -R node:node /app/apps/web/.next/cache
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
