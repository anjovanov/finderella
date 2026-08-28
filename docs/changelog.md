# Changelog

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

**Trailers**: TMDB videos (`append_to_response=videos`) now feed a `trailer_key` column on movie/series (migration `0003`); `pickTrailer` in `metadata/map.ts` prefers YouTube trailers over teasers, official over fan uploads, English over other languages, and ignores featurettes/clips. Detail heroes show a **Watch trailer** button only when a key exists; it opens the YouTube embed (`youtube-nocookie.com`, autoplay) in a shadcn `Dialog` (`trailer-dialog.svelte`, new `ui/dialog`). Existing titles pick up trailers on **Settings → Metadata → Refresh all metadata**.

**Resume**: the series **Play** button now targets the viewer's next-in-line episode instead of S1E1 — the most recently watched episode if unfinished, otherwise the one after it — and reads `Resume S2E4`; unwatched shows (and shows whose last episode is finished) keep **Play** → S1E1. Applies to the detail hero and the home banner. `applyProgress` stamps `lastWatchedEpisodeId` on series; the pure pick lives in `src/lib/data/episodes.ts` (`playTarget`, also `flattenEpisodes` shared with the watch loader). `watchHref` no longer throws on a series without episodes (button disabled).
