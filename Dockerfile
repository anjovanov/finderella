# syntax=docker/dockerfile:1
# Finderella hub image (ghcr.io/anjovanov/finderella), published by .github/workflows/release.yml.
# It also carries the storage gateway: docker-compose.yml's `local-gateway` service runs it
# for media on the same machine. The file set is scripts/package-hub.sh's, the same as the
# release tarball's.

ARG NODE_VERSION=22

# Build once on the runner's own platform: the output is plain JavaScript, and building
# under QEMU for arm64 would take many times longer.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/storage-gateway/package.json packages/storage-gateway/
RUN npm ci
COPY . .
# Route analysis during `vite build` imports the db and auth modules, which refuse to load
# without these. Placeholders, set for this command only: nothing connects at build time,
# and both are read from the environment when the server starts.
RUN DATABASE_URL=postgres://build@localhost/build \
	BETTER_AUTH_SECRET=build-time-placeholder-never-used-at-runtime \
	npm run build \
	&& npm run build --workspace @finderella/storage-gateway \
	&& sh scripts/package-hub.sh /out

# Runtime dependencies on the target platform, so ffmpeg-static and ffprobe fetch the
# binaries for the image's architecture.
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY --from=build /out ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=3000
WORKDIR /app
# The gateway's config (pairing token) and cache folders, created here so the compose
# file's named volumes start out owned by `node` instead of root.
RUN mkdir -p /home/node/.config/finderella-storage-gateway /home/node/.cache/finderella-storage-gateway \
	&& chown -R node:node /home/node/.config /home/node/.cache
COPY --from=deps --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "node server/migrate.js && exec node server/index.js"]
