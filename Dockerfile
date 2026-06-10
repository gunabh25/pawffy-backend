FROM node:22-slim AS base
WORKDIR /app
ENV NODE_ENV=production

# OpenSSL is required by Prisma on slim images
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ─── Install dependencies ──────────────────────────────────────────────────────
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Copy source and generate Prisma client ───────────────────────────────────
COPY . .
RUN npx prisma generate

# ─── Startup script: push schema then start server ────────────────────────────
RUN chmod +x start.sh
EXPOSE 10000
CMD ["sh", "start.sh"]
