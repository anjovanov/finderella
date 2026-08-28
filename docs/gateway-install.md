# Installing a storage gateway (media agent)

The Finderella **hub** (the web app) runs on a server — typically a small VPS with
little storage. Your media stays on the machines that already hold it (a desktop,
home server, or NAS), each running a lightweight **storage gateway** — the
`finderella-storage-gateway` CLI, Finderella's media agent — that connects
_out_ to the hub over a single WebSocket. The hub catalogs everything and streams
playback to your browser by pulling bytes through that tunnel — direct streaming
for browser-compatible files, on-device ffmpeg transcoding (HLS) for the rest.

Because the gateway only dials out, it works behind NAT/CGNAT with **no port
forwarding or router configuration**.

## Prerequisites

- Node.js 18 or newer on the media device (`node --version`).
- ffmpeg is **optional**: a static build ships with the gateway and is used
  automatically. If the device has its own ffmpeg (often with hardware
  acceleration), the gateway prefers it. Override with `FFMPEG_PATH` /
  `FFPROBE_PATH` if needed.

## 1. Install the storage gateway

Grab the tarball URL from the [latest release](../../releases/latest) and:

```sh
npm install -g https://github.com/<owner>/<repo>/releases/download/v0.0.1/finderella-storage-gateway-0.0.1.tgz
```

Verify:

```sh
finderella-storage-gateway --version
```

### Alternative: gateway on the same machine as the hub

If your media lives on the machine that hosts the hub itself, skip the tarball —
the repo you deployed the hub from already contains the gateway. Build it once in
the hub's checkout:

```sh
npm run build --workspace @finderella/storage-gateway
```

and run it with `node` instead of the global command (they are the same file —
the `finderella-storage-gateway` bin is just a symlink to `dist/cli.js`):

```sh
node packages/storage-gateway/dist/cli.js pair --hub http://localhost:3000 --code ABCD1234 --name "This server"
node packages/storage-gateway/dist/cli.js connect
```

Pairing against `http://localhost:3000` is deliberate: the token exchange and
the WebSocket stay on loopback (your reverse proxy still handles TLS for
browsers). Everything below applies unchanged — substitute
`node /path/to/repo/packages/storage-gateway/dist/cli.js connect` as the `ExecStart` in
the systemd unit, and note that a production hub requires the real pairing flow
(the `GATEWAY_DEV_TOKEN` shortcut only works under `npm run dev`). Updates come
from the repo (`git pull`, rebuild both, restart both services) rather than a
release tarball. Optional: `npm install -g ./packages/storage-gateway` after building
gives you the bare `finderella-storage-gateway` command on this machine too.

## 2. Generate a pairing code (hub)

In the Finderella web UI, open **Settings → Devices** (`/settings/devices`),
enter a device name, and click **Generate code**. Codes are single-use and
expire after 10 minutes.

## 3. Pair (device, one-time)

```sh
finderella-storage-gateway pair --hub https://your-hub-domain --code ABCD1234
```

This exchanges the code for the device's permanent token, saved to
`~/.config/finderella-storage-gateway/config.json` (owner-readable only). You won't need
`--hub` or `--code` again.

## 4. Connect (device)

```sh
finderella-storage-gateway connect
```

The devices page on the hub shows the device with a green dot within seconds.

## 5. Add media libraries (hub)

On the device's card in **Settings → Devices**, add each media folder:

- **Path**: the absolute path _as the device sees it_, e.g. `/mnt/storage/movies`
  (on WSL2, a Windows folder is `/mnt/c/...`).
- **Kind**: Movies or Series — a movie library treats every file as a movie.

The first scan starts automatically. Use **Rescan** after adding files.

Recognized extensions: `.mp4 .m4v .mkv .webm .mov .avi .ts .wmv`
(hidden files and dot-folders are skipped).

Naming conventions the scanner parses:

```
Movies/
  The Hollow Meridian (2019).mkv
  Some.Movie.2021.1080p.x264.mp4

Shows/
  Harbor of Echoes/
    Season 01/
      S01E01 - The Ledger.mkv
      S01E02 - Thirty Years Late.mkv
```

Posters, synopses and episode titles appear a little after a scan finishes when the hub has a `TMDB_API_KEY` configured (see the hub's `.env.example`).

## 6. Run it permanently

`connect` is a foreground process. On Linux, hand it to systemd:

```ini
# /etc/systemd/system/finderella-storage-gateway.service
[Unit]
Description=Finderella storage gateway (media agent)
After=network-online.target
Wants=network-online.target

[Service]
User=YOUR_USER
ExecStart=/usr/bin/env finderella-storage-gateway connect
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now finderella-storage-gateway
```

Use the account that ran `pair` (it owns the config file) and that can read the
media folders. On Windows, use Task Scheduler ("At startup") or a service
wrapper like NSSM; on macOS, a `launchd` agent.

## Updating

```sh
npm install -g <new release tarball URL>
sudo systemctl restart finderella-storage-gateway
```

## Troubleshooting

| Symptom                                                | Cause / fix                                                                                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `401` on connect                                       | Device was revoked, or stale token — generate a new code and re-`pair`.                                                                                                                                                     |
| Pairs fine but never connects (hub behind nginx/Caddy) | The reverse proxy must forward WebSocket upgrades on `/gateway/ws` (nginx: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`). Pairing is plain HTTPS, so it can succeed while WS is broken. |
| "Add library" disabled                                 | The device is offline (or the page is stale — refresh).                                                                                                                                                                     |
| Titles missing codec/duration; transcoding refused     | The library was scanned without ffprobe — check `connect` startup output, then Rescan.                                                                                                                                      |
| Player shows "Can't play this right now" mid-stream    | The transcode failed. The gateway's `connect` output has ffmpeg's stderr (`ffmpeg failed (…)`), and the hub log has a `gateway request failed` line with the same reason.                                                   |
| 4K transcodes stutter or seeks take long               | A 4K HEVC→H.264 software transcode runs near real-time on a desktop-class CPU (veryfast preset); pick a lower quality in the player, or host 4K files on a machine with more cores.                                         |
| `ffmpeg NOT found` at startup                          | Transcoding unavailable from this device; direct-play still works. Install ffmpeg or rely on the bundled static build (absent only on unusual platforms).                                                                   |

## Security notes

- The gateway holds a single bearer token, revocable any time from
  **Settings → Devices** (Revoke disconnects the device immediately).
- All traffic rides one outbound TLS WebSocket to your hub. The gateway never
  listens on any port.
- File access is restricted to the library roots you configure; range and
  transcode requests outside them are rejected gateway-side.
