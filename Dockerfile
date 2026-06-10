FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# ─── Install dependencies ──────────────────────────────────────────────────────
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Copy source and generate Prisma client ───────────────────────────────────
COPY . .
RUN npx prisma generate

# ─── Expose port and start ────────────────────────────────────────────────────
EXPOSE 10000
CMD ["node", "server.js"]
