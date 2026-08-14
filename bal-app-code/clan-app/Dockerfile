# ════════════════════════════════════════════════════════════════════════════════
#  Clan App Backend — Production Multi-Stage Dockerfile (Node.js 20 ESM)
# ════════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Build & Dependencies ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for argon2 and native bindings
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci && npx prisma generate

# ── Stage 2: Production Runtime ──
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies for healthchecks
RUN apk add --no-cache dumb-init curl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 clanapp

COPY --chown=clanapp:nodejs package.json package-lock.json ./
COPY --chown=clanapp:nodejs --from=builder /app/node_modules ./node_modules
COPY --chown=clanapp:nodejs src ./src
COPY --chown=clanapp:nodejs prisma ./prisma
COPY --chown=clanapp:nodejs scripts ./scripts
COPY --chown=clanapp:nodejs deploy ./deploy

USER clanapp

EXPOSE 3000 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
