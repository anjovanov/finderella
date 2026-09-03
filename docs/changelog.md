# Changelog

## 2026-09-04

**Catalog / metadata** — fixes found with the `test/finderella-storage` sample library (three of four shows were wrong):

- Parser: single-episode release folders (`American Horror Story S12E02 Rockabye REPACK 1080p …/`) no longer become the show title — the folder name is cut at the episode marker like it already was at season-pack markers. A year in the filename prefix (`Invincible.2021.S04E01`) is used when the show folder has none.
- TMDB matching never accepts a year-only hit any more: `Silo` (mtime year 2026) had matched _Love of Silom_ and `Invincible` had matched _BAKI-DOU: The Invincible Samurai_. A candidate needs a title match; the year is a bonus. Original titles that normalize to nothing (Thai, Japanese, …) are ignored — an empty string was a "prefix" of every query, which is how those two slipped through. When the year-filtered search yields nothing acceptable, the search is retried without the year (the ingest year is only the file's mtime when the filename carries none, and TMDB's year filter hid the real show).
- Parser, folder fallbacks: a movie file without a year takes title + year from the nearest folder that has one (`Inception (2010)/movie.mkv`); an episode file without an `SxxEyy` marker takes it from the nearest folder (`Breaking Bad S01E05 - Gray Matter/video.mkv` → S1E5 "Gray Matter"). Previously the first was a movie called "movie" and the second was skipped.
- Parser, year rule: a bracketed year wins, otherwise the last plausible year (1888..next year) before the release junk. `Blade Runner 2049 (2017)` is no longer "Blade Runner" from 2049, and `2001 A Space Odyssey (1968)` gets its year.
- Ingest skips release-folder sample clips (`Sample/…`, `*-sample.mkv`) when they probe under 10 minutes; a full-length title actually named "Sample" is kept.
- **Refresh all metadata** now re-matches from scratch instead of re-fetching the stored `tmdb_id`, so a wrong match can be corrected from the UI. It searches by the slug-derived scan title (`scanTitleFromSlug`) because the stored title may already be the wrong show's.

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
