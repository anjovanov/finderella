# Releasing

Every release is one GitHub Release, tagged `vX.Y.Z`, that ships both products at the
same version:

| Asset                                                          | What                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ghcr.io/anjovanov/finderella:X.Y.Z` (also `X.Y` and `latest`) | Hub Docker image, linux/amd64 + arm64. The storage gateway is in it too (compose's `local-gateway` service).                 |
| `docker-compose.yml`                                           | Hub + PostgreSQL, plus the optional local gateway.                                                                           |
| `finderella-hub-X.Y.Z.tar.gz`                                  | Hub for installs without Docker: the built app, migrations and the prebuilt gateway (`npm ci --omit=dev`, then `npm start`). |
| `finderella-storage-gateway-X.Y.Z.tgz`                         | The storage gateway alone, for devices that hold media (`npm install -g <url>`).                                             |
| `finderella-storage-gateway.tgz`                               | The same file under a fixed name, so `releases/latest/download/finderella-storage-gateway.tgz` always gets the newest.       |
| `SHA256SUMS`                                                   | Checksums of the tarballs.                                                                                                   |

The hub and gateway always carry the same version, so "hub 1.4 + gateway 1.4" is the
combination to recommend. A newer hub still works with older gateways: protocol changes
are additive and capability-gated (see CLAUDE.md), so updating devices is optional
unless the notes say otherwise. The notes have separate Hub and Storage gateway
sections and say so when the gateway didn't change.

## Cutting a release

The version lives in two places only: the root `package.json` (hub) and
`packages/storage-gateway/package.json`. The gateway's `--version` and the version it
reports to the hub come from the latter. The workflow refuses a tag that doesn't match
both.

```sh
npm version 0.2.0 --no-git-tag-version
npm version 0.2.0 --no-git-tag-version --workspace @finderella/storage-gateway
git commit -am "Release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

Keep the commit subject `Release vX.Y.Z`: the release notes leave such commits out.

The tag starts `.github/workflows/release.yml`:

1. **Version and checks**: tag = both versions, then `npm run check`, `npm run lint`, `npm test`.
2. **Gateway platforms**: the full `gateway-platforms.yml` matrix (Linux/macOS/Windows, Fedora/Arch containers).
3. **Hub tarball and gateway package**: `scripts/package-hub.sh`, `npm pack`, checksums.
4. **Docker image**: built for amd64 and arm64 and pushed to GHCR.
5. **GitHub release**: notes from `scripts/release-notes.sh`, all assets attached.

The image is pushed only after steps 1 and 2 pass, and the release is created last. If
a run fails after the image was pushed (in the tarball step, say), fix the problem,
delete the tag (`git push --delete origin v0.2.0 && git tag -d v0.2.0`) and tag again:
the re-run pushes the image again over the same tags.

**Prereleases:** a tag with a hyphen (`v0.2.0-rc.1`) is published as a prerelease. The
image gets only the `0.2.0-rc.1` tag (not `latest` or `0.2`) and the release isn't marked
Latest. Use one to try the workflow without touching what users install.

**Release notes** list the commit subjects since the previous release, split into Hub
(everything outside `packages/storage-gateway`) and Storage gateway
(`packages/storage-gateway`, `packages/protocol`). A stable release is compared with the
previous stable one. Preview them locally with `sh scripts/release-notes.sh v0.2.0` (the
tag must exist). Edit the release on GitHub afterwards to add highlights from
`docs/changelog.md`.

## One-time GitHub setup

- **Actions**: Settings → Actions → General must allow Actions. The workflow asks for
  the permissions it needs (`contents: write` for the release, `packages: write` for the
  image), so the default token permission can stay read-only.
- **Container package visibility**: after the first release, open the `finderella`
  package (your profile → Packages) → Package settings → Change visibility → **Public**,
  otherwise `docker pull` needs a login. It's linked to the repo by the image's
  `org.opencontainers.image.source` label.
- **Optional, a tag ruleset**: Settings → Rules → Rulesets → New tag ruleset for `v*`,
  restricting creation, updates and deletion to maintainers. Anyone who can push a tag
  can publish a release.
- **Optional, the About panel**: tick Releases and Packages so both show in the sidebar.
