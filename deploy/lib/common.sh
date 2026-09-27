# shellcheck shell=bash
# shellcheck disable=SC2034  # constants used by the scripts that source this file
# Helpers shared by install.sh, update.sh and uninstall.sh (sourced, never run on its own).

FOT_PREFIX=/opt/floppyoctotouch
FOT_ETC=/etc/floppyoctotouch
FOT_STATE=$FOT_ETC/install.conf
FOT_KIOSK_ENV=$FOT_ETC/kiosk.env
UNIT_DIR=/etc/systemd/system
AGENT_UNIT=floppyoctotouch-agent.service
KIOSK_UNIT=floppyoctotouch-kiosk.service
UDEV_RULE=/etc/udev/rules.d/99-floppyoctotouch-usb.rules
SUDOERS_FILE=/etc/sudoers.d/floppyoctotouch
PAM_FILE=/etc/pam.d/floppyoctotouch-kiosk
BIN_DIR=/usr/local/bin
AGENT_HEALTH_URL=http://127.0.0.1:8765/local/health
DISPLAY_BEGIN="# >>> FloppyOctoTouch display >>>"
DISPLAY_END="# <<< FloppyOctoTouch display <<<"

NON_INTERACTIVE=0

if [ -t 1 ]; then
  C_RESET=$'\e[0m' C_BOLD=$'\e[1m' C_BLUE=$'\e[34m' C_GREEN=$'\e[32m' C_YELLOW=$'\e[33m' C_RED=$'\e[31m'
else
  C_RESET='' C_BOLD='' C_BLUE='' C_GREEN='' C_YELLOW='' C_RED=''
fi

step() { printf '\n%s==> %s%s\n' "$C_BOLD$C_BLUE" "$*" "$C_RESET"; }
info() { printf '    %s\n' "$*"; }
ok() { printf '    %s%s%s\n' "$C_GREEN" "$*" "$C_RESET"; }
warn() { printf '    %sWarning:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die() {
  printf '%sError:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2
  exit 1
}

# ensure_root SCRIPT ARGS...: not root -> run the script again through sudo (with bash, so a lost executable
# bit does not matter). With --non-interactive sudo must not ask for a password.
ensure_root() {
  local script=$1
  shift
  [ "$(id -u)" = 0 ] && return 0
  command -v sudo >/dev/null ||
    die "this script needs root and sudo is not installed: run it as root (su -c 'bash $script $*')"
  info "root privileges needed: running it again with sudo"
  if [ "$NON_INTERACTIVE" = 1 ]; then
    exec sudo -n -- bash "$script" "$@"
  fi
  exec sudo -- bash "$script" "$@"
}

# Prompts read the terminal directly, so they work even when stdin is a pipe.
require_tty() {
  [ "$NON_INTERACTIVE" = 1 ] && return 0
  if ! { : </dev/tty; } 2>/dev/null; then
    die "no terminal to ask questions on: run it from a terminal or add --non-interactive"
  fi
}

# ask_yes_no QUESTION DEFAULT(y|n): with --non-interactive the default is the answer.
ask_yes_no() {
  local question=$1 default=$2 hint answer
  if [ "$NON_INTERACTIVE" = 1 ]; then
    [ "$default" = y ]
    return
  fi
  if [ "$default" = y ]; then hint='[Y/n]'; else hint='[y/N]'; fi
  while true; do
    printf '    %s %s ' "$question" "$hint" >/dev/tty
    IFS= read -r answer </dev/tty || answer=''
    answer=${answer,,}
    [ -n "$answer" ] || answer=$default
    case $answer in
      y | yes) return 0 ;;
      n | no) return 1 ;;
    esac
  done
}

# ask_value QUESTION DEFAULT -> prints the answer (the default when empty or non-interactive).
ask_value() {
  local question=$1 default=$2 answer
  if [ "$NON_INTERACTIVE" = 1 ]; then
    printf '%s\n' "$default"
    return
  fi
  printf '    %s [%s] ' "$question" "$default" >/dev/tty
  IFS= read -r answer </dev/tty || answer=''
  printf '%s\n' "${answer:-$default}"
}

# ask_secret QUESTION -> prints what was typed, without echoing it.
ask_secret() {
  local question=$1 answer
  printf '    %s ' "$question" >/dev/tty
  IFS= read -rs answer </dev/tty || answer=''
  printf '\n' >/dev/tty
  printf '%s\n' "$answer"
}

# countdown SECONDS MESSAGE: 0 when it ran out, 1 when Ctrl+C cancelled it.
countdown() {
  local seconds=$1 message=$2 cancelled=0
  trap 'cancelled=1' INT
  while [ "$seconds" -gt 0 ] && [ "$cancelled" = 0 ]; do
    printf '\r    %s in %2d s (Ctrl+C to cancel) ' "$message" "$seconds"
    sleep 1 || true
    seconds=$((seconds - 1))
  done
  trap - INT
  printf '\n'
  [ "$cancelled" = 0 ]
}

# systemd as PID 1? In a plain container units can be enabled (symlinks) but not started.
systemd_running() { [ -d /run/systemd/system ]; }

systemctl_live() {
  if systemd_running; then
    systemctl "$@"
  fi
}

pkg_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'
}

user_home() { getent passwd "$1" | cut -d: -f6; }

# Loads the state saved by install.sh (root-owned shell assignments).
load_state() {
  if [ -f "$FOT_STATE" ]; then
    # shellcheck source=/dev/null
    . "$FOT_STATE"
  fi
}

# Directory holding config.txt / cmdline.txt (Bookworm: /boot/firmware).
boot_dir() {
  local dir
  for dir in /boot/firmware /boot; do
    if [ -f "$dir/config.txt" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
  done
  return 1
}

backup_file() {
  local backup
  backup="$1.floppyoctotouch-$(date +%Y%m%d-%H%M%S).bak"
  cp -p "$1" "$backup"
  info "backup: $backup"
}

# Removes the block between DISPLAY_BEGIN and DISPLAY_END (and the blank line before it).
remove_display_block() {
  local file=$1 tmp
  tmp=$(mktemp)
  awk -v begin="$DISPLAY_BEGIN" -v end="$DISPLAY_END" '
    $0 == begin { skip = 1; blank = 0; next }
    skip && $0 == end { skip = 0; next }
    skip { next }
    $0 == "" { blank++; next }
    { while (blank > 0) { print ""; blank-- } print }
  ' "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

# Removes one space-separated token from the single line of cmdline.txt.
remove_cmdline_token() {
  local file=$1 token=$2 line out='' word
  local -a words
  IFS= read -r line <"$file" || true
  read -ra words <<<"$line"
  for word in "${words[@]}"; do
    [ "$word" = "$token" ] && continue
    out="${out:+$out }$word"
  done
  printf '%s\n' "$out" >"$file"
}

# ------------------------------------------------------------------------ Cancel Objects plugin
# Optional OctoPrint plugin used by the dashboard to cancel single objects. Installed and removed only
# through OctoPrint's Plugin Manager API (like its own button), at this verified version.
CANCELOBJECT_VERSION=0.6.4
CANCELOBJECT_URL="https://github.com/paukstelis/OctoPrint-Cancelobject/archive/refs/tags/$CANCELOBJECT_VERSION.zip"

# octoprint_api METHOD URL KEY [JSON]: prints the HTTP status (000 = no answer) and, on a second line, the
# "state" field of a JSON answer (for /api/job). The key goes through the environment, not the command line.
octoprint_api() {
  FOT_KEY=${3:-} FOT_BODY=${4:-} python3 - "$1" "$2" <<'PY'
import json, os, sys, urllib.error, urllib.request

method, url = sys.argv[1], sys.argv[2]
body = os.environ.get("FOT_BODY") or None
request = urllib.request.Request(url, data=body.encode() if body else None, method=method)
if body:
    request.add_header("Content-Type", "application/json")
if os.environ.get("FOT_KEY"):
    request.add_header("X-Api-Key", os.environ["FOT_KEY"])
status, state = "000", ""
try:
    with urllib.request.urlopen(request, timeout=30) as response:
        status = str(response.status)
        try:
            state = str(json.load(response).get("state", ""))
        except Exception:
            pass
except urllib.error.HTTPError as error:
    status = str(error.code)
except Exception:
    pass
print(status)
print(state)
PY
}

# cancel_plugin_version PYTHON: version installed in OctoPrint's Python ('' = none, or Python unknown).
cancel_plugin_version() {
  if [ -z "${1:-}" ] || [ ! -x "$1" ]; then
    return 0
  fi
  "$1" -c 'import importlib.metadata as m; print(m.version("OctoPrint-Cancelobject"))' 2>/dev/null || true
}

# restart_octoprint URL KEY: 0 = restarted and answering, 1 = failed, 2 = printing (not restarted),
# 3 = no systemd (container).
restart_octoprint() {
  local state i
  state=$(octoprint_api GET "$1/api/job" "$2" | sed -n 2p)
  case $state in
    Printing* | Paused* | Pausing* | Resuming* | Cancelling* | Finishing* | Starting*) return 2 ;;
  esac
  systemd_running || return 3
  systemctl restart octoprint.service || return 1
  for i in $(seq 1 120); do
    [ "$(octoprint_api GET "$1/api/version" "$2" | head -n1)" = 200 ] && return 0
    sleep 1
  done
  return 1
}
