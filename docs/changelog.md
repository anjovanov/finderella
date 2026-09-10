# Changelog

## 2026-09-10

**Public access (guest mode)** — a second switch under Admin → Site settings, **Require an account to access** (on by default), next to **Allow visitors to register**; the two are independent. When it is off, visitors browse and watch without signing in: the navbar shows a single **Sign in** button, `/settings`, `/logout` and `/admin` still require an account, guest playback sessions are stored with a `NULL` owner (migration `0005`), no watch history or resume positions are kept, and signing out lands on the home page instead of `/login`. Unauthenticated `/api/*` calls now get a readable `401` body instead of a redirect into the login page's HTML. The settings row is cached in-process for 5 s (cleared on update) because the auth hook reads it on every anonymous request.

**Accounts & admin dashboard** — the hub now has two kinds of users:

- **Roles** via the Better Auth `admin()` plugin (`user.role`, `banned`, …; migration `0004`). The first account created on an empty hub is the administrator; everyone after that is a normal user who can only sign in and watch. Existing installs get their oldest account promoted at boot (`ensureAdminExists`) so nobody is locked out.
- **`/admin/*`** replaces `/settings/devices`: a shadcn-svelte sidebar layout (no horizontal navbar) with **Overview** (device/library/title/user counts), **Devices** (the old page, minus catalog/metadata housekeeping), **Users** (list, create, promote/demote, ban/unban, delete — you can't change your own role or remove the last admin; deleting a user hands their paired devices to you first, since `gateway.paired_by_user_id` has no cascade) and **Site settings** (an "Open registration" switch backed by the new `site_settings` table, plus the catalog prune and TMDB refresh that used to live on the devices page). Non-admins get a 403 page; non-GET requests under `/admin` are refused in `hooks.server.ts`.
- **`/login` and `/register`** are separate pages built on the shadcn-svelte `login-01` / `signup-01` blocks. The navbar no longer renders when logged out. Closed registration is enforced inside Better Auth (`hooks.before` on `/sign-up/email`), so the raw `/api/auth/sign-up/email` endpoint is covered too; it stays open while the hub has no users.
- **Navbar user menu**: avatar dropdown, pinned to the far right, with **Settings**, **Admin dashboard** (admins only) and **Sign out** (`POST /logout`); the gear icon is gone.
- **`/settings`** for every signed-in user: display name, email address (updated directly — the hub sends no verification mail) and password (current password required; other sessions are revoked). Sign-up now asks only for email + password (the display name starts as the mailbox part), and password fields everywhere have a show/hide toggle (`src/lib/components/password-input.svelte`; the eye/eye-off swap is an `{#if}` because `HugeiconsIcon` ignores `icon` prop changes after mount). The admin sidebar has no sign-out (use the navbar menu) and its collapse button sits flush against the sidebar. Form labels sit closer to their inputs (`Field` gap 3 → 2). The empty-library hint on Home points admins to Admin → Devices and tells everyone else to ask an administrator.

## 2026-09-04

**Catalog / metadata** — fixes found with the `test/finderella-storage` sample library (three of four shows were wrong):

- Parser: single-episode release folders (`American Horror Story S12E02 Rockabye REPACK 1080p …/`) no longer become the show title — the folder name is cut at the episode marker like it already was at season-pack markers. A year in the filename prefix (`Invincible.2021.S04E01`) is used when the show folder has none.
- TMDB matching never accepts a year-only hit any more: `Silo` (mtime year 2026) had matched _Love of Silom_ and `Invincible` had matched _BAKI-DOU: The Invincible Samurai_. A candidate needs a title match; the year is a bonus. Original titles that normalize to nothing (Thai, Japanese, …) are ignored — an empty string was a "prefix" of every query, which is how those two slipped through. When the year-filtered search yields nothing acceptable, the search is retried without the year (the ingest year is only the file's mtime when the filename carries none, and TMDB's year filter hid the real show).
- Parser, folder fallbacks: a movie file without a year takes title + year from the nearest folder that has one (`Inception (2010)/movie.mkv`); an episode file without an `SxxEyy` marker takes it from the nearest folder (`Breaking Bad S01E05 - Gray Matter/video.mkv` → S1E5 "Gray Matter"). Previously the first was a movie called "movie" and the second was skipped.
- Parser, year rule: a bracketed year wins, otherwise the last plausible year (1888..next year) before the release junk. `Blade Runner 2049 (2017)` is no longer "Blade Runner" from 2049, and `2001 A Space Odyssey (1968)` gets its year.
- Ingest skips release-folder sample clips (`Sample/…`, `*-sample.mkv`) when they probe under 10 minutes; a full-length title actually named "Sample" is kept.
- **Refresh all metadata** now re-matches from scratch instead of re-fetching the stored `tmdb_id`, so a wrong match can be corrected from the UI. It searches by the slug-derived scan title (`scanTitleFromSlug`) because the stored title may already be the wrong show's.

**UI**: the series page opens on the season the Play/Resume button targets (the resume point, else the lowest season on disk) instead of always "Season 1" — a show with only S3 on disk used to render its pills with nothing selected.

## 2026-08-28

**Catalog**

- Removed the mock/seed corpus (`src/lib/data/{movies,series,playback}.ts`, `scripts/seed.ts`, `npm run seed`, demo `.vtt` subtitles) and the `demo` playback mode. Titles now only come from gateway scans; `/api/playback/start` returns a readable 404/503 when a title has no file or its device is offline.
- Added `catalog/prune.ts`: titles with no `media_file` row are removed after every scan and via **Settings → Catalog → Remove titles without files**. Scan batches are serialized per library so a prune can't overtake an insert.
- Filename parser: trims season-pack markers from show folders (`S01 S02 … Complete`, `Season 1-3`) and dangling brackets left by junk stripping.
- Episode cards show `S1E1` instead of `E1`.

**Metadata (TMDB)**

- New `src/lib/server/metadata/` provider (`TMDB_API_KEY` in `.env`, v4 token or v3 key). Fills title/tagline/synopsis/year/genres/rating/maturity/director-or-creator/cast (with headshots + characters)/poster/backdrop/budget, season posters + years, episode titles/synopses/runtimes/stills. Runs after each scan, at boot, and via **Settings → Metadata → Refresh all metadata**. Unmatched titles are stamped so scans don't retry them. Artwork is hotlinked from `image.tmdb.org`.
- Schema: `tmdb_id`, `metadata_updated_at` (movie/series/episode), `cast_people` jsonb (replaces `cast_members`), `budget`, `season.poster_url`, `episode.still_url` (migrations `0001`, `0002`).
- UI: cast row with photos on detail pages; episode thumbnails use the episode still → season poster → series art; movie budget in the detail hero.

**Playback**

- MKV/HEVC transcodes now play. Two fixes in the gateway: `-pix_fmt yuv420p` (10-bit sources produced H.264 High 10, which browsers can't decode) and `-hls_playlist_type event` (`vod` only wrote ffmpeg's playlist on exit, so every segment wait timed out).
- Player uses hls.js whenever MSE is available (Edge claims native HLS and then fails); fatal playback errors surface as "Can't play this right now" with a reason instead of an endless spinner. ffmpeg failures reach the hub log.
- Quality menu (gear icon): **Original** (direct play when the file is browser-compatible, else a source-resolution transcode) or 2160p/1080p/720p/480p/360p, which force an HLS transcode capped by width and bitrate for gateways on slow uplinks. Rungs above the source resolution are hidden; the choice is remembered (`finderella:quality`); switching restarts at the current position.
- 4K: transcoder ceiling raised to 3840 wide with H.264 level 5.2 above 1080p (level/CODECS decided by `transcodePlan` in `src/lib/playback-quality.ts`); HDR (PQ/HLG) sources are tone-mapped to BT.709. Master playlist omits the audio codec for silent files.

**Cosmetics**: cast headshots 112px; tile hover zoom 1.015 (episode play badge 1.05).

**Progress**: a thin progress line under movie/series/episode cards (series = latest watched episode; full bar when finished), fed by `withProgress` in the browsing loaders.

**Deps**: `better-auth` + the `auth` CLI bumped `^1.6.23` → `^1.7.2` (the lockfile had already resolved 1.7.1 under the caret). Regenerated `auth.schema.ts` is unchanged; the 1.7 upgrade guide's breaking changes only touch OAuth/OIDC/SSO/SCIM/custom adapters, none of which this app uses.

**Trailers**: TMDB videos (`append_to_response=videos`) now feed a `trailer_key` column on movie/series (migration `0003`); `pickTrailer` in `metadata/map.ts` prefers YouTube trailers over teasers, official over fan uploads, English over other languages, and ignores featurettes/clips. Detail heroes show a **Watch trailer** button only when a key exists; it opens the YouTube embed (`youtube-nocookie.com`, autoplay) in a shadcn `Dialog` (`trailer-dialog.svelte`, new `ui/dialog`). Existing titles pick up trailers on **Settings → Metadata → Refresh all metadata**.

**Resume**: the series **Play** button now targets the viewer's next-in-line episode instead of S1E1 — the most recently watched episode if unfinished, otherwise the one after it — and reads `Resume S2E4`; unwatched shows (and shows whose last episode is finished) keep **Play** → S1E1. Applies to the detail hero and the home banner. `applyProgress` stamps `lastWatchedEpisodeId` on series; the pure pick lives in `src/lib/data/episodes.ts` (`playTarget`, also `flattenEpisodes` shared with the watch loader). `watchHref` no longer throws on a series without episodes (button disabled).
