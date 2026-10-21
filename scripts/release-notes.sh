#!/bin/sh
# Prints the GitHub release notes for tag <tag> (vX.Y.Z) as Markdown: install snippets, then
# the commit subjects since the previous release, split into Hub and Storage gateway. A
# stable release is compared with the previous stable one; a prerelease with whatever tag
# came before it. Commits that only cut a release ("Release vX.Y.Z") are left out.
#
#   sh scripts/release-notes.sh v0.2.0 [owner/repo]
set -eu

tag=${1:?usage: release-notes.sh <tag> [owner/repo]}
repo=${2:-${GITHUB_REPOSITORY:-anjovanov/finderella}}
version=${tag#v}
image="ghcr.io/$(echo "$repo" | tr '[:upper:]' '[:lower:]')"

case "$version" in
*-*) prev=$(git describe --tags --abbrev=0 --match 'v[0-9]*' "$tag^" 2>/dev/null || true) ;;
*) prev=$(git describe --tags --abbrev=0 --match 'v[0-9]*' --exclude '*-*' "$tag^" 2>/dev/null || true) ;;
esac

gateway_paths='packages/storage-gateway packages/protocol'

commits() {
	git log --no-merges --format='- %s' --invert-grep --grep='^Release v' "$range" -- "$@"
}

if [ -n "$prev" ]; then
	range="$prev..$tag"
	# shellcheck disable=SC2086
	gateway=$(commits $gateway_paths)
	hub=$(commits . ':(exclude)packages/storage-gateway')
fi

cat <<NOTES
## Install

**Hub** (includes the storage gateway, for media on the hub's own machine):

- Docker: \`docker pull $image:$version\`. Use the attached \`docker-compose.yml\` for the hub with PostgreSQL.
- Without Docker (Node.js 22+, PostgreSQL): download \`finderella-hub-$version.tar.gz\`, unpack it, then run \`npm ci --omit=dev\`, \`cp .env.example .env\` (fill it in), \`npm run db:migrate:deploy\` and \`npm start\`.

**Storage gateway** (each device that holds media, Node.js 22+):

\`\`\`sh
npm install -g https://github.com/$repo/releases/download/$tag/finderella-storage-gateway-$version.tgz
\`\`\`

See [docs/gateway-install.md](https://github.com/$repo/blob/$tag/docs/gateway-install.md) for pairing and running it as a service.

NOTES
if [ -z "$prev" ]; then
	echo "First release."
	exit 0
fi
printf '## Hub\n\n'
if [ -n "$hub" ]; then echo "$hub"; else echo "_No changes since $prev._"; fi
printf '\n## Storage gateway\n\n'
if [ -n "$gateway" ]; then
	echo "$gateway"
else
	echo "_No changes since $prev: updating your devices is optional._"
fi
printf '\n**Full changelog:** https://github.com/%s/compare/%s...%s\n' "$repo" "$prev" "$tag"
