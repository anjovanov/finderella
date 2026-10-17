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

- Node.js 20 or newer on the media device (`node --version`); 22 LTS is
  recommended. Linux, macOS and Windows on x64 or arm64 (Intel, AMD, Apple
  Silicon) are supported.
- ffmpeg is **optional**: a static build ships with the gateway (on Linux,
  macOS and Windows x64, Apple Silicon and Linux arm64). If the device has its
  own ffmpeg, the gateway checks it has what it needs (ffmpeg 5.1+, libx264,
  the filters used for thumbnails and credits detection, zscale for HDR) and
  uses whichever build is more complete. `connect` prints what it picked and
  why. `FFMPEG_PATH` / `FFPROBE_PATH` force a specific build.
- No GPU is needed or used: transcoding runs on the CPU, so any graphics
  setup works, including laptops with both integrated and dedicated GPUs.

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

In the Finderella web UI, open **Admin → Devices** (`/admin/devices`, administrators only),
enter a device name, and click **Generate code**. Codes are single-use and
expire after 10 minutes.

## 3. Pair (device, one-time)

```sh
finderella-storage-gateway pair --hub https://your-hub-domain --code ABCD1234
```

This exchanges the code for the device's permanent token, saved to
`~/.config/finderella-storage-gateway/config.json` (owner-readable only; on
Windows `C:\Users\<you>\.config\finderella-storage-gateway\config.json`). You
won't need `--hub` or `--code` again.

Everything the gateway generates lives under
`~/.cache/finderella-storage-gateway/` (`$XDG_CACHE_HOME` when set) and is
safe to delete while it's stopped:

| Folder               | What                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transcode/`         | In-progress HLS transcodes; a session keeps ~2 min behind the playhead and is removed when it stops. Set `FINDERELLA_TRANSCODE_DIR` to put it on another disk. |
| `trickplay/`         | Seek-bar thumbnails (a few MB per film).                                                                                                                       |
| `subs/`              | Subtitles converted to WebVTT; unused ones are removed after 30 days.                                                                                          |
| `probe/`, `markers/` | Scan and skip-intro analysis caches.                                                                                                                           |

Seek-bar thumbnails (sprite sheets rendered in the background after scans, the
first time a title is played, or via Admin → Devices → _Regenerate trickplay
thumbnails_) are kept under
`~/.cache/finderella-storage-gateway/trickplay/` (`$XDG_CACHE_HOME` when set) —
a few MB per feature-length file. Set `FINDERELLA_TRICKPLAY=0` to turn the
feature off on a device that can't spare the CPU.

## 4. Connect (device)

```sh
finderella-storage-gateway connect
```

The devices page on the hub shows the device with a green dot within seconds.

## 5. Add media libraries (hub)

On the device's card in **Settings → Devices**, add each media folder:

- **Path**: the absolute path _as the device sees it_, e.g. `/mnt/storage/movies`,
  `/Volumes/Media/Movies` on macOS, or `D:\Movies` / `\\nas\media\Movies` on
  Windows. A whole drive (`E:\`) works too. On WSL2, a Windows folder is
  `/mnt/c/...`.
- **Kind**: Movies or Series — a movie library treats every file as a movie.

The first scan starts automatically. Use **Rescan** after adding files.

Recognized extensions: `.mp4 .m4v .mkv .webm .mov .avi .ts .wmv`
(hidden files and dot-folders are skipped, as are `$RECYCLE.BIN`,
`System Volume Information`, `lost+found` and Synology `@eaDir`/`#recycle`).
Symlinked files and folders (and Windows junctions) are followed.

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

`connect` is a foreground process. Stopping it (Ctrl+C or the service
manager) also stops any ffmpeg it started.

### Linux (systemd)

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
media folders.

Fedora's stock `ffmpeg-free` package has no H.264 encoder; the gateway notices
and uses its bundled build instead. RPM Fusion's `ffmpeg` works as a system
build. On Ubuntu 22.04 the distro ffmpeg (4.4) is too old and is skipped the
same way.

### macOS (launchd)

Save as `~/Library/LaunchAgents/com.finderella.storage-gateway.plist`
(adjust the `node` and gateway paths — `which node`, `npm root -g`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>com.finderella.storage-gateway</string>
	<key>ProgramArguments</key>
	<array>
		<string>/opt/homebrew/bin/node</string>
		<string>/opt/homebrew/lib/node_modules/@finderella/storage-gateway/dist/cli.js</string>
		<string>connect</string>
	</array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardOutPath</key><string>/tmp/finderella-storage-gateway.log</string>
	<key>StandardErrorPath</key><string>/tmp/finderella-storage-gateway.log</string>
</dict>
</plist>
```

```sh
launchctl load -w ~/Library/LaunchAgents/com.finderella.storage-gateway.plist
```

- macOS privacy protection blocks background processes from external drives,
  network volumes and `~/Desktop`/`~/Documents`/`~/Downloads`: scans then log
  `Operation not permitted`. Grant **Full Disk Access** to the `node` binary
  (System Settings → Privacy & Security → Full Disk Access → `+`, press
  ⌘⇧G and paste the path from `which node`).
- A sleeping Mac is offline. Turn on "Prevent automatic sleeping when the
  display is off" (Energy settings) on a Mac that serves media.
- Homebrew's `ffmpeg` (`brew install ffmpeg`) is a complete build.

### Windows

Install Node.js LTS, then pair and connect from PowerShell as the account
that will run the gateway. To keep it running, either:

- **Task Scheduler**: a task "At log on" (or "At startup" with "Run whether
  user is logged on or not") running `finderella-storage-gateway.cmd connect`
  (in `%APPDATA%\npm\`). Untick "Stop the task if it runs longer than".
- **NSSM** (`nssm install FinderellaGateway`): application `node.exe`,
  arguments `"%APPDATA%\npm\node_modules\@finderella\storage-gateway\dist\cli.js" connect`,
  and set **Log on** to your own account (the default LocalSystem account has
  no config file and can't see your network shares).

Mapped network drives (`Z:`) don't exist for services and scheduled tasks
that run without you logged on. Use the UNC path (`\\nas\media\Movies`) as
the library path instead.

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
| `WARNING: it lacks …` at startup                       | The only ffmpeg found is missing something (e.g. libx264). Install a full build (RPM Fusion, Homebrew, gyan.dev on Windows) or point `FFMPEG_PATH` at one.                                                                  |
| macOS: `Operation not permitted` in scan logs          | Grant Full Disk Access to the `node` binary (see _macOS_ above).                                                                                                                                                            |
| Windows: library on `Z:` not found as a service        | Mapped drives are per-login; use the `\\server\share\…` path.                                                                                                                                                               |

## Security notes

- The gateway holds a single bearer token, revocable any time from
  **Settings → Devices** (Revoke disconnects the device immediately).
- All traffic rides one outbound TLS WebSocket to your hub. The gateway never
  listens on any port.
- File access is restricted to the library roots you configure; range and
  transcode requests outside them are rejected gateway-side.
