# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MCP servers & skills (use them)

MCP servers (configured in the git-ignored `.mcp.json`) and project skills (`.claude/skills/`) are available. Reach for them whenever the task touches their area. Don't rely on memory for library APIs these projects change often.

- **Svelte / SvelteKit** — **Svelte MCP** (`list-sections` → `get-documentation` for the official docs, `svelte-autofixer` on every new or edited `.svelte` / `.svelte.ts` file until it reports no issues, `playground-link` only when asked) + skills **`svelte-code-writer`** and **`svelte-core-bestpractices`**, loaded before writing or reviewing Svelte code. **Write idiomatic Svelte 5**: runes, `$derived` over effects that sync state, attachments, snippets, context, proper event handling. Don't use hacky workarounds such as `setTimeout`/`tick` to dodge reactivity, `$effect` chains that copy state, manual DOM poking or `untrack` used to silence a loop you don't understand. Check the docs/skills for the idiomatic pattern first. When a workaround is genuinely unavoidable (e.g. the `@videojs/html` beta gotchas below), keep it minimal, comment why, and record it under **Hard-won gotchas**.
- **UI components** — skill **`shadcn-svelte`** (adding/composing/styling `src/lib/components/ui/**`, maia style, hugeicons) and **`frontend-design`** for new or reworked UI.
- **Auth** — **Better Auth MCP** (`search_docs` → `get_doc`, resolved against the installed `better-auth` version) + skill **`better-auth-best-practices`** for anything in `auth.ts`, plugins, sessions or the admin plugin.
- **Validation** — skill **`zod`** when defining or changing schemas (protocol messages, form/API inputs, TMDB/provider responses).
- **Other libraries** (Drizzle, hls.js, Mediabunny, MiniSearch, LayerChart, Tailwind v4, bits-ui, ffmpeg flags…) — **Context7 MCP** (`resolve-library-id` → `query-docs`) for current API docs before guessing.

## Project

**Finderella** — a Plex/Jellyfin-style media streaming web app (movies + series). The SvelteKit app ("hub") runs on a storage-poor VPS; media lives on the user's other devices, each running a Node storage gateway (`packages/storage-gateway`, bin `finderella-storage-gateway`) that dials out to the hub over one WebSocket and serves file ranges, ffmpeg HLS transcodes, subtitles, thumbnails and audio analysis through that tunnel. Dark cinematic theme (teal accent) by default, per-profile light theme.

**Full per-feature reference: `docs/architecture.md`** (read the relevant section before changing a feature). Dated history: `docs/changelog.md`.

### Feature map

- **Catalog / data layer** — server loads call `src/lib/server/catalog.ts`, which returns the `src/lib/data/types.ts` shapes (public ids are slugs). Titles come only from gateway scans (`catalog/{parse,ingest}.ts`); `catalog/prune.ts` removes titles without a `media_file`. Client-safe helpers in `src/lib/data/` (`hrefs.ts`, `episodes.ts` `playTarget`, `progress.ts`, `time.ts`, `media-format.ts`, …). Artwork is hotlinked from TMDB and fades in via `LoadedImage` over a gray `PosterArt` box.
- **Search** — MiniSearch in process memory (`src/lib/server/search/`: `engine.ts` pure ranker, `index.ts` singleton). `GET /api/search`, navbar `SearchBox`, `/search?q=`.
- **Categories** — `/categories/[type=category]/[slug]` (genres / collections / networks), `src/lib/data/categories.ts` (pure) + `src/lib/server/categories.ts`, fed by TMDB studios/collections.
- **Metadata** — TMDB enrichment in `src/lib/server/metadata/` (`tmdb.ts`, pure `map.ts`, `index.ts` single-flight `enrichPending`), run after scans, at boot and from admin settings.
- **Gateways & protocol** — `packages/protocol` (zod messages, language table, 6-byte binary framing); hub side `src/lib/server/gateways/` (`ws.ts` auth/dispatch, `registry.ts` correlation + credit-backpressured `openByteStream`). Pairing via `/admin/devices`.
- **Playback** — `POST /api/playback/start` picks **direct → remux → HLS** (`src/lib/server/streaming/`: `compat.ts`, `source-picker.ts`, `session-manager.ts`, `hls-playlist.ts`; quality ladder + `transcodePlan()` in `src/lib/playback-quality.ts`). Remux = the browser re-wraps MKV etc. into fMP4 for MSE (`src/lib/remux/`, `src/lib/data/remux.ts` `remuxPlan`). Stream URLs (`/api/stream/<session uuid>/…`) authorize by the unguessable session id.
- **Player** — `WatchPlayer` (`src/lib/components/media/`), Video.js v10 beta elements + a custom control bar; watch pages are `ssr = false` and own session restarts (quality/audio/remux fallback/next episode).
- **Subtitles** — discovered at scan time (embedded text streams + sidecars) into `media_subtitle`; the gateway converts to WebVTT on request (`/api/stream/<id>/subtitle/<id>.vtt`). Per-profile style/language settings (`src/lib/data/subtitle-settings.ts`, `/settings/subtitles`). Downloads from OpenSubtitles/Subdl/Gestdown/Titlovi in `src/lib/server/subtitles/` (search, rank, install beside the video via `subtitle.put`, bulk/auto job), admin at `/admin/subtitles`.
- **Audio** — every stream in `media_audio`; `pickAudioTrack`/`transcodeAudio` in `src/lib/server/streaming/audio.ts`; per-profile language + max channels; mono = Web Audio downmix (`src/lib/audio-downmix.ts`).
- **Trickplay** — gateway renders JPEG sprite sheets (`packages/storage-gateway/src/trickplay/`), hub synthesizes the thumbnails VTT (`src/lib/server/trickplay/`).
- **Skip intro / credits** — chapters + gateway audio fingerprints + dark frames (`packages/storage-gateway/src/markers/`, hub `src/lib/server/markers/`), served as `markers` by playback start; player helpers in `src/lib/data/markers.ts`.
- **Progress & watchlist** — `src/lib/server/progress.ts` (positions, continue watching — series tiles play `continueTarget`'s episode, dismiss, mark watched (movies, or one episode — never a whole series), `applyProgress` overlay incl. `inWatchlist`), `src/lib/server/watchlist.ts`, `/watchlist`, ⋮ `card-menu.svelte`.
- **Profiles** — per-account cap = admin setting (default 5, `profileLimit()`), Netflix-style picker/manager at `/profiles`; active profile = Better Auth session field `activeProfileId`. All viewer data hangs off `profile_id` (see Conventions).
- **Auth / roles / admin** — Better Auth `admin()` plugin (`src/lib/auth-roles.ts`); first account = admin; admin dashboard `/admin/*` (Overview, Devices + activity log, Users, Subtitles, Statistics, Site settings).
- **Signed-in devices** — `/settings/devices`: the account's sessions (browser/OS via `parseUserAgent`, "last used" = session field `lastActiveAt`), sign out one or all others (`src/lib/server/account-sessions.ts`, pure `src/lib/data/account-sessions.ts`). Admin **Account limits** (Site settings): max signed-in devices (LRU sign-out, `src/lib/server/session-limit.ts`) and max profiles, pure `src/lib/data/account-limits.ts`.
- **Settings** — `/settings/account`, `/settings/devices` (account-level) and per-profile `/settings/{preferences,subtitles,playback,statistics}`; a new section = sibling route + an entry in the layout's `sections` list.
- **Themes & screensaver** — per profile; theme class written by `hooks.server.ts` `transformPageChunk`; `ScreensaverController` (`src/lib/screensaver.svelte.ts`) via context.
- **Statistics** — `/admin/statistics` (Tautulli-style); `play_history` = one row per viewing, fed by player heartbeats (`src/lib/server/stats/`). Per-profile `/settings/statistics` reuses the same queries with an optional `profileId` (`profileWatchTimes`, `profileFinished`, `activityGraphs`).
- **Watch together** — in-memory rooms (`src/lib/server/together/`, `/ws/together`), client `src/lib/together/`, shared timeline but a playback session per viewer.

## Conventions

- Build hrefs via `resolve()` (`mediaHref`/`watchHref`/`categoryHref` in `src/lib/data/hrefs.ts`) — ESLint enforces `svelte/no-navigation-without-resolve`; `src/lib/components/ui/**` is exempt in `eslint.config.js`. `mediaHref` accepts `Pick<MediaItem,'kind'|'id'>` (so `SearchResult`s link). A `mediaHref()` link in stats components needs an `eslint-disable` comment like `PosterCard` (block form for a multi-line `<a>`).
- Icons: **hugeicons only** (one exception: monochrome brand logos hugeicons lacks come from `simple-icons`, as in `session-device-icon.svelte`); shadcn-svelte style **maia**. `page-gutter` for horizontal page padding (also sets snap `scroll-padding`) — no hand-rolled `px-*` gutters.
- Colours: theme tokens (`bg-foreground/15`, `bg-muted`) for UI chrome, never `bg-white/…`/`bg-black/…` (literal black/white only over artwork). Surfaces that must stay dark (player, watch status panels, trailer dialog, screensaver) carry a `dark` class.
- **Viewer data is keyed by profile, never `locals.user.id`**: reads `viewerProfileId(locals)` (null = guest), writes `requireProfile(locals)` (401 guest, 409 "Choose a profile first."); a new per-viewer table gets a `profile_id` FK (cascade). Account-level data (name/email/password/role/bans, `user_activity`, `subtitle_download.user_id`) stays on `user`.
- Pure logic goes in tested, client-safe modules (`src/lib/data/*`, `*/pure` helpers on the server); keep server-only imports out of them.
- Admin dialogs with form actions use `DialogForm` (`src/lib/dialog-form.svelte.ts`). A GET `+server.ts` under `/admin/**` is **not** gated by the hook or the layout — it must check `isAdmin` itself (e.g. `admin/subtitles/status`).
- Shared reactive state in classes provided via `createContext`, never module-level `$state` (the server would share it between requests).
- **Gateway protocol changes are additive**: new message/field + a `GatewayCapabilities` flag + `firstByteTimeoutMs` on the hub (old gateways log unknown messages and never answer). `PROTOCOL_VERSION` stays 1 — a bump disconnects every gateway. Gateway requests for extras (trickplay, markers) are best effort: failure = feature absent, playback unaffected.
- **Bump the version constant when its inputs change**: `METADATA_VERSION` (`metadata/index.ts`, enrichment stores a new TMDB field), `TRICKPLAY_GEOMETRY_VERSION` (interval/width/grid), `FINGERPRINT_VERSION` (any `fingerprint.ts` constant), `MARKERS_VERSION` (`markers/types.ts`, hub detection).
- Shipping a feature: dated entry in `docs/changelog.md`, a section in `docs/architecture.md`, a line in the feature map above, and gotchas here only for what the code can't tell you.

## Hard-won gotchas (do not regress)

### UI & player

- Navbar avatar `DropdownMenu.Trigger` (and the card ⋮ trigger in `card-menu.svelte`) render through a `child` snippet: put classes on the rendered `<button>`, not on `Trigger`. The far-right cluster is a wrapper `<div class="ml-auto …">`.
- `PosterCard` is a `<div class="group relative">` with the `<a>` and the ⋮ `CardMenu` as siblings — interactive content inside `<a>` is invalid HTML. `DropdownMenu.Content` is portalled (not in SSR HTML, not clipped by carousels). `card-menu.svelte`/`detail-hero.svelte` read `page.data.user`; after a toggle they `invalidate('app:watchlist')`, after a dismiss/mark `invalidateAll()`.
- `HugeiconsIcon` draws its `icon` once on mount — swap icons with `{#if}` (e.g. `password-input.svelte`). Tooltip triggers that must also toggle on tap merge handlers with `mergeProps` (spreading `props` then setting `onclick` drops bits-ui's own).
- Carousel arrows are positioned with `top` offsets, not `-translate-y-1/2` (Button's `active:translate-y-px` overwrites translate).
- **`@videojs/html` is beta, exact-pinned**: seek buttons, fullscreen and keyboard shortcuts are implemented against the native `<video>`/DOM. HLS goes through hls.js whenever `Hls.isSupported()`; native `<video src=m3u8>` only without MSE (Edge says "maybe" to `canPlayType('application/vnd.apple.mpegurl')` then fails with `DEMUXER_ERROR_COULD_NOT_PARSE`).
- Fullscreen-only `filter: brightness(1.001)` on the video (keyed on `is-fullscreen`) defeats a Chromium overlay bug that paints video above the controls. Keep it.
- The player fullscreens **`document.documentElement`**, not `<media-container>` — the watch pages unmount `WatchPlayer` on every session restart (`{#if playback}`), which would drop fullscreen. Watch pages call `exitFullscreen()` (`src/lib/fullscreen.ts`) in `onDestroy` and hold `lockPageScroll` (`src/lib/scroll-lock.ts`); `isFullscreen` initializes from `document.fullscreenElement`.
- The source effect reads `videoSrc`/`videoKind`/`startAt` through `$derived`s so an equal-valued new `playback` object can't re-source (= seek back to the resume point). Update `playback.subtitles` **in place** after a download. Episode→episode navigation reuses the page component (`EpisodesPanel` closes via `onNavigate`).
- Top bar, `EpisodesPanel`, countdown pill, skip button, party overlay/chat and the "Still watching?" dialog live **inside** `<media-container>` (activity + fullscreen). No pin-open API: `.menu-open` on `.player-root` CSS-overrides the library's `data-visible` auto-hide (`chromeVisible` keeps top bar/cursor shown).
- `stillWatchingDue` is read **once at mount** and gates auto-`play()` via `untrack` — it must never become a source dependency. The player's shortcuts return early while that dialog is open.
- `ScreensaverController.inhibit()` must `untrack` its counter update: callers run it in `$effect`, and a tracked `++` loops until `effect_update_depth_exceeded` (it silently killed the player's controls once). While showing, the waking `pointerdown`/`keydown`/`click` (and the click after a dismissing pointerdown) is swallowed; 600 ms grace + 24 px travel threshold.
- Theme: `ssr = false` pages get dark from the hook and the root layout's `$effect` applies `data.preferences.theme`.

### HLS / ffmpeg / gateway

- **ffmpeg's mov/hls muxer rebases fmp4 timestamps to 0 every run** (`-copyts`/`-output_ts_offset` don't reach the segment `tfdt`). After a seek-restart the gateway binary-patches each segment's tfdt (`packages/storage-gateway/src/transcode/mp4-patch.ts`) — hls.js/MSE place fragments by tfdt. Segment grid: 4 s fmp4, `-force_key_frames expr:gte(t,n_forced*4)`; the hub synthesizes the full VOD playlist from the probed duration. No `-c copy` fast path (stream copy splits on existing keyframes and breaks that grid).
- HLS always re-encodes to **8-bit H.264 High yuv420p** (level 4.1 ≤1080p, 5.2 above, ≤3840 wide: `-pix_fmt yuv420p -profile:v high -level <plan>`). Without the pix_fmt pin, 10-bit HEVC becomes H.264 High 10, which MSE rejects while ffmpeg exits 0. Keep gateway flags and `transcodePlan()` (master `CODECS` = `plan.codec`) in sync. HDR (detected per session via `probeColorTransfer`) is tone-mapped with `zscale`+`tonemap` (libzimg is in the bundled static build).
- `hlsArgs` uses `-hls_playlist_type event`: ffmpeg's own `playlist.m3u8` is the segment-readiness signal, and with `vod` it's written only on exit (every `hls.get` times out).
- Keep the `/api/stream/` short-circuit **first** in `hooks.server.ts` — segment fetches must not hit Better Auth's session lookup.
- Subtitle streams, `trickplay.get` and `markers.analyze` must **not** go through `startTransfer` / count against `maxConcurrentTransfers` (they'd make segment fetches "device busy" → fatal hls.js error). Subtitle ffmpeg extractions are capped at 2 separately.
- The gateway reaps an idle HLS ffmpeg after 120 s even while the hub session is kept alive by heartbeats — resuming a long-paused transcode can fail (known, direct play unaffected).

### Database / Drizzle

- `fs.stat().mtimeMs` is fractional; `bigint` columns reject it — round before insert.
- `watch_progress` and `watchlist` use partial unique indexes: `onConflictDoUpdate` needs the matching `targetWhere` (a bare `onConflictDoNothing()` doesn't). A **multi-row** upsert must `set` from `` sql`excluded.*` `` (a plain object writes one value to every row). `desc()` on a nullable column puts NULLs first — `bestMovieFile` uses `nulls last`.
- **No DB-level defaults on array columns** (`cast_members`/`genres` use `.$default(() => [])`): drizzle-kit introspects `'{""}'` and `db:push` re-proposes the ALTER forever. Same reason the profile-name unique index is plain `(user_id, name)` (it can't diff `lower(name)`; the app checks case-insensitively).
- drizzle-kit asks an interactive rename question when one diff drops and adds a table/column, and can't prompt in a non-TTY shell — split such changes into two generations (as `0020`/`0021` did; to apply them to a `db:push`-managed dev DB with data, run both SQL files with `psql` after stripping `--> statement-breakpoint`, then `db:push` must report no changes).

### Auth, roles, profiles

- Every admin `auth.api.*` call (`listUsers`, `setRole`, `banUser`, `removeUser`, `createUser`, `setUserPassword`…) must pass `headers: event.request.headers` — `createUser` without them silently skips the permission check.
- `gateway.paired_by_user_id` / `gateway_pairing_code.created_by_user_id` reference `user.id` **without cascade**: deleting a user reassigns their gateways to the acting admin and deletes their codes first. Revoking a gateway deletes the pairing codes it claimed (the FK would otherwise un-claim them, making them pairable again).
- The app refuses changing your own role and demoting/banning/removing the last active admin (the plugin only refuses self-ban/remove). Closed registration is enforced in `auth.ts` `hooks.before` on `/sign-up/email` (covers the `/register` action and raw `/api/auth/sign-up/email`; always open while `user` is empty).
- Don't `error()` for `/admin` HTML page requests inside `hooks.server.ts` (renders SvelteKit's bare fallback page): the hook refuses non-GET **and `event.isDataRequest`**; `src/routes/admin/+layout.server.ts` throws the 403 that renders `+error.svelte`. **Never drop the data-request check**: server loads run in parallel, so without it `/admin/**/__data.json` hands a non-admin every page load that doesn't `await parent()` (it leaked user emails and gateway pairing codes) next to the layout's 403.
- `sveltekitCookies` must be the last Better Auth plugin; after changing auth plugins run `npm run auth:schema` then `npm run db:generate`.
- `activeProfileId` is `input: false`: set it only through `setActiveProfile` (`src/lib/server/active-profile.ts`, `internalAdapter.updateSession`), never the `updateSession` endpoint or a raw `UPDATE session`, and always check ownership first (`getProfile(userId, id)`).
- Don't use `auth.api.listSessions` (it 403s `SESSION_NOT_FRESH` for sessions older than `freshAge`, 1 day) and never send session tokens to the client: `/settings/devices` posts session ids, mapped to tokens server-side. `session.lastActiveAt` is written only by `markSessionActive` (throttled from the value `getSession` already loaded). **Deliberate exception to the `internalAdapter` rule:** the devices feature reads and stamps the `session` table with raw Drizzle, which is correct only without `session.cookieCache`, `secondaryStorage` or session `databaseHooks`. Enabling any of them means reworking it first; with a cookie cache a revoked device also stays signed in until the cache's `maxAge` (see architecture.md → Signed-in devices). Server-side `auth.api.signInEmail`/`signUpEmail` calls must pass `headers: event.request.headers`, or the session's user agent and IP are saved as `""`.
- The device limit is enforced in `databaseHooks.session.create.after` through the **hook context's** `internalAdapter` (importing `auth` there would be a cycle): impersonation sessions neither count nor trigger eviction, the new session is never evicted, and a failure must only log — never fail the sign-in. Lowering a limit acts at the next sign-in only.

### Catalog, metadata, search

- TMDB enrichment never rewrites `slug` (URL + ingest key) or `hue`/`hue2`. Matched and unmatched titles get `metadata_updated_at`, so scans don't re-search misses; only "Refresh all metadata" (force) retries — it drops `tmdb_id` and re-searches from `scanTitleFromSlug`. Artwork is hotlinked from `image.tmdb.org` (no hub cache; the admin settings page carries the required TMDB attribution).
- `pickBestMatch` **requires a title hit**; the year is only a tie-break. Ingest stores the file's mtime year when the filename has none, so `findTmdbId` retries without the year when the year-filtered search yields nothing acceptable.
- `studioBrand` (`metadata/map.ts`): `+` is significant (Disney+ ≠ Disney); streaming brands merge (HBO/HBO Max/Max/HBO Films → `hbo`). A logo is never overwritten with null.
- Filename parser (`catalog/parse.ts`): **movies** — the filename's year decides, else the nearest folder with one, else the filename title. Year = bracketed first, else the _last_ plausible (1888..next year) bare year before the junk (`Blade.Runner.2049.2017` → 2017; `Blade Runner 2049.mkv` → no year). **Series** — `SxxEyy`/`1x02` from the filename, else the nearest folder; show title = top-level folder cut at the first year / season-pack marker / episode marker, or the text before the marker for loose files; a missing show year falls back to text before the marker, never after. `isSampleFile` skips only "sample"-named files that probe under 10 min.
- Search: the index refreshes only through `invalidateSearchIndex()` — call it after any bulk catalog write. `processTerm` (diacritic strip) applies to index and query alike; never set `searchOptions.processTerm` separately. Numeric terms never fuzz; ≤3-char terms are prefix-only. `SearchBox`: the listbox swallows `mousedown` (Safari doesn't focus anchors → `focusout` closes the list first), `Escape` is `preventDefault`ed (Chrome clears `type=search`), rows stay real `<a>`s. `/search` re-orders `inArray` results by the hit list.

### Subtitles

- Provider bytes only enter through `safe-fetch.ts` (`fetchSubtitleBytes`: manual redirects, HTTPS on the `PROVIDER_HOSTS` allowlist, 2 MiB cap) — never `fetch` a provider link directly. `zip.ts` filters entries by declared size/extension **before** inflating; `validate.ts` `looksLikeSubtitle` rejects HTML/binary; `sanitizeSubtitleText` strips VTT `STYLE`/`REGION`, scripts and control chars. Gateway `subtitle.put` uses `lstat` (dangling symlink = exists) and `realpath` containment, refuses non-subtitle extensions/missing folders/existing files unless `overwrite`. `/api/subtitles/download` throttles 20 per account per 10 min.
- OpenSubtitles search params must be **alphabetically sorted, lowercase, without defaults** (`buildOpenSubtitlesSearchParams`) or it answers 301. **406** on `/download` = daily quota (`remaining: -1`, `reset_time_utc`). Subdl codes are uppercase with its own spellings (`BR_PT`, `ZH_BG`); `unpack_files[].url` is a raw file, everything else a ZIP; a shared free key on a multi-user service breaches Subdl's ToS.
- Gestdown answers **423 with an empty body** both while refreshing a show and for an unparsable language — normalize with `toGestdown`, never retry in a loop (~50 req/min/IP, string ids, `sp_…` packs are ZIPs). Titlovi: `ExpirationDate` has no zone (local, refreshed a day early); 401 = API access revoked (not retryable); missing files are **HTTP 200 `Wrong parameters.`** (sniff `PK`); archives are windows-1250/1251 and often hold both scripts (`.cyr`/`.cir` → `pickZipSubtitle(..., { script })`); RAR refused; 429 pauses it 5 min; candidate ids are `<mediaid>:<type>`.
- The bulk job counts `not_found` only when at least one provider answered; all-errored items are `failed` and retried.
- `video::cue` takes only whitelisted properties; custom properties set on an ancestor inherit into it (how `cueStyle()` works). Cue size is a percent of player height emitted as `vh` (`::cue` percentages resolve against a tiny inherited size in Chromium). Lift cues with `positionCues` on `load`/`cuechange`, not `::-webkit-media-text-track-container` (Firefox ignores it).
- Browsers render only WebVTT in `<track>`, so the gateway converts. Key `<track>` elements by `track.id`, never `srclang` (English + English SDH collide → `each_key_duplicate`). Drive modes through our `<track>` refs, never `video.textTracks[i]`; pass `enableCEA708Captions: false` to hls.js (libx264 keeps CEA-608/708 → phantom tracks). Use `-map 0:<absolute index>`, not `0:s:N` (the ordinal shifts if the codec filter changes). Decode sidecars in Node (`Buffer.isUtf8` → windows-1252 fallback), never ffmpeg `-sub_charenc` (static builds may lack iconv). Downloads are re-encoded to UTF-8 hub-side by language (`charset.ts`).
- Extraction demuxes the whole container: the hub route sends a blank-line keepalive every 15 s (proxies cut silent bodies at 60–100 s) and `openByteStream`'s `firstByteTimeoutMs` (20 s) + `GatewayCapabilities.subtitles` (501) cover old gateways. `@finderella/protocol/languages` is a separate export so client code avoids zod. Tracks with unknown language (`und`) are session-only picks — `preferenceForTrack` returns null.

### Audio

- Chrome/Firefox can't switch a progressive file's audio track (`AudioTrackList` is Safari-only): the first stream is the direct-play track (the matrix only vets `media_file.audio_codec`), any other pick transcodes or remuxes. Switching restarts the session (no HLS `EXT-X-MEDIA` renditions). `audioTrackId` is `nullish` in the start schema. Old gateways ignore `audioStreamIndex` — hence the `audioSelect` capability gate.
- A channel cap **never** forces a direct-playable file into a transcode: surround passes through, mono is a Web Audio downmix. `createMediaElementSource` is once per element and the element is then audible only through the graph → per-element `WeakMap` graph built lazily by `setMonoDownmix`, toggled via `channelCountMode`, disposed only by `releaseDownmix` when the `<video>` goes away; resume the context on `play`/pointerdown/keydown. The player reads the flag through a `$derived` (`wantMono`) because the page rebuilds `playbackSettings` on every `data` change (episode `goto`).
- Capture listeners use `{ capture: true }`, not `true` (Node's `EventTarget` in tests ignores the boolean on `removeEventListener`). The native `aac` encoder takes `-ac 6` from any layout. Scaled audio bitrate lives on `HotSession.audioKbps` for the master `BANDWIDTH`.

### Trickplay

- `<media-slider-thumbnail>` has **no `src`**: it reads a `<track kind="metadata" label="thumbnails">` on the `<video>`; `#xywh` URLs resolve relative to the track `src`. Metadata cues load only in `hidden`/`showing`, so `applyTrackModes` forces `hidden` and stamps `modesAppliedAt` (else the `change` echo reads as "subtitles off").
- The library writes inline `left`/`width` on the slider preview (`getSliderPreviewStyle`) — never add `left`/`translate` to `.slider-preview`.
- The sheet route buffers the JPEG before answering so a gateway failure can't become a cached broken `200`; errors are `no-store`. Geometry is the **gateway's** (explicit `scale=W:H` from the display aspect; `-2` ignores SAR) — the hub never derives tile size. `-atomic_writing` + a JPEG-EOI check guard partial sheets; a cache dir without `manifest.json` is a stale partial and is wiped. The thumbnail element re-assigns `img.src` only when the URL changes, so a 404'd sheet retries when the pointer crosses sheets. A null/failed ensure = `trickplay: null`. A "clear cache" feature belongs on the gateway (`rm -rf trickplayRoot()` behind a new message).

### Markers (skip intro/credits)

- Dark-frame measurement stays on **raw luma** (`extractplanes=y`): `format=gray` stretches limited range, makes night scenes look like credits and differs between ffmpeg 7 and 9. ffmpeg 9 with `-skip_frame nokey` may print frames out of order — `detectDarkCredits` sorts by time; dark-frame edges are keyframe-accurate only, so they never auto-skip and never pull a fingerprint edge by < 15 s. A dark run bridges at most **one** lighter keyframe.
- Fingerprint thresholds were calibrated on real episodes (same audio BER ≈ 0–0.15, unrelated ≈ 0.5). Synthetic test fingerprints must flip bits **probabilistically** (`plant(…, flip)`). Fingerprints are never stored on the hub — a season re-run re-fetches analyses from the device cache.
- Auto mode acts imperatively in `timeupdate` (never an `$effect`), only when playback ran into the marker (`enteredByPlayback`), once per mount; movies are never ended by it.

### Browser remux

- Fragments must be **≥ 4 s** (`minimumFragmentDuration`) — ~1 s fragments broke Firefox's MSE decoder. Output timestamps stay **absolute** after a seek (no `timestampOffset`, no tfdt patching).
- `RemuxPlayer` rules: **every** SourceBuffer op goes through one queue (`#sbOp`; overlapping appends throw `InvalidStateError`); runs carry a generation and append only while current; restarts coalesce (`#seekTo`); "covered" = buffered or between the run's appended end and read position — never "since the run started" (eviction drops what's behind the playhead); `waiting` restarts nothing, the 500 ms stall watchdog does.
- 5.1 conversion is **Opus only** (channel order verified; AAC 5.1 encoders aren't, so `caps.surround` never lists AAC). When 5.1 was promised, `RemuxPlayer` throws rather than silently encoding stereo (→ `onRemuxFailed` → 5.1 transcode).
- `downmixToStereo` mixes at **full level** with the stream's Lo/Ro levels (`ac3MixLevels` in `src/lib/remux/ac3-downmix.ts`, defaults −4.5/−6 dB) to match the transcode's loudness; a normalized mix is 7.7 dB quieter. Don't validate loudness against ffmpeg writing s16 WAV (that path normalizes).
- Measure A/V sync in a browser, not ffprobe (ffmpeg shifts B-frame streams with negative composition offsets). MKV says `hev1`, the muxer writes `hvc1` (`remuxMimeType`; the SourceBuffer gets `output.getMimeType()`). Only `[MATROSKA, WEBM, MP4, QTFF]` demuxers are imported; `@mediabunny/ac3` loads only when converting. 10-bit HEVC on Main-only browsers is caught by `prepare()` (one extra start).
- **Known limitation (revisit 2026-09-30):** the buffer window is time-based (60 s ahead); a 4K remux at 50–80 Mbps exceeds the ~100–150 MB SourceBuffer quota → `QuotaExceededError` → `#append` evicts/retries 3× → falls back to transcode. Planned fix: byte-sized window.

### Watch together

- The `/ws/together` upgrade must **not** call `auth.api.getSession` (`sveltekitCookies` calls `getRequestEvent()` on a cookie refresh and throws outside a request) — hence the single-use ticket POST.
- Echo suppression is **by comparison with room state**, never "ignore the next event" flags; local intents update state optimistically so the 1 s sync tick can't undo them. Seek intents come from `seeking` (not `seeked`), `#ownSeek` marks the controller's corrections, and a fresh player isn't **armed** until it once matched the shared position.
- In party mode the player never auto-starts (`autoStart` checks `party`); a held group pauses even mid-seek (an AbortError from the viewer's `play()` is expected).
- The party code is page **state** seeded from the URL, not `$derived(page.url…)`: start/leave use shallow `replaceState` (a navigation would re-run loads and restart playback). The series page's `setPageMedia` call runs inside `untrack` (tracking `session.state` would re-send the old episode during a remote change). `Room` methods stay synchronous (no `await`).

### Statistics

- `reapOrphans` (boot `init`) must skip sessions/rows this process still holds (the dev server re-runs `init` while `SessionManager` survives). `openPlay`'s insert must carry `userId`. Every stats query filters `played_seconds >= MIN_PLAY_SECONDS` (shorter rows are warming up). Heartbeat rows are written as **increments** (`flushPlay`) so two sessions feeding one row can't clobber each other.
- `layerchart` is a devDependency on purpose (adapter-node bundles them, like `bits-ui`); a dev server started before it was installed 500s the chart pages until restarted.

### Dev server

- The Vite plugin `ssrLoadModule`s `gateways/ws.ts` at WebSocket **upgrade** time, so a connected gateway runs pre-edit handlers (ingest, `finalizeScan`, …) until it reconnects. Editing `@finderella/protocol` re-instantiates `gateways/registry.ts`, so gateways connected before the edit look offline until they reconnect.
- Saving an edit under `hooks.server.ts`'s import graph re-runs `init`, which runs `enrichPending`. When a `METADATA_VERSION` bump comes with a new column, apply the migration **before** saving the enrichment edit. Otherwise series rows get stamped at the new version while their episode updates fail on the missing column, and they never retry. To recover, set `metadata_version` back on those series and let `init` run again.
- `GATEWAY_DEV_TOKEN` self-registers a "Dev Gateway" (dev only; needs one user first). Real gateways pair via `/admin/devices` → `npx finderella-storage-gateway pair --hub <url> --code <code>`.

## Commands

- `npm run dev` — dev server (`-- --open` to open a browser; serves `/gateway/ws` and `/ws/together` via a Vite plugin)
- `npm run build` / `npm run preview` / `npm run start` (production via `server/index.js`)
- `npm run gateway:dev -- connect [--hub URL] [--token T]` — storage gateway from source (env `FINDERELLA_HUB`, `FINDERELLA_TOKEN` or dev `GATEWAY_DEV_TOKEN`)
- `npm run test` (vitest) · `npm run check` (svelte-check; `check:watch`) · `npm run lint` / `npm run format`
- `npm run db:push` (dev schema sync) · `npm run db:generate` / `npm run db:migrate` (migrations in `drizzle/`, for prod) · `npm run db:studio`
- `npm run auth:schema` — regenerate `src/lib/server/db/auth.schema.ts` (generated; never hand-edit) after changing Better Auth plugins/options

Verify with `npm run test`, `npm run check`, `npm run format && npm run lint`, and dev-server smoke tests.

`.env` (see `.env.example`): `DATABASE_URL`, `ORIGIN`, `BETTER_AUTH_SECRET`, optional `GATEWAY_DEV_TOKEN`, `TMDB_API_KEY`. `drizzle.config.ts` and the db client throw if `DATABASE_URL` is unset.

## Architecture

- SvelteKit 2 + Svelte 5 (TS), Tailwind v4 via the Vite plugin, Drizzle on postgres.js, Better Auth, **adapter-node**. **Runes mode is forced** and SvelteKit config lives in `vite.config.ts` (no `svelte.config.js`). Theme tokens (oklch, `:root` light / `.dark` dark) and utilities live in `src/routes/layout.css` — don't move it.
- `server/index.js` owns the `/gateway/ws` and `/ws/together` upgrades, bridged from the SvelteKit bundle via the `init` hook (`globalThis.__finderellaGatewayUpgrade` / `__finderellaTogetherUpgrade`).
- npm workspaces: root = web app, `packages/protocol` (source TS, bundled via `ssr.noExternal`), `packages/storage-gateway`. Runtime deps go in `dependencies` (`npm ci --omit=dev` on the VPS).
- **Single-process by design**: `GatewayRegistry`, `SessionManager`, the search index and watch-party rooms are in memory.
- Drizzle Kit reads only `src/lib/server/db/schema.ts` (barrel of the `*.sql.ts` files + generated `auth.schema.ts`).
- **Auth flow** (`src/hooks.server.ts`): `/api/stream/*` short-circuits before auth; always public: `/login`, `/register`, `/api/auth/*`, `/api/gateway/pair`; `ACCOUNT_PREFIXES` (`/settings`, `/logout`, `/admin`, `/watchlist`, `/profiles`, `/together`, `/api/together`) need a session; a signed-in account without an active profile is 303'd to `/profiles` unless the path is in `PROFILE_EXEMPT_PREFIXES`; everything else follows `site_settings.require_login` (on → `/login` redirect for pages, readable `401` for `/api/*`; off → guest mode, where viewer helpers take a null profile). Gateways authenticate with bearer tokens on the WS upgrade, never cookies.
