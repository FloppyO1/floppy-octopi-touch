#!/usr/bin/env bash
# Updates FloppyOctoTouch from a release tarball, keeping the configuration (API key, dashboard settings,
# kiosk options). Installed as /usr/local/bin/floppyoctotouch-update.
#
#   sudo floppyoctotouch-update floppyoctotouch-X.Y.Z.tar.gz
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
# shellcheck source=SCRIPTDIR/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<EOF
Usage: sudo $0 [options] floppyoctotouch-X.Y.Z.tar.gz

Installs a new release over the current one. The API key, the dashboard settings and the kiosk options
are kept; the display settings in config.txt are not touched.
The checksum file (floppyoctotouch-X.Y.Z.tar.gz.sha256) next to the tarball is checked when present.

Options:
  --non-interactive  never ask (a missing checksum file or an older version then aborts)
  --force            also install the same or an older version, or without a checksum file
  -h, --help         show this help
EOF
}

TARBALL=''
FORCE=0
WORK_DIR=''

parse_args() {
  local arg
  for arg in "$@"; do
    case $arg in
      --non-interactive) NON_INTERACTIVE=1 ;;
      --force) FORCE=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      -*) die "unknown option: $arg (see --help)" ;;
      *)
        [ -z "$TARBALL" ] || die "only one tarball, please"
        TARBALL=$arg
        ;;
    esac
  done
  [ -n "$TARBALL" ] || {
    usage >&2
    exit 1
  }
}

verify_checksum() {
  local dir name
  dir=$(dirname "$TARBALL")
  name=$(basename "$TARBALL")
  if [ -f "$TARBALL.sha256" ]; then
    (cd "$dir" && sha256sum --check --status "$name.sha256") || die "checksum mismatch: $TARBALL is damaged"
    ok "checksum verified ($name.sha256)"
  elif [ "$FORCE" = 1 ]; then
    warn "no checksum file $name.sha256: not verified"
  else
    warn "no checksum file $name.sha256 next to the tarball"
    ask_yes_no "Install it without verifying?" n || die "aborted (copy the .sha256 file too, or use --force)"
  fi
}

cleanup() {
  if [ -n "$WORK_DIR" ]; then
    rm -rf -- "$WORK_DIR"
  fi
}

main() {
  local new_dir dir new_version installed newest
  local -a args
  parse_args "$@"
  require_root "$@"
  require_tty
  [ -f "$FOT_STATE" ] || die "FloppyOctoTouch is not installed here: run deploy/install.sh from the release"
  load_state
  [ -f "$TARBALL" ] || die "file not found: $TARBALL"
  TARBALL=$(readlink -f "$TARBALL")

  step "Checking $(basename "$TARBALL")"
  verify_checksum
  WORK_DIR=$(mktemp -d)
  trap cleanup EXIT
  tar -xzf "$TARBALL" -C "$WORK_DIR"
  new_dir=''
  for dir in "$WORK_DIR"/floppyoctotouch-*/; do
    new_dir=${dir%/}
    break
  done
  if [ ! -f "$new_dir/deploy/install.sh" ] || [ ! -f "$new_dir/VERSION" ]; then
    die "$TARBALL is not a FloppyOctoTouch release"
  fi
  new_version=$(tr -d '[:space:]' <"$new_dir/VERSION")
  installed=$(tr -d '[:space:]' <"$FOT_PREFIX/VERSION" 2>/dev/null || true)
  info "installed: ${installed:-unknown}, new: $new_version"

  if [ "$new_version" = "$installed" ]; then
    [ "$FORCE" = 1 ] || ask_yes_no "Version $new_version is already installed. Install it again?" n ||
      die "nothing to do (use --force to reinstall)"
  elif [ -n "$installed" ]; then
    newest=$(printf '%s\n%s\n' "$installed" "$new_version" | sort -V | tail -n1)
    if [ "$newest" = "$installed" ]; then
      warn "$new_version is older than the installed $installed"
      [ "$FORCE" = 1 ] || ask_yes_no "Downgrade?" n || die "aborted (use --force to downgrade)"
    fi
  fi

  args=(--update "--user=${FOT_USER_SAVED:?missing in $FOT_STATE}")
  [ "$NON_INTERACTIVE" = 1 ] && args+=(--non-interactive)
  [ "${FOT_LISTEN_LAN:-0}" = 1 ] && args+=(--listen-lan)
  bash "$new_dir/deploy/install.sh" "${args[@]}"
}

main "$@"
