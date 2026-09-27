#!/usr/bin/env bash
# FloppyOctoTouch installer for OctoPi 1.1.0 (Raspberry Pi OS Bookworm Lite, arm64 or armhf).
#
# Run it from a clone or an extracted release: ./deploy/install.sh (it runs itself through sudo if needed).
# Every question comes first (API key, Cancel Objects plugin, display, reboot), then it works on its own.
# It is idempotent: running it again repairs or reconfigures an installation. See README "Installation".
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SRC_DIR=$(dirname "$SCRIPT_DIR")
# shellcheck source=SCRIPTDIR/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<EOF
Usage: $0 [options]

Installs the FloppyOctoTouch dashboard: agent service, cage + Chromium kiosk on tty1, USB stick automount.
Needs root: without it the installer runs itself again with sudo.

Options:
  --non-interactive      never ask: use the detected/default answers (display settings included,
                         unless --skip-display-config)
  --api-key=KEY          OctoPrint API key (checked against OctoPrint); without it the saved key is kept,
                         or it can be entered later on the touch screen
  --user=NAME            user that runs the dashboard (default: the user of octoprint.service)
  --octoprint-url=URL    OctoPrint address (default: http://127.0.0.1:<port of octoprint.service>)
  --skip-display-config  do not touch config.txt / cmdline.txt
  --listen-lan           let the agent listen on every network interface. WARNING: it adds the API key to
                         every request, so anyone on the network gets full control of the printer
  --no-cancel-plugin     do not offer the Cancel Objects OctoPrint plugin (cancel single objects)
  --update               used by update.sh: keep the configuration, no questions about key and display
  -h, --help             show this help
EOF
}

API_KEY=''
API_KEY_GIVEN=0
USER_ARG=''
OCTOPRINT_URL=''
SKIP_DISPLAY=0
LISTEN_LAN=0
NO_CANCEL_PLUGIN=0
UPDATE=0

parse_args() {
  local arg
  for arg in "$@"; do
    case $arg in
      --non-interactive) NON_INTERACTIVE=1 ;;
      --api-key=*)
        API_KEY=${arg#*=}
        API_KEY_GIVEN=1
        ;;
      --user=*) USER_ARG=${arg#*=} ;;
      --octoprint-url=*) OCTOPRINT_URL=${arg#*=} ;;
      --skip-display-config) SKIP_DISPLAY=1 ;;
      --listen-lan) LISTEN_LAN=1 ;;
      --no-cancel-plugin) NO_CANCEL_PLUGIN=1 ;;
      --update)
        UPDATE=1
        SKIP_DISPLAY=1
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $arg (see --help)" ;;
    esac
  done
}

# ------------------------------------------------------------------------------------ payload
FRONTEND_SRC=''
AGENT_WHEEL=''
AGENT_SRC=''
VERSION=''

find_payload() {
  if [ -f "$SRC_DIR/VERSION" ]; then
    VERSION=$(tr -d '[:space:]' <"$SRC_DIR/VERSION")
  elif [ -f "$SRC_DIR/agent/pyproject.toml" ]; then
    VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' "$SRC_DIR/agent/pyproject.toml" | head -n1)
  fi
  [ -n "$VERSION" ] || die "cannot tell the version: run the installer from an extracted release"

  # Release layout: frontend/ = built app. Git checkout: frontend/dist (built with Docker on a PC).
  if [ -f "$SRC_DIR/frontend/dist/index.html" ]; then
    FRONTEND_SRC=$SRC_DIR/frontend/dist
  elif [ -f "$SRC_DIR/frontend/index.html" ] && [ ! -f "$SRC_DIR/frontend/package.json" ]; then
    FRONTEND_SRC=$SRC_DIR/frontend
  else
    die "no built web app found: use a release tarball (scripts/build-release.sh), the Pi cannot build it"
  fi

  AGENT_WHEEL=$({ find "$SRC_DIR/agent" -maxdepth 1 -name 'floppyoctotouch_agent-*.whl' 2>/dev/null ||
    true; } | sort | tail -n1)
  if [ -z "$AGENT_WHEEL" ]; then
    [ -f "$SRC_DIR/agent/pyproject.toml" ] || die "agent package not found in $SRC_DIR/agent"
    AGENT_SRC=$SRC_DIR/agent
  fi
}

# ------------------------------------------------------------------------------------ checks
check_system() {
  local codename='' arch model
  # shellcheck source=/dev/null
  [ -f /etc/os-release ] && codename=$(. /etc/os-release && printf '%s' "${VERSION_CODENAME:-}")
  if [ "$codename" = bookworm ]; then
    ok "Debian/Raspberry Pi OS bookworm"
  else
    warn "this installer targets OctoPi 1.1.0 (bookworm), this system is '${codename:-unknown}'"
    ask_yes_no "Continue anyway?" n || die "aborted"
  fi

  arch=$(dpkg --print-architecture)
  case $arch in
    arm64 | armhf) ok "architecture $arch" ;;
    *) warn "architecture $arch: not a Raspberry Pi, continuing (test system?)" ;;
  esac
  if [ -r /proc/device-tree/model ]; then
    model=$(tr -d '\0' </proc/device-tree/model)
    info "board: $model"
  fi
  command -v python3 >/dev/null || die "python3 is missing (OctoPi ships it)"
  command -v systemctl >/dev/null || die "systemd is required"
}

OCTOPRINT_UNIT_TEXT=''

read_octoprint_unit() {
  local file
  if systemd_running; then
    OCTOPRINT_UNIT_TEXT=$(systemctl cat octoprint.service 2>/dev/null || true)
  fi
  if [ -z "$OCTOPRINT_UNIT_TEXT" ]; then
    for file in /etc/systemd/system/octoprint.service /lib/systemd/system/octoprint.service \
      /usr/lib/systemd/system/octoprint.service; do
      if [ -f "$file" ]; then
        OCTOPRINT_UNIT_TEXT=$(cat "$file")
        break
      fi
    done
  fi
}

# Value of a variable set in the unit (Environment="PORT=5000" or an EnvironmentFile=), the last one wins.
unit_variable() {
  local name=$1 value='' line file found
  while IFS= read -r line; do
    case $line in
      Environment=*)
        found=$({ grep -oE "(^|[\" ])$name=[^\" ]*" <<<"${line#Environment=}" || true; } | tail -n1)
        [ -z "$found" ] || value=${found#*"$name="}
        ;;
      EnvironmentFile=*)
        file=${line#EnvironmentFile=}
        file=${file#-}
        [ -f "$file" ] || continue
        found=$(sed -n "s/^[[:space:]]*$name=//p" "$file" | tail -n1 | tr -d "\"'")
        [ -z "$found" ] || value=$found
        ;;
    esac
  done <<<"$OCTOPRINT_UNIT_TEXT"
  printf '%s\n' "$value"
}

# Value of an OctoPrint command line option (--port=5000 or --port 5000) in the unit's ExecStart.
# OctoPi 1.1.0 passes --port=${PORT}: variables are resolved, an unknown one gives an empty value.
octoprint_option() {
  local value
  value=$({ grep '^ExecStart=' <<<"$OCTOPRINT_UNIT_TEXT" || true; } | tail -n1 |
    sed -n "s/.*--$1[= ]\([^ ]*\).*/\1/p")
  if [[ $value =~ ^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$ ]]; then
    value=$(unit_variable "${BASH_REMATCH[1]}")
  fi
  case $value in *'$'*) value='' ;; esac
  printf '%s\n' "$value"
}

FOT_USER=''
FOT_GROUP=''
FOT_UID=''
FOT_HOME=''

# The user of octoprint.service is taken without asking; only a guess (sudo user, pi) is asked for.
choose_user() {
  local detected='' octoprint_user=''
  octoprint_user=$(printf '%s\n' "$OCTOPRINT_UNIT_TEXT" | sed -n 's/^User=//p' | tail -n1)
  # OctoPi 1.1.0 writes the uid (User=1000), so the unit survives renaming the user in Raspberry Pi Imager.
  if [[ $octoprint_user =~ ^[0-9]+$ ]]; then
    octoprint_user=$(getent passwd "$octoprint_user" | cut -d: -f1)
  fi
  detected=$octoprint_user
  if [ -n "$detected" ]; then
    info "octoprint.service runs as '$detected'"
  else
    if [ -n "$OCTOPRINT_UNIT_TEXT" ]; then
      warn "cannot tell the user of octoprint.service"
    else
      warn "octoprint.service not found"
    fi
    if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
      detected=$SUDO_USER
    elif id pi >/dev/null 2>&1; then
      detected=pi
    fi
  fi

  if [ -n "$USER_ARG" ]; then
    FOT_USER=$USER_ARG
  elif [ "$UPDATE" = 1 ] && [ -n "${FOT_USER_SAVED:-}" ]; then
    FOT_USER=$FOT_USER_SAVED
  elif [ -n "$octoprint_user" ]; then
    FOT_USER=$octoprint_user
  else
    [ -n "$detected" ] || [ "$NON_INTERACTIVE" = 0 ] || die "cannot detect the OctoPrint user: add --user=NAME"
    FOT_USER=$(ask_value "User that runs OctoPrint and the dashboard:" "$detected")
  fi
  [[ $FOT_USER =~ ^[a-z_][a-z0-9_-]*$ ]] || die "invalid user name '$FOT_USER'"
  id "$FOT_USER" >/dev/null 2>&1 || die "user '$FOT_USER' does not exist"
  FOT_UID=$(id -u "$FOT_USER")
  [ "$FOT_UID" != 0 ] || die "the dashboard must not run as root"
  FOT_GROUP=$(id -gn "$FOT_USER")
  FOT_HOME=$(user_home "$FOT_USER")
  [ -d "$FOT_HOME" ] || die "home directory of $FOT_USER not found"
  if [ -n "$detected" ] && [ "$FOT_USER" != "$detected" ]; then
    warn "OctoPrint runs as '$detected': thumbnails are read from its uploads only if $FOT_USER can read them"
  fi
  ok "dashboard user: $FOT_USER (uid $FOT_UID)"
}

# HTTP status of a GET (000 = no answer). The API key goes through the environment, not the command line.
http_status() {
  FOT_KEY=${2:-} python3 - "$1" <<'PY'
import os, sys, urllib.error, urllib.request

request = urllib.request.Request(sys.argv[1])
if os.environ.get("FOT_KEY"):
    request.add_header("X-Api-Key", os.environ["FOT_KEY"])
try:
    with urllib.request.urlopen(request, timeout=5) as response:
        print(response.status)
except urllib.error.HTTPError as error:
    print(error.code)
except Exception:
    print("000")
PY
}

UPLOADS_DIR=''

check_octoprint() {
  local port basedir status i
  port=$(octoprint_option port)
  basedir=$(octoprint_option basedir)
  [ -n "$OCTOPRINT_URL" ] || OCTOPRINT_URL=http://127.0.0.1:${port:-5000}
  OCTOPRINT_URL=${OCTOPRINT_URL%/}
  UPLOADS_DIR=${basedir:-$FOT_HOME/.octoprint}/uploads

  # Right after a boot OctoPrint may still be starting: give it a few seconds.
  for i in $(seq 1 10); do
    status=$(http_status "$OCTOPRINT_URL/api/version")
    [ "$status" = 000 ] || break
    [ "$i" = 1 ] && info "waiting for OctoPrint on $OCTOPRINT_URL"
    sleep 1
  done
  if [ "$status" = 000 ]; then
    warn "OctoPrint does not answer on $OCTOPRINT_URL"
    if [ "$UPDATE" = 0 ]; then
      ask_yes_no "Continue anyway (the API key cannot be checked)?" n ||
        die "start OctoPrint (sudo systemctl start octoprint) or pass --octoprint-url=URL"
    fi
  else
    ok "OctoPrint answers on $OCTOPRINT_URL"
  fi
}

# ------------------------------------------------------------------------------------ packages
install_packages() {
  local -a wanted=(cage python3-venv wlr-randr fonts-dejavu-core curl) missing=()
  local pkg chromium=''
  for pkg in chromium chromium-browser; do
    if pkg_installed "$pkg"; then
      chromium=$pkg
    fi
  done
  for pkg in "${wanted[@]}"; do
    pkg_installed "$pkg" || missing+=("$pkg")
  done
  if [ -z "$chromium" ] || [ ${#missing[@]} -gt 0 ]; then
    info "updating the package lists"
    apt-get update -q
  fi
  if [ -z "$chromium" ]; then
    # Raspberry Pi OS renamed chromium-browser to chromium; take whichever has a candidate.
    for pkg in chromium chromium-browser; do
      if grep -q 'Candidate: [0-9]' <<<"$(apt-cache policy "$pkg" 2>/dev/null || true)"; then
        chromium=$pkg
        break
      fi
    done
    [ -n "$chromium" ] || die "no Chromium package available (chromium / chromium-browser)"
    missing+=("$chromium")
  fi
  if [ ${#missing[@]} -gt 0 ]; then
    info "installing: ${missing[*]}"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q "${missing[@]}"
  fi
  ok "packages: cage, $chromium, python3-venv, wlr-randr, fonts-dejavu-core, curl"
}

# ------------------------------------------------------------------------------------ files
# Replaces a directory with a copy of another one (new inode: running scripts keep their old copy).
replace_dir() {
  local src=$1 dest=$2
  if [ -e "$dest" ] && [ "$src" -ef "$dest" ]; then
    return 0
  fi
  rm -rf -- "$dest.new"
  cp -r -- "$src" "$dest.new"
  rm -rf -- "$dest"
  mv -- "$dest.new" "$dest"
}

# cage draws its own arrow in the middle of the screen (CSS only hides it over the page): the kiosk unit points
# XCURSOR_PATH at a "default" theme whose cursors are a single transparent pixel.
install_cursor_theme() {
  local dir=$FOT_PREFIX/cursors/default/cursors name
  rm -rf "$FOT_PREFIX/cursors"
  mkdir -p "$dir"
  python3 - "$dir/left_ptr" <<'PY'
import struct, sys

IMAGE = 0xFFFD0002
size = 24  # nominal size; the image itself is 1x1 and fully transparent
header = struct.pack("<4sIII", b"Xcur", 16, 0x10000, 1) + struct.pack("<III", IMAGE, size, 28)
image = struct.pack("<IIIIIIIII", 36, IMAGE, size, 1, 1, 1, 0, 0, 0) + struct.pack("<I", 0)
with open(sys.argv[1], "wb") as out:
    out.write(header + image)
PY
  for name in default arrow top_left_arrow text xterm pointer hand1 hand2 grab grabbing wait watch progress \
    left_ptr_watch crosshair not-allowed move all-scroll col-resize row-resize; do
    ln -s left_ptr "$dir/$name"
  done
  printf '[Icon Theme]\nName=default\nComment=FloppyOctoTouch: invisible cursor\n' \
    >"$FOT_PREFIX/cursors/default/index.theme"
}

install_files() {
  mkdir -p "$FOT_PREFIX"
  replace_dir "$FRONTEND_SRC" "$FOT_PREFIX/frontend"
  replace_dir "$SCRIPT_DIR" "$FOT_PREFIX/deploy"
  if [ -n "$AGENT_WHEEL" ]; then
    rm -rf "$FOT_PREFIX/agent.new"
    mkdir -p "$FOT_PREFIX/agent.new"
    cp -- "$AGENT_WHEEL" "$FOT_PREFIX/agent.new/"
    rm -rf "$FOT_PREFIX/agent"
    mv "$FOT_PREFIX/agent.new" "$FOT_PREFIX/agent"
    AGENT_WHEEL=$FOT_PREFIX/agent/$(basename "$AGENT_WHEEL")
  else
    replace_dir "$AGENT_SRC" "$FOT_PREFIX/agent"
    AGENT_SRC=$FOT_PREFIX/agent
  fi
  printf '%s\n' "$VERSION" >"$FOT_PREFIX/VERSION"
  install_cursor_theme
  for doc in README.md LICENSE CHANGELOG.md; do
    if [ -f "$SRC_DIR/$doc" ] && ! [ "$SRC_DIR/$doc" -ef "$FOT_PREFIX/$doc" ]; then
      cp -- "$SRC_DIR/$doc" "$FOT_PREFIX/$doc"
    fi
  done
  chown -R root:root "$FOT_PREFIX"
  chmod -R u=rwX,go=rX "$FOT_PREFIX/frontend" "$FOT_PREFIX/deploy" "$FOT_PREFIX/agent"
  find "$FOT_PREFIX/deploy" -name '*.sh' -exec chmod 755 {} +
  ln -sfn "$FOT_PREFIX/deploy/update.sh" "$BIN_DIR/floppyoctotouch-update"
  ln -sfn "$FOT_PREFIX/deploy/uninstall.sh" "$BIN_DIR/floppyoctotouch-uninstall"
  ok "files in $FOT_PREFIX"
}

install_venv() {
  local venv=$FOT_PREFIX/venv system_version venv_version='' target installed
  system_version=$(python3 -c 'import platform; print(platform.python_version())')
  if [ -x "$venv/bin/python" ]; then
    venv_version=$("$venv/bin/python" -c 'import platform; print(platform.python_version())' || true)
  fi
  if [ "$venv_version" != "$system_version" ]; then
    info "creating the Python $system_version virtual environment"
    rm -rf "$venv"
    python3 -m venv "$venv"
  fi
  target=${AGENT_WHEEL:-$AGENT_SRC}
  info "installing the agent and its dependencies (aiohttp)"
  "$venv/bin/pip" install -q --disable-pip-version-check --no-cache-dir "$target"
  # Same version number but a new build (e.g. a repaired installation): replace the agent itself.
  "$venv/bin/pip" install -q --disable-pip-version-check --no-cache-dir --force-reinstall --no-deps "$target"
  installed=$("$venv/bin/floppyoctotouch-agent" --version)
  [ "$installed" = "$VERSION" ] || warn "the agent reports version $installed, expected $VERSION"
  ok "agent $installed in $venv"
}

# ------------------------------------------------------------------------------------ agent config
CONFIG_DIR=''
CONFIG_FILE=''
SAVED_KEY=''

read_saved_key() {
  CONFIG_DIR=$FOT_HOME/.config/floppyoctotouch
  CONFIG_FILE=$CONFIG_DIR/config.json
  SAVED_KEY=''
  if [ -f "$CONFIG_FILE" ]; then
    SAVED_KEY=$(python3 -c '
import json, sys
try:
    print(json.load(open(sys.argv[1], encoding="utf-8")).get("api_key", ""))
except Exception:
    pass
' "$CONFIG_FILE")
  fi
}

valid_key_format() { [[ $1 =~ ^[A-Za-z0-9_-]{16,128}$ ]]; }

# 0 = accepted, 1 = rejected, 2 = OctoPrint does not answer (cannot tell).
check_key() {
  local status
  status=$(http_status "$OCTOPRINT_URL/api/version" "$1")
  case $status in
    200) return 0 ;;
    000) return 2 ;;
    *) return 1 ;;
  esac
}

key_instructions() {
  local ip host
  ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  host=$(hostname 2>/dev/null || true)
  info "The dashboard needs an OctoPrint API key. Create it from a PC or phone:"
  info "  1. open ${ip:+http://$ip/ (or }http://${host:-octopi}.local/${ip:+)} and log in to OctoPrint"
  info "  2. Settings (wrench icon at the top) > Application Keys"
  info "  3. App identifier: FloppyOctoTouch, then Generate"
  info "  4. copy the key and paste it here (in most SSH terminals: right click or Ctrl+Shift+V)"
  info "Just press Enter to type it later on the touch screen; Ctrl+C stops the installer."
}

choose_api_key() {
  local key status
  if [ "$API_KEY_GIVEN" = 1 ]; then
    valid_key_format "$API_KEY" || die "--api-key: expected 16-128 letters, digits, '-' or '_'"
    status=0
    check_key "$API_KEY" || status=$?
    case $status in
      0) ok "API key …${API_KEY: -4} accepted by OctoPrint" ;;
      1) die "OctoPrint rejected the API key given with --api-key" ;;
      *) warn "API key …${API_KEY: -4} saved without checking it (OctoPrint does not answer)" ;;
    esac
    return
  fi
  # A saved key that still works is kept without asking (change it with --api-key= or on the touch screen).
  if [ -n "$SAVED_KEY" ]; then
    if [ "$UPDATE" = 1 ]; then
      info "keeping the saved API key …${SAVED_KEY: -4}"
      return
    fi
    status=0
    check_key "$SAVED_KEY" || status=$?
    case $status in
      0)
        ok "saved API key …${SAVED_KEY: -4} still accepted by OctoPrint: kept"
        return
        ;;
      2)
        info "keeping the saved API key …${SAVED_KEY: -4} (not checked: OctoPrint does not answer)"
        return
        ;;
    esac
    warn "OctoPrint rejects the saved API key …${SAVED_KEY: -4}"
  fi
  if [ "$UPDATE" = 1 ] || [ "$NON_INTERACTIVE" = 1 ]; then
    warn "no working API key: enter it on the touch screen (the dashboard asks for it)"
    return
  fi

  key_instructions
  while true; do
    key=$(ask_secret "Paste the API key and press Enter (it stays hidden):")
    key=${key//[[:space:]]/}
    if [ -z "$key" ]; then
      warn "no API key for now: the touch screen asks for it when the dashboard starts"
      return
    fi
    if ! valid_key_format "$key"; then
      warn "that does not look like an API key (16-128 letters, digits, '-' or '_'): paste it again"
      continue
    fi
    status=0
    check_key "$key" || status=$?
    case $status in
      0)
        API_KEY=$key
        ok "API key …${key: -4} accepted by OctoPrint"
        return
        ;;
      2)
        API_KEY=$key
        warn "OctoPrint does not answer: API key …${key: -4} saved without checking it"
        return
        ;;
    esac
    warn "OctoPrint rejected that key: copy it again from Application Keys and paste it (Ctrl+C to stop)"
  done
}

# ------------------------------------------------------------------------------------ Cancel Objects plugin
OCTOPRINT_PYTHON=''
CANCEL_PLUGIN_WANTED=0
CANCEL_PLUGIN_STATE=''

# OctoPrint's own Python, next to the octoprint executable of the unit (/opt/octopi/oprint/bin on OctoPi).
find_octoprint_python() {
  local exec bin
  exec=$({ grep '^ExecStart=' <<<"$OCTOPRINT_UNIT_TEXT" || true; } | tail -n1)
  exec=${exec#ExecStart=}
  exec=${exec#[-@+!:]}
  bin=${exec%% *}
  if [ -n "$bin" ] && [ -x "$(dirname "$bin")/python" ]; then
    OCTOPRINT_PYTHON=$(dirname "$bin")/python
  fi
}

# Asked with the other questions; updates never touch OctoPrint's plugins.
plan_cancel_plugin() {
  local installed key=${API_KEY:-$SAVED_KEY}
  [ "$UPDATE" = 0 ] || return 0
  installed=$(cancel_plugin_version "$OCTOPRINT_PYTHON")
  if [ -n "$installed" ]; then
    info "Cancel Objects plugin $installed already installed in OctoPrint"
    CANCEL_PLUGIN_STATE="installed ($installed)"
    return
  fi
  if [ "$NO_CANCEL_PLUGIN" = 1 ]; then
    CANCEL_PLUGIN_STATE='not installed (--no-cancel-plugin)'
    return
  fi
  if [ -z "$key" ]; then
    CANCEL_PLUGIN_STATE="not installed (needs the API key: OctoPrint > Plugin Manager > Cancel Objects)"
    return
  fi
  if [ "$NON_INTERACTIVE" = 1 ]; then
    CANCEL_PLUGIN_WANTED=1
    return
  fi
  info "Optional: the Cancel Objects plugin for OctoPrint lets the dashboard remove single objects from a print."
  if ask_yes_no "Install the Cancel Objects plugin (OctoPrint restarts if it is not printing)?" y; then
    CANCEL_PLUGIN_WANTED=1
  else
    CANCEL_PLUGIN_STATE='not installed'
  fi
}

# Through OctoPrint's Plugin Manager (same as its button), then OctoPrint restarts unless it is printing.
install_cancel_plugin() {
  local key=${API_KEY:-$SAVED_KEY} status version='' i result manual="install Cancel Objects from OctoPrint's Plugin Manager"
  status=$(octoprint_api POST "$OCTOPRINT_URL/api/plugin/pluginmanager" "$key" \
    "{\"command\": \"install\", \"url\": \"$CANCELOBJECT_URL\"}" | head -n1)
  case $status in
    200 | 204) ;;
    401 | 403)
      warn "the API key may not install plugins (it must belong to an admin user): $manual"
      CANCEL_PLUGIN_STATE='not installed (API key without admin rights)'
      return
      ;;
    *)
      warn "OctoPrint did not accept the plugin installation (HTTP $status): $manual"
      CANCEL_PLUGIN_STATE='not installed (Plugin Manager error)'
      return
      ;;
  esac
  info "installing Cancel Objects $CANCELOBJECT_VERSION through OctoPrint's Plugin Manager (it downloads it)"
  if [ -z "$OCTOPRINT_PYTHON" ]; then
    warn "cannot find OctoPrint's Python to follow the installation: check OctoPrint > Plugin Manager"
    CANCEL_PLUGIN_STATE='installation requested (restart OctoPrint when it is done)'
    return
  fi
  for i in $(seq 1 300); do
    version=$(cancel_plugin_version "$OCTOPRINT_PYTHON")
    [ -z "$version" ] || break
    [ $((i % 30)) -eq 0 ] && info "still installing ($i s)"
    sleep 1
  done
  if [ -z "$version" ]; then
    warn "the plugin did not show up within 5 minutes: check OctoPrint > Plugin Manager"
    CANCEL_PLUGIN_STATE='not installed (timed out)'
    return
  fi
  CANCEL_PLUGIN_INSTALLED=1
  ok "Cancel Objects $version installed"
  result=0
  restart_octoprint "$OCTOPRINT_URL" "$key" || result=$?
  case $result in
    0)
      ok "OctoPrint restarted: the plugin is active"
      CANCEL_PLUGIN_STATE="installed ($version)"
      ;;
    2)
      warn "OctoPrint is printing: restart it after the print to load the plugin (sudo systemctl restart octoprint)"
      CANCEL_PLUGIN_STATE="installed ($version), restart OctoPrint after the print"
      ;;
    3)
      warn "systemd is not running (container?): the plugin loads at the next OctoPrint start"
      CANCEL_PLUGIN_STATE="installed ($version), loaded at the next OctoPrint start"
      ;;
    *)
      warn "OctoPrint did not come back after the restart: sudo systemctl status octoprint"
      CANCEL_PLUGIN_STATE="installed ($version), OctoPrint restart failed"
      ;;
  esac
  info "files uploaded before now must be uploaded again to cancel their objects"
}

DISPLAY_OUTPUT=HDMI-A-1

detect_display_output() {
  local status name
  for status in /sys/class/drm/card*-HDMI-A-*/status; do
    [ -r "$status" ] || continue
    if [ "$(cat "$status")" = connected ]; then
      name=$(basename "$(dirname "$status")")
      DISPLAY_OUTPUT=${name#card*-}
      info "screen connected to $DISPLAY_OUTPUT"
      return
    fi
  done
}

write_config() {
  local host=127.0.0.1
  [ "$LISTEN_LAN" = 1 ] && host=0.0.0.0
  runuser -u "$FOT_USER" -- mkdir -p "$CONFIG_DIR"
  chmod 700 "$CONFIG_DIR"
  # Only the keys managed here are replaced; anything else in config.json is kept.
  FOT_C_OCTOPRINT_URL=$OCTOPRINT_URL FOT_C_HOST=$host FOT_C_PREFIX=$FOT_PREFIX \
    FOT_C_UPLOADS=$UPLOADS_DIR FOT_C_SYSTEMCTL=$(command -v systemctl) FOT_C_KIOSK_UNIT=$KIOSK_UNIT \
    FOT_C_OUTPUT=$DISPLAY_OUTPUT FOT_C_API_KEY=$API_KEY \
    python3 - "$CONFIG_FILE" "$FOT_USER" "$FOT_GROUP" <<'PY'
import json, os, shutil, sys, tempfile

path, user, group = sys.argv[1:4]
env = os.environ
data = {}
if os.path.isfile(path):
    try:
        with open(path, encoding="utf-8") as fh:
            loaded = json.load(fh)
        if isinstance(loaded, dict):
            data = loaded
    except ValueError:
        shutil.copy2(path, path + ".broken")
data.update({
    "octoprint_url": env["FOT_C_OCTOPRINT_URL"],
    "host": env["FOT_C_HOST"],
    "static_dir": env["FOT_C_PREFIX"] + "/frontend",
    "uploads_dir": env["FOT_C_UPLOADS"],
    "usb_roots": ["/media/usb-*"],
    "usb_eject_command": [
        "sudo", "-n", env["FOT_C_PREFIX"] + "/deploy/usb/usb-mount.sh", "eject", "{path}"
    ],
    "kiosk_restart_command": [
        "sudo", "-n", env["FOT_C_SYSTEMCTL"], "restart", env["FOT_C_KIOSK_UNIT"]
    ],
    "display_backend": "wlr-randr",
    "display_output": env["FOT_C_OUTPUT"],
})
if env.get("FOT_C_API_KEY"):
    data["api_key"] = env["FOT_C_API_KEY"]
fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".config-", suffix=".json")
with os.fdopen(fd, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
shutil.chown(tmp, user, group)
os.chmod(tmp, 0o600)
os.replace(tmp, path)
PY
  ok "agent configuration: $CONFIG_FILE (mode 600)"
  if [ "$LISTEN_LAN" = 1 ]; then
    warn "the agent listens on every interface: anyone on the network controls the printer"
  fi
}

# ------------------------------------------------------------------------------------ system files
render() {
  sed -e "s|@USER@|$FOT_USER|g" -e "s|@GROUP@|$FOT_GROUP|g" -e "s|@UID@|$FOT_UID|g" \
    -e "s|@HOME@|$FOT_HOME|g" -e "s|@PREFIX@|$FOT_PREFIX|g" -e "s|@SYSTEMCTL@|$(command -v systemctl)|g" \
    "$1"
}

install_system_files() {
  local tmp group
  install -d -m 755 "$FOT_ETC"
  install -m 644 "$SCRIPT_DIR/pam/floppyoctotouch-kiosk" "$PAM_FILE"
  render "$SCRIPT_DIR/systemd/$AGENT_UNIT.in" >"$UNIT_DIR/$AGENT_UNIT"
  render "$SCRIPT_DIR/systemd/$KIOSK_UNIT.in" >"$UNIT_DIR/$KIOSK_UNIT"
  chmod 644 "$UNIT_DIR/$AGENT_UNIT" "$UNIT_DIR/$KIOSK_UNIT"
  if [ ! -f "$FOT_KIOSK_ENV" ]; then
    install -m 644 "$SCRIPT_DIR/kiosk/kiosk.env" "$FOT_KIOSK_ENV"
  fi
  ok "systemd units $AGENT_UNIT and $KIOSK_UNIT, PAM session, $FOT_KIOSK_ENV"

  tmp=$(mktemp)
  render "$SCRIPT_DIR/sudoers/floppyoctotouch.in" >"$tmp"
  if command -v visudo >/dev/null && ! visudo -c -q -f "$tmp"; then
    rm -f "$tmp"
    die "the generated sudoers rule is invalid"
  fi
  install -m 440 "$tmp" "$SUDOERS_FILE"
  rm -f "$tmp"
  command -v sudo >/dev/null || warn "sudo is not installed: USB eject and screen restart will fail"
  ok "sudo rule for USB eject and screen restart: $SUDOERS_FILE"

  render "$SCRIPT_DIR/udev/99-floppyoctotouch-usb.rules.in" >"$UDEV_RULE"
  chmod 644 "$UDEV_RULE"
  if systemd_running && command -v udevadm >/dev/null; then
    udevadm control --reload || true
  fi
  ok "USB sticks mounted read-only on /media/usb-<label>: $UDEV_RULE"

  for group in video render input; do
    if getent group "$group" >/dev/null && [[ " $(id -nG "$FOT_USER") " != *" $group "* ]]; then
      usermod -aG "$group" "$FOT_USER"
      info "added $FOT_USER to the $group group"
    fi
  done

  systemctl_live daemon-reload
  systemctl enable -q "$AGENT_UNIT" "$KIOSK_UNIT"
  # tty1 belongs to the kiosk now; uninstall.sh gives it back to the login prompt.
  systemctl disable -q getty@tty1.service 2>/dev/null || true
  ok "services enabled at boot, login prompt on tty1 disabled"
}

# ------------------------------------------------------------------------------------ display
BOOT_CHANGED=0
CMDLINE_TOKEN_ADDED=${FOT_CMDLINE_TOKEN:-}
DISPLAY_WANTED=0
BOOT_CONFIG=''
BOOT_CMDLINE=''
HAS_BLOCK=0
HAS_TOKEN=0

# Asked before anything is installed; configure_display() applies the answer later.
plan_display() {
  local dir
  [ "$SKIP_DISPLAY" = 0 ] || return 0
  if ! dir=$(boot_dir); then
    warn "config.txt not found in /boot/firmware or /boot: display settings skipped"
    return
  fi
  BOOT_CONFIG=$dir/config.txt
  BOOT_CMDLINE=$dir/cmdline.txt
  grep -qxF "$DISPLAY_BEGIN" "$BOOT_CONFIG" && HAS_BLOCK=1
  if [ ! -f "$BOOT_CMDLINE" ] || grep -q "video=$DISPLAY_OUTPUT:" "$BOOT_CMDLINE"; then
    HAS_TOKEN=1
  fi
  if [ "$HAS_BLOCK" = 1 ] && [ "$HAS_TOKEN" = 1 ]; then
    ok "display settings already in $BOOT_CONFIG"
    return
  fi
  info "The 7\" HDMI Display (H) needs its 1024x600 mode in $BOOT_CONFIG (manufacturer's lines) and"
  info "'video=$DISPLAY_OUTPUT:1024x600@60' in $BOOT_CMDLINE. Backups are kept; uninstalling removes the lines."
  if ask_yes_no "Add the display settings?" y; then
    DISPLAY_WANTED=1
  else
    info "display settings skipped"
  fi
}

REBOOT_WANTED=0

plan_reboot() {
  [ "$UPDATE" = 0 ] && [ "$NON_INTERACTIVE" = 0 ] || return 0
  if [ "$DISPLAY_WANTED" = 1 ]; then
    ask_yes_no "Reboot automatically at the end (needed for the display settings)?" y && REBOOT_WANTED=1
  else
    ask_yes_no "Reboot automatically at the end (not needed: the dashboard starts right away)?" n &&
      REBOOT_WANTED=1
  fi
  return 0
}

configure_display() {
  local config=$BOOT_CONFIG cmdline=$BOOT_CMDLINE token="video=$DISPLAY_OUTPUT:1024x600@60"
  [ "$DISPLAY_WANTED" = 1 ] || return 0
  if [ "$HAS_BLOCK" = 0 ]; then
    backup_file "$config"
    cat >>"$config" <<EOF

$DISPLAY_BEGIN
# 7" HDMI Display (H), 1024x600 (manufacturer's settings). Removed by FloppyOctoTouch's uninstall.sh.
[all]
hdmi_force_hotplug=1
max_usb_current=1
hdmi_group=2
hdmi_mode=87
hdmi_cvt 1024 600 60 6 0 0 0
hdmi_drive=1
$DISPLAY_END
EOF
    ok "added the display block to $config"
  fi
  if [ "$HAS_TOKEN" = 0 ]; then
    backup_file "$cmdline"
    sed -i "1 s|\$| $token|" "$cmdline"
    CMDLINE_TOKEN_ADDED=$token
    ok "added '$token' to $cmdline"
  fi
  BOOT_CHANGED=1
}

write_state() {
  install -d -m 755 "$FOT_ETC"
  {
    printf '# FloppyOctoTouch installation state (written by install.sh, read by update.sh and uninstall.sh)\n'
    printf 'FOT_VERSION=%q\n' "$VERSION"
    printf 'FOT_USER_SAVED=%q\n' "$FOT_USER"
    printf 'FOT_LISTEN_LAN=%q\n' "$LISTEN_LAN"
    printf 'FOT_CMDLINE_TOKEN=%q\n' "$CMDLINE_TOKEN_ADDED"
    printf 'FOT_CANCEL_PLUGIN=%q\n' "$CANCEL_PLUGIN_INSTALLED"
    printf 'FOT_OCTOPRINT_URL=%q\n' "$OCTOPRINT_URL"
    printf 'FOT_OCTOPRINT_PYTHON=%q\n' "$OCTOPRINT_PYTHON"
  } >"$FOT_STATE"
  chmod 644 "$FOT_STATE"
}

# ------------------------------------------------------------------------------------ start
AGENT_STATE=''

# One line about /local/health; fails while the agent does not answer.
agent_health() {
  python3 - "$AGENT_HEALTH_URL" <<'PY'
import json, sys, urllib.request

try:
    with urllib.request.urlopen(sys.argv[1], timeout=2) as response:
        body = json.load(response)
except Exception:
    sys.exit(1)
octoprint = body.get("octoprint", {})
if octoprint.get("authorized"):
    print(f"running, OctoPrint {octoprint.get('version')} connected")
elif octoprint.get("reachable"):
    print("running, OctoPrint rejects the API key (enter it on the touch screen)")
else:
    print("running, OctoPrint not reachable yet")
PY
}

start_services() {
  local i health
  if ! systemd_running; then
    warn "systemd is not running (container?): the services start at the next boot"
    AGENT_STATE='not started (no systemd)'
    return
  fi
  systemctl restart "$AGENT_UNIT"
  for i in $(seq 1 20); do
    health=$(agent_health || true)
    if [ -n "$health" ]; then
      AGENT_STATE=$health
      ok "agent $health"
      return
    fi
    [ "$i" = 1 ] && info "waiting for the agent"
    sleep 1
  done
  AGENT_STATE='not answering (see: journalctl -u floppyoctotouch-agent)'
  warn "the agent does not answer: journalctl -u $AGENT_UNIT -b"
}

start_kiosk() {
  if systemd_running; then
    systemctl restart "$KIOSK_UNIT"
    ok "kiosk started on the screen"
  fi
}

summary() {
  local ip=''
  ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  step "FloppyOctoTouch $VERSION installed"
  local key=${API_KEY:-$SAVED_KEY}
  info "user:           $FOT_USER"
  if [ -n "$key" ]; then
    info "API key:        …${key: -4}"
  else
    info "API key:        none yet (the touch screen asks for it)"
  fi
  info "agent:          ${AGENT_STATE:-installed} (http://127.0.0.1:8765)"
  info "configuration:  $CONFIG_FILE"
  info "kiosk options:  $FOT_KIOSK_ENV"
  [ -z "$CANCEL_PLUGIN_STATE" ] || info "Cancel Objects: $CANCEL_PLUGIN_STATE"
  info "OctoPrint:      $OCTOPRINT_URL${ip:+ (from a PC: http://$ip/)}"
  info "logs:           journalctl -u $AGENT_UNIT -u $KIOSK_UNIT -b"
  info "update:         git pull in the clone, then ./deploy/install.sh (or floppyoctotouch-update X.tar.gz)"
  info "uninstall:      floppyoctotouch-uninstall"
}

# Run from a git clone: the web app is not built there, but release/ holds the latest release tarball.
# Verify it, extract it to a temporary folder and run the installer inside it with the same options.
run_bundled_release() {
  local tarball='' candidate tmp status=0
  [ ! -f "$SRC_DIR/VERSION" ] && [ ! -f "$SRC_DIR/frontend/dist/index.html" ] || return 0
  for candidate in "$SRC_DIR"/release/floppyoctotouch-*.tar.gz; do
    [ -f "$candidate" ] && tarball=$candidate
  done
  [ -n "$tarball" ] || return 0
  step "Using the bundled release $(basename "$tarball")"
  if [ -f "$tarball.sha256" ]; then
    (cd "$(dirname "$tarball")" && sha256sum --check --status "$(basename "$tarball").sha256") ||
      die "checksum mismatch: $tarball is damaged (git pull again)"
    ok "checksum verified"
  else
    warn "no checksum file next to $tarball: not verified"
  fi
  tmp=$(mktemp -d)
  tar -xzf "$tarball" -C "$tmp"
  bash "$tmp/$(basename "$tarball" .tar.gz)/deploy/install.sh" "$@" || status=$?
  rm -rf -- "$tmp"
  exit "$status"
}

main() {
  parse_args "$@"
  ensure_root "$SCRIPT_DIR/install.sh" "$@"
  require_tty
  run_bundled_release "$@"
  load_state
  CMDLINE_TOKEN_ADDED=${FOT_CMDLINE_TOKEN:-}
  CANCEL_PLUGIN_INSTALLED=${FOT_CANCEL_PLUGIN:-0}
  [ "$UPDATE" = 1 ] && [ "${FOT_LISTEN_LAN:-0}" = 1 ] && LISTEN_LAN=1
  find_payload

  step "Checking the system (FloppyOctoTouch $VERSION)"
  check_system
  read_octoprint_unit
  find_octoprint_python
  choose_user
  check_octoprint

  # Every question is asked here, before apt and pip (which take minutes).
  if [ "$UPDATE" = 0 ]; then
    step "Setup"
  fi
  read_saved_key
  choose_api_key
  if [ "$LISTEN_LAN" = 1 ] && [ "$UPDATE" = 0 ]; then
    warn "--listen-lan: the agent adds the API key to every request, anyone on the network controls the printer"
    ask_yes_no "Listen on the network anyway?" n || LISTEN_LAN=0
  fi
  plan_cancel_plugin
  detect_display_output
  plan_display
  plan_reboot
  if [ "$UPDATE" = 0 ] && [ "$NON_INTERACTIVE" = 0 ]; then
    info "No more questions: the installer works on its own now (a few minutes)."
  fi

  step "Installing packages"
  install_packages

  step "Installing FloppyOctoTouch into $FOT_PREFIX"
  install_files
  install_venv

  step "Configuring the agent"
  write_config

  step "Installing services, kiosk and USB automount"
  install_system_files

  if [ "$CANCEL_PLUGIN_WANTED" = 1 ]; then
    step "Cancel Objects plugin"
    install_cancel_plugin
  fi

  if [ "$DISPLAY_WANTED" = 1 ]; then
    step "Display settings"
    configure_display
  fi
  write_state

  step "Starting"
  start_services
  summary
  finish
}

# Reboot with a countdown when it was asked for at the start; otherwise (or when cancelled) start the kiosk.
finish() {
  if [ "$REBOOT_WANTED" = 1 ]; then
    if countdown 10 "Rebooting"; then
      if systemd_running; then
        info "rebooting"
        systemctl reboot
        return
      fi
      warn "systemd is not running (container?): not rebooting"
      return
    fi
    info "reboot cancelled: starting the dashboard now"
  fi
  if [ "$BOOT_CHANGED" = 1 ]; then
    info "reboot later to apply the display settings: sudo reboot"
  fi
  start_kiosk
}

main "$@"
