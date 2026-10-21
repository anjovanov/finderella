> ⚠️ **THIS APP IS CURRENTLY IN ACTIVE DEVELOPMENT AND AT A VERY EARLY STAGE — FUNCTIONALITIES MIGHT BE MISSING OR INCOMPLETE.**

# Finderella

A self-hosted media streaming app — like Plex or Jellyfin, except the server and
your media **don't have to live on the same machine**.

Run the Finderella **hub** (this web app) on a small VPS with next to no
storage. Keep your movies and shows wherever they already are — a desktop, home
server, or NAS — and run a lightweight **storage gateway**
(`finderella-storage-gateway`, the media agent) on each of those devices.
Gateways dial out to the hub over a single WebSocket (no port forwarding, works
behind NAT), report their libraries, and serve playback through the tunnel:
browser-compatible files stream directly; everything else is transcoded to HLS
by ffmpeg **on the device that owns the file**, so the VPS never needs the CPU
or the disk.

```
Browser ──HTTPS──►  Hub (SvelteKit + Postgres, on your VPS)
                      ▲  one outbound WebSocket per device
        Storage gateways — finderella-storage-gateway (Node CLI):
        scanning · file serving · ffmpeg HLS
```

## Features

- Movies + series catalog: titles parsed from filenames, then posters,
  synopses, genres, cast and ratings fetched from TMDB (optional
  `TMDB_API_KEY`; deterministic generated artwork otherwise), search, genre
  browsing
- Netflix-style player: custom controls, subtitles, episode browser, autoplay
  next with countdown, resume, continue-watching row
- Direct play (byte-range proxy) and on-gateway HLS transcoding with instant
  seeking (hub-synthesized VOD playlists); a source-aware quality menu
  (Original/2160p/1080p/720p/480p/360p) caps bitrate for gateways on slow
  uplinks; 4K and HDR sources are transcoded (tone-mapped) to browser-safe
  H.264
- Multi-device: pool media from any number of gateways; per-device pairing tokens,
  revocable from the UI
- Auth via Better Auth (email/password); every stream is session-authorized

## Hub setup (VPS)

Each [release](../../releases) ships the hub as a Docker image and as a tarball, and the
storage gateway on its own. Pick one of these:

**Docker (recommended).** Download `docker-compose.yml` from the latest release into an
empty folder, add a `.env` next to it (the variables are listed at the top of the
file: `ORIGIN`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`), then:

```sh
docker compose up -d   # hub on :3000 + PostgreSQL; migrations run on start
```

**Release tarball** (Node.js 22+, PostgreSQL):

```sh
tar xzf finderella-hub-<version>.tar.gz && cd finderella-hub-<version>
npm ci --omit=dev
cp .env.example .env       # set DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET
npm run db:migrate:deploy
npm start                  # serves the app + storage-gateway WebSocket on :3000
```

**From source:**

```sh
git clone <this repo> && cd finderella
npm ci
cp .env.example .env   # set DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET
npm run db:migrate
npm run build
npm start
```

Put a TLS reverse proxy in front (nginx/Caddy) and make sure WebSocket upgrades
are forwarded on `/gateway/ws` and `/ws/together` (nginx: `proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";`).

Open the site, create the first account, and you're in.

## Adding your media

Install the storage gateway (`finderella-storage-gateway`, the media agent) on
each device that holds media — see
**[docs/gateway-install.md](docs/gateway-install.md)** for the full guide. Short
version:

```sh
npm install -g https://github.com/anjovanov/finderella/releases/latest/download/finderella-storage-gateway.tgz
finderella-storage-gateway pair --hub https://your-hub-domain --code <code from Settings → Devices>
finderella-storage-gateway connect
```

Then add library folders on the devices page; scans run automatically. Media on
the hub's own machine needs no separate install: the hub tarball and the Docker
image include the gateway.

## Development

```sh
npm install
cp .env.example .env    # point DATABASE_URL at a local Postgres; TMDB_API_KEY optional
npm run db:push
npm run dev
```

Run a local storage gateway against the dev server with `GATEWAY_DEV_TOKEN` set
in `.env`:

```sh
npm run gateway:dev -- connect
```

Useful scripts: `npm test` (protocol/parser/mp4 unit tests), `npm run check`
(svelte-check), `npm run lint` / `npm run format`, `npm run db:studio`.

Workspace layout: the repo root is the SvelteKit hub; `packages/protocol` holds
the shared zod message schemas and binary framing; `packages/storage-gateway` is the
storage-gateway CLI (`finderella-storage-gateway`, the media agent). See
`docs/architecture.md` for architecture details and `CLAUDE.md` for conventions and
hard-won gotchas.

## Releasing

Bump both versions, then push a `vX.Y.Z` tag. CI tests everything and publishes one
GitHub release with the hub image, hub tarball and storage gateway. See
[docs/releasing.md](docs/releasing.md).
