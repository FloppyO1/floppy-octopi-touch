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

require_root() {
  [ "$(id -u)" = 0 ] || die "run this script as root, e.g.: sudo $0 $*"
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
