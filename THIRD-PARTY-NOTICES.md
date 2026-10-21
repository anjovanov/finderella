# Third-party notices

Finderella's own code is MIT-licensed (see [LICENSE](LICENSE)). Its releases also
contain or download software by others, under those projects' own licenses. The MIT
license doesn't apply to them, and using Finderella doesn't change their terms.

## ffmpeg and ffprobe (GPL-3.0)

The storage gateway runs ffmpeg and ffprobe for scanning, transcoding, subtitles,
thumbnails and skip-intro detection. It prefers a system ffmpeg when one is complete
enough (see `docs/gateway-install.md`). Otherwise it uses static builds that npm
installs as optional dependencies:

| Package                                                                        | Contents                                                                                                                        | License                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static)                 | ffmpeg binaries (Linux builds by [John Van Sickle](https://johnvansickle.com/ffmpeg/), with libx264, libx265, libzimg and more) | GPL-3.0-or-later                                   |
| [`@ffprobe-installer/*`](https://github.com/SavageCore/node-ffprobe-installer) | ffprobe binaries, one package per platform                                                                                      | GPL-3.0 (LGPL-2.1 for the wrapper and macOS arm64) |

What each release format contains:

- **Storage gateway tarball** (`finderella-storage-gateway-<version>.tgz`) and **hub
  tarball** (`finderella-hub-<version>.tar.gz`): no ffmpeg or ffprobe. npm downloads
  them from their own packages during `npm install` / `npm ci`.
- **Docker image** (`ghcr.io/anjovanov/finderella`): includes those downloaded
  binaries, unmodified. Their license texts and build information ship next to them in
  the image (`/app/node_modules/ffmpeg-static/ffmpeg.LICENSE`, `ffmpeg.README`).
  Source code: the build information names the FFmpeg version (FFmpeg source at
  <https://ffmpeg.org/download.html> and <https://github.com/FFmpeg/FFmpeg>), and the
  builders publish their build sources at the links above. Write to the maintainer via
  the repository's issue tracker if you can't get the corresponding source from there.

ffmpeg and ffprobe run as separate programs: Finderella starts them as processes and
doesn't link to them.

## Bundled in the hub's web app

The hub's built app (`build/`, in the hub tarball and the Docker image) includes these
libraries and assets that aren't MIT-licensed:

| Component                                                   | Use                                                         | License                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Mediabunny](https://github.com/Vanilagy/mediabunny)        | Browser remux (MKV to fragmented MP4)                       | MPL-2.0                                                                           |
| [`@mediabunny/ac3`](https://github.com/Vanilagy/mediabunny) | AC-3 / E-AC-3 decoding during remux                         | MPL-2.0; contains a WebAssembly build of FFmpeg's AC-3 coders (LGPL-2.1-or-later) |
| [hls.js](https://github.com/video-dev/hls.js)               | HLS playback                                                | Apache-2.0                                                                        |
| [Video.js](https://github.com/videojs/v10) (`@videojs/*`)   | Player elements                                             | Apache-2.0                                                                        |
| [Fontsource](https://fontsource.org) variable fonts         | Branding fonts (Inter, Cinzel, DM Sans, Figtree and others) | SIL Open Font License 1.1                                                         |
| [Simple Icons](https://simpleicons.org)                     | Brand logos                                                 | CC0-1.0                                                                           |

They are used unmodified from npm; their source is at the linked repositories. Every
other runtime dependency is under MIT, ISC, BSD or Apache-2.0 terms. Each npm package's
license file is in its folder under `node_modules` after installing.

## Docker base image

The image is built on the official `node:22-bookworm-slim` image, which contains Node.js
(MIT) and Debian packages under their own licenses (listed in
`/usr/share/doc/*/copyright` inside the image).

## Metadata

Posters, synopses and other metadata come from [TMDB](https://www.themoviedb.org) at
runtime and aren't part of Finderella. This product uses the TMDB API but is not
endorsed or certified by TMDB.
