#!/bin/sh
# Copies the files a release install of the hub needs into <dest>: the built app, the
# production server, migrations, the manifests `npm ci --omit=dev` reads, and the prebuilt
# storage gateway (so a machine that hosts the hub can also serve its own media).
#
# The release workflow tars <dest> into finderella-hub-<version>.tar.gz and the Dockerfile
# builds its image from it, so both ship the same file set. Run it after `npm run build`
# and `npm run build --workspace @finderella/storage-gateway`.
#
#   sh scripts/package-hub.sh <dest>
set -eu

dest=${1:?usage: package-hub.sh <dest>}
cd "$(dirname "$0")/.."

for built in build/handler.js packages/storage-gateway/dist/cli.js; do
	if [ ! -f "$built" ]; then
		echo "package-hub: $built is missing; build the hub and the storage gateway first" >&2
		exit 1
	fi
done

mkdir -p "$dest/packages/protocol" "$dest/packages/storage-gateway"
cp -R build server drizzle package.json package-lock.json .npmrc .env.example README.md "$dest/"
if [ -f LICENSE ]; then cp LICENSE "$dest/"; fi
# Workspaces: npm ci needs every workspace's package.json. The protocol is bundled into
# both builds, but npm still links it, so it ships as source (tests left out).
cp packages/protocol/package.json "$dest/packages/protocol/"
cp -R packages/protocol/src "$dest/packages/protocol/"
find "$dest/packages/protocol/src" -name '*.test.ts' -delete
cp packages/storage-gateway/package.json "$dest/packages/storage-gateway/"
cp -R packages/storage-gateway/dist "$dest/packages/storage-gateway/"
