#!/usr/bin/env bash
# Run by cage (floppyoctotouch-kiosk.service): waits for the agent, then shows the dashboard in Chromium.
# Options come from /etc/floppyoctotouch/kiosk.env (FOT_KIOSK_URL, FOT_CHROMIUM_FLAGS).
set -u

url=${FOT_KIOSK_URL:-http://127.0.0.1:8765/?kiosk=1}
health_url=${FOT_AGENT_HEALTH_URL:-http://127.0.0.1:8765/local/health}

log() { printf 'floppyoctotouch-kiosk: %s\n' "$*" >&2; }

# The agent starts in a few seconds; until then the screen stays black (no browser error page).
tries=0
until curl -fsS -o /dev/null --max-time 2 "$health_url" 2>/dev/null; do
  if [ $((tries % 30)) -eq 0 ]; then
    log "waiting for the agent at $health_url"
  fi
  tries=$((tries + 1))
  sleep 1
done

browser=''
for candidate in chromium chromium-browser; do
  if command -v "$candidate" >/dev/null 2>&1; then
    browser=$candidate
    break
  fi
done
if [ -z "$browser" ]; then
  log "Chromium is not installed (package chromium or chromium-browser)"
  exit 1
fi

# A fresh profile at every start: no "restore session" bubble after a power cut, nothing written to the
# SD card (XDG_RUNTIME_DIR is a tmpfs). The dashboard settings live in the agent, not in the browser.
profile="${XDG_RUNTIME_DIR:-/tmp}/floppyoctotouch-chromium"
rm -rf -- "$profile"
mkdir -p -- "$profile"
chmod 700 -- "$profile"

# shellcheck disable=SC2054  # the comma in --disable-features is part of the value
flags=(
  --kiosk
  --noerrdialogs
  --disable-infobars
  --no-first-run
  --no-default-browser-check
  --disable-session-crashed-bubble
  --disable-translate
  --disable-features=Translate,TranslateUI
  --disable-pinch
  --overscroll-history-navigation=0
  --ozone-platform=wayland
  --password-store=basic
  --check-for-update-interval=31536000
  --disk-cache-size=33554432
  "--user-data-dir=$profile"
)
# Extra flags (e.g. GPU options), split on spaces on purpose.
# shellcheck disable=SC2206
extra=(${FOT_CHROMIUM_FLAGS:-})

log "starting $browser on $url"
exec "$browser" "${flags[@]}" "${extra[@]}" "$url"
