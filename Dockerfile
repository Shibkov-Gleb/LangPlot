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
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm --filter @langplot/api db:generate && pnpm --filter @langplot/api build
RUN NEXT_STANDALONE=1 API_ORIGIN=http://api:4000 pnpm --filter @langplot/web build
RUN pnpm --filter @langplot/api deploy --prod --legacy /opt/api
RUN pnpm --filter @langplot/api exec prisma generate --schema=/opt/api/prisma/schema.prisma

FROM base AS api
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 OWNER_INVITE_FILE=/app/var/admin-invite.txt
COPY --from=build --chown=node:node /opt/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/content ./content
COPY --from=build --chown=node:node /app/apps/web/public/assets/voices/en-a2/manifest.json ./apps/web/public/assets/voices/en-a2/manifest.json
RUN mkdir -p /app/var && chown node:node /app/var
USER node
EXPOSE 4000
CMD ["node", "--use-system-ca", "apps/api/dist/server.mjs"]

FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
RUN mkdir -p /app/apps/web/.next/cache && chown -R node:node /app/apps/web/.next/cache
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
