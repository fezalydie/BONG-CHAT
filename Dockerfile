# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# BONG CHAT runs as a single Node process: the Express API, Socket.IO and the
# built React client are all served from the same port. One image, no separate
# web server required (put a reverse proxy in front for TLS in production).
# ---------------------------------------------------------------------------

# ---- Stage 1: install dependencies (needs a toolchain for better-sqlite3) ---
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 and pg compile/link native code during install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install against the workspace manifests first so this layer is cached until
# dependencies actually change.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

# ---- Stage 2: build the server and the client -----------------------------
FROM deps AS build
WORKDIR /app
COPY . .
# tsc for the server + Vite for the client (writes server/dist and client/dist).
RUN npm run build

# Drop dev dependencies now that everything is compiled.
RUN npm prune --omit=dev

# ---- Stage 3: minimal runtime ---------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Writable directories for the SQLite file and uploads. Mount a volume over
# /app/server/data and /app/server/uploads (or point them at PostgreSQL / an
# object store) so data survives container replacement.
RUN mkdir -p server/data server/uploads

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 4000

# The health endpoint the app exposes; also useful for orchestrators.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run automatically on boot (see server/src/index.ts).
CMD ["node", "server/dist/index.js"]
