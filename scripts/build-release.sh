#!/usr/bin/env bash
# Builds the release tarball for the Raspberry Pi: the built web app, the agent wheel and deploy/.
#
#   docker compose -f dev/docker-compose.yml run --rm release     (from the repository root)
#
# Output: release/floppyoctotouch-<version>.tar.gz and .tar.gz.sha256. Needs Node/npm and Python 3 with
# pip (the `release` service has both); the Pi itself never builds anything.
# Environment: RELEASE_DIR (output folder), SKIP_FRONTEND_BUILD=1 (reuse frontend/dist),
# SOURCE_DATE_EPOCH (timestamp of the files in the tarball).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT=${RELEASE_DIR:-$ROOT/release}

die() {
  printf 'build-release: %s\n' "$*" >&2
  exit 1
}

command -v npm >/dev/null || die "npm not found (run it in Docker: docker compose -f dev/docker-compose.yml run --rm release)"
command -v python3 >/dev/null || die "python3 not found"

frontend_version=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$ROOT/frontend/package.json" | head -n1)
agent_version=$(sed -n 's/^version = "\(.*\)"$/\1/p' "$ROOT/agent/pyproject.toml" | head -n1)
[ -n "$frontend_version" ] || die "no version in frontend/package.json"
[ "$frontend_version" = "$agent_version" ] ||
  die "versions differ: frontend/package.json $frontend_version, agent/pyproject.toml $agent_version"
version=$frontend_version
name=floppyoctotouch-$version

if [ "${SKIP_FRONTEND_BUILD:-0}" != 1 ]; then
  echo "==> building the web app $version"
  (cd "$ROOT/frontend" && npm install --no-audit --no-fund --prefer-offline && npm run build)
fi
[ -f "$ROOT/frontend/dist/index.html" ] || die "frontend/dist is missing"

stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
dir=$stage/$name
mkdir -p "$dir/frontend" "$dir/agent" "$stage/agent-src"

cp -r "$ROOT/frontend/dist/." "$dir/frontend/"

echo "==> building the agent wheel"
# Built from a clean copy, so no build/ or egg-info lands in the source tree.
cp -r "$ROOT/agent/pyproject.toml" "$ROOT/agent/README.md" "$ROOT/agent/floppyoctotouch_agent" \
  "$stage/agent-src/"
find "$stage/agent-src" -name '__pycache__' -type d -prune -exec rm -rf {} +
python3 -m pip wheel --quiet --disable-pip-version-check --no-deps --wheel-dir "$dir/agent" \
  "$stage/agent-src"
ls "$dir/agent"/floppyoctotouch_agent-"$version"-*.whl >/dev/null 2>&1 ||
  die "the agent wheel was not built"

cp -r "$ROOT/deploy" "$dir/deploy"
find "$dir/deploy" -name '.gitkeep' -delete
cp "$ROOT/LICENSE" "$ROOT/README.md" "$ROOT/CHANGELOG.md" "$dir/"
printf '%s\n' "$version" >"$dir/VERSION"

# Files from a Windows bind mount have odd modes: set them explicitly.
find "$dir" -type d -exec chmod 755 {} +
find "$dir" -type f -exec chmod 644 {} +
find "$dir/deploy" -name '*.sh' -exec chmod 755 {} +

mkdir -p "$OUT"
# Only the latest release is kept (release/ is committed, so a clone is ready to install).
rm -f "$OUT"/floppyoctotouch-*.tar.gz "$OUT"/floppyoctotouch-*.tar.gz.sha256
tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="@${SOURCE_DATE_EPOCH:-$(date +%s)}" \
  -C "$stage" -cf - "$name" | gzip -n -9 >"$OUT/$name.tar.gz"
(cd "$OUT" && sha256sum "$name.tar.gz" >"$name.tar.gz.sha256")

echo "==> $OUT/$name.tar.gz ($(du -h "$OUT/$name.tar.gz" | cut -f1))"
cat "$OUT/$name.tar.gz.sha256"
