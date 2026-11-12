# syntax=docker/dockerfile:1

# inkan runs as a self-contained Bun server. adapter-bun bundles the whole
# SvelteKit app into build/, so the runtime image carries no node_modules.

FROM oven/bun:1.4-alpine AS build
WORKDIR /app

# Dependencies first, so a source edit does not reinstall them.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# adapter-bun refuses to build unless Vite itself runs on Bun, so the flag is
# part of the command and not an optimisation.
RUN bun run --bun build


FROM oven/bun:1.4-alpine AS run
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
# The server waits this long for in-flight requests on SIGTERM. Fly's
# kill_timeout in fly.toml has to outlast it, or a deploy kills mid-request.
ENV SHUTDOWN_TIMEOUT=10

COPY --from=build --chown=bun:bun /app/build ./build

USER bun
EXPOSE 8080

# No shell wrapper, so SIGTERM reaches the server and it drains cleanly.
CMD ["bun", "build/index.js"]
