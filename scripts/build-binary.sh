#!/usr/bin/env bash
# Builds the self-host binary (app embedded) from a Budgero checkout, like selfhost.Dockerfile.
# The checkout defaults to ../budgero next to this project; BUDGERO_REPO overrides it.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "${BUDGERO_REPO:-$here/../../budgero}" && pwd)"
out="$here/../bin/budgero"
server_dist="$repo/packages/server/dist"

# packages/server/dist is not ignored by git: never leave it in the checkout.
trap 'rm -rf "$server_dist"' EXIT

cd "$repo"
export VITE_SELF_HOSTABLE=true
pnpm --filter @budgero/runtime build
pnpm --filter @budgero/core build
pnpm --filter @budgero/app exec vite build --config vite.config.ts
rm -rf "$server_dist"
cp -R packages/app/dist "$server_dist"
(cd packages/server && CGO_ENABLED=0 go build -o "$out" ./cmd/selfhost)
echo "Built $out"
