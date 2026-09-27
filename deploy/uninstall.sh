#!/usr/bin/env bash
# Removes FloppyOctoTouch: services, kiosk, USB automount, sudo rule, /opt/floppyoctotouch, and the display
# lines it added to config.txt / cmdline.txt. Gives tty1 back to the login prompt.
# Installed as /usr/local/bin/floppyoctotouch-uninstall.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)
# shellcheck source=SCRIPTDIR/lib/common.sh
. "$SCRIPT_DIR/lib/common.sh"

usage() {
  cat <<EOF
Usage: $0 [options]

Runs itself through sudo when needed.

Options:
  --non-interactive       never ask: remove everything except the configuration (unless --purge)
  --purge                 also delete the configuration (~/.config/floppyoctotouch: API key, settings)
  --keep-display-config   leave the display lines in config.txt / cmdline.txt
  -h, --help              show this help

The packages installed for the kiosk (cage, chromium, wlr-randr, ...) are left installed.
EOF
}

PURGE=0
KEEP_DISPLAY=0

parse_args() {
  local arg
  for arg in "$@"; do
    case $arg in
      --non-interactive) NON_INTERACTIVE=1 ;;
      --purge) PURGE=1 ;;
      --keep-display-config) KEEP_DISPLAY=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *) die "unknown option: $arg (see --help)" ;;
    esac
  done
}

remove_services() {
  local unit
  for unit in "$KIOSK_UNIT" "$AGENT_UNIT"; do
    systemctl_live stop "$unit" 2>/dev/null || true
    systemctl disable -q "$unit" 2>/dev/null || true
    rm -f "$UNIT_DIR/$unit"
  done
  systemctl_live daemon-reload
  systemctl enable -q getty@tty1.service 2>/dev/null || warn "could not re-enable getty@tty1"
  systemctl_live start getty@tty1.service 2>/dev/null || true
  ok "services removed, login prompt back on tty1"
}

remove_system_files() {
  rm -f "$UDEV_RULE" "$SUDOERS_FILE" "$PAM_FILE"
  if systemd_running && command -v udevadm >/dev/null; then
    udevadm control --reload || true
  fi
  rm -f "$BIN_DIR/floppyoctotouch-update" "$BIN_DIR/floppyoctotouch-uninstall"
  ok "USB automount, sudo rule and PAM session removed"
}

DISPLAY_CHANGED=0

restore_display() {
  local dir config cmdline token=${FOT_CMDLINE_TOKEN:-} has_block=0 has_token=0
  [ "$KEEP_DISPLAY" = 0 ] || return 0
  dir=$(boot_dir) || return 0
  config=$dir/config.txt
  cmdline=$dir/cmdline.txt
  grep -qxF "$DISPLAY_BEGIN" "$config" && has_block=1
  if [ -n "$token" ] && [ -f "$cmdline" ] && grep -qwF -- "$token" "$cmdline"; then
    has_token=1
  fi
  [ "$has_block" = 1 ] || [ "$has_token" = 1 ] || return 0
  if ! ask_yes_no "Remove the display settings added to $config${token:+ and $cmdline}?" y; then
    info "display settings kept"
    return 0
  fi
  if [ "$has_block" = 1 ]; then
    backup_file "$config"
    remove_display_block "$config"
    ok "display block removed from $config"
  fi
  if [ "$has_token" = 1 ]; then
    backup_file "$cmdline"
    remove_cmdline_token "$cmdline" "$token"
    ok "'$token' removed from $cmdline"
  fi
  DISPLAY_CHANGED=1
}

# The Cancel Objects plugin goes only if install.sh added it and the user says so (it may be used by
# OctoPrint's own UI). Before remove_config: the API key is read from the configuration.
remove_cancel_plugin() {
  local home key='' status result
  [ "${FOT_CANCEL_PLUGIN:-0}" = 1 ] || return 0
  [ -n "$(cancel_plugin_version "${FOT_OCTOPRINT_PYTHON:-}")" ] || return 0
  if [ "$NON_INTERACTIVE" = 1 ] ||
    ! ask_yes_no "Also remove the Cancel Objects OctoPrint plugin that the installer added?" n; then
    info "Cancel Objects plugin kept (OctoPrint > Plugin Manager removes it)"
    return 0
  fi
  home=$(user_home "${FOT_USER_SAVED:-}")
  if [ -n "$home" ] && [ -f "$home/.config/floppyoctotouch/config.json" ]; then
    key=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1])).get("api_key", ""))' \
      "$home/.config/floppyoctotouch/config.json" 2>/dev/null || true)
  fi
  status=$(octoprint_api POST "${FOT_OCTOPRINT_URL:-http://127.0.0.1:5000}/api/plugin/pluginmanager" "$key" \
    '{"command": "uninstall", "plugin": "cancelobject"}' | head -n1)
  if [ "$status" != 200 ]; then
    warn "OctoPrint did not remove the plugin (HTTP $status): use OctoPrint > Plugin Manager"
    return 0
  fi
  ok "Cancel Objects plugin removed"
  result=0
  restart_octoprint "${FOT_OCTOPRINT_URL:-http://127.0.0.1:5000}" "$key" || result=$?
  case $result in
    0) ok "OctoPrint restarted" ;;
    2) warn "OctoPrint is printing: restart it after the print (sudo systemctl restart octoprint)" ;;
    *) info "restart OctoPrint to finish: sudo systemctl restart octoprint" ;;
  esac
}

remove_config() {
  local home config_dir
  [ -n "${FOT_USER_SAVED:-}" ] || return 0
  home=$(user_home "$FOT_USER_SAVED")
  [ -n "$home" ] || return 0
  config_dir=$home/.config/floppyoctotouch
  [ -d "$config_dir" ] || return 0
  if [ "$PURGE" = 1 ] || { [ "$NON_INTERACTIVE" = 0 ] &&
    ask_yes_no "Also delete the configuration in $config_dir (API key, dashboard settings)?" n; }; then
    rm -rf -- "$config_dir"
    ok "configuration deleted"
  else
    info "configuration kept in $config_dir (reused by a new installation)"
  fi
}

main() {
  parse_args "$@"
  ensure_root "$(readlink -f "${BASH_SOURCE[0]}")" "$@"
  require_tty
  if [ ! -f "$FOT_STATE" ] && [ ! -d "$FOT_PREFIX" ] && [ ! -f "$UNIT_DIR/$AGENT_UNIT" ]; then
    info "FloppyOctoTouch is not installed"
    exit 0
  fi
  load_state

  step "Uninstalling FloppyOctoTouch ${FOT_VERSION:-}"
  info "This removes the dashboard services, the kiosk on tty1, the USB automount and $FOT_PREFIX."
  if [ "$NON_INTERACTIVE" = 0 ]; then
    ask_yes_no "Continue?" n || die "aborted"
  fi

  remove_services
  remove_system_files
  restore_display
  remove_cancel_plugin
  remove_config
  rm -rf -- "$FOT_PREFIX" "$FOT_ETC"
  ok "$FOT_PREFIX removed"

  step "Done"
  info "Packages installed for the kiosk are still there; to remove them:"
  info "  sudo apt remove cage chromium wlr-randr   (chromium-browser on older images)"
  if [ "$DISPLAY_CHANGED" = 1 ]; then
    info "Reboot to apply the display change: sudo reboot"
  fi
}

main "$@"
