#!/usr/bin/env bash
# Date, time and time zone of the Pi for FloppyOctoTouch (System → Settings → Date and time).
#
#   time-set.sh timezone <Area/City>                 a zone from `timedatectl list-timezones`
#   time-set.sh ntp on|off                           network time (systemd-timesyncd)
#   time-set.sh set "YYYY-MM-DD HH:MM[:SS]"          manual local time, only with network time off
#
# Run by the agent through sudo (one sudoers rule for this script): every argument is checked
# here again, timedatectl never gets anything else. The Pi has no RTC: after a manual time the
# clock is also saved for fake-hwclock (when installed), which sets it again at the next boot.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

TIMEDATECTL=${FOT_TIMEDATECTL:-timedatectl}

log() {
  logger -t floppyoctotouch-time -- "$*" 2>/dev/null || true
  printf 'floppyoctotouch-time: %s\n' "$*" >&2
}

fail() {
  log "$*"
  exit 1
}

set_timezone() {
  local zone=$1
  [[ $zone =~ ^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+){0,2}$ ]] || fail "refusing time zone '$zone': unexpected name"
  "$TIMEDATECTL" list-timezones | grep -Fxq -- "$zone" || fail "unknown time zone '$zone'"
  "$TIMEDATECTL" set-timezone "$zone"
  log "time zone set to $zone"
}

set_ntp() {
  case $1 in
    on) "$TIMEDATECTL" set-ntp true ;;
    off) "$TIMEDATECTL" set-ntp false ;;
    *) fail "usage: $0 ntp on|off" ;;
  esac
  log "network time $1"
}

set_time() {
  local value=$1
  [[ $value =~ ^20[2-9][0-9]-[01][0-9]-[0-3][0-9]\ [0-2][0-9]:[0-5][0-9](:[0-5][0-9])?$ ]] ||
    fail "refusing time '$value': expected YYYY-MM-DD HH:MM[:SS]"
  date -d "$value" >/dev/null 2>&1 || fail "refusing time '$value': not a valid date"
  if [ "$("$TIMEDATECTL" show -p NTP --value)" = yes ]; then
    fail "network time is on: switch it off before setting the time"
  fi
  "$TIMEDATECTL" set-time "$value"
  if command -v fake-hwclock >/dev/null 2>&1; then
    fake-hwclock save || log "fake-hwclock could not save the clock"
  fi
  log "clock set to $value (local time)"
}

case ${1:-} in
  timezone)
    [ $# -eq 2 ] || fail "usage: $0 timezone <Area/City>"
    set_timezone "$2"
    ;;
  ntp)
    [ $# -eq 2 ] || fail "usage: $0 ntp on|off"
    set_ntp "$2"
    ;;
  set)
    [ $# -eq 2 ] || fail "usage: $0 set \"YYYY-MM-DD HH:MM[:SS]\""
    set_time "$2"
    ;;
  *)
    fail "usage: $0 timezone|ntp|set ..."
    ;;
esac
