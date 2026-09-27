#!/usr/bin/env bash
# Run by cage (floppyoctotouch-kiosk.service): waits for the agent, then shows the dashboard in Chromium.
# Options come from /etc/floppyoctotouch/kiosk.env (FOT_KIOSK_URL, FOT_CHROMIUM_FLAGS).
set -u

url=${FOT_KIOSK_URL:-http://127.0.0.1:8765/?kiosk=1}
health_url=${FOT_AGENT_HEALTH_URL:-http://127.0.0.1:8765/local/health}

log() { printf 'floppyoctotouch-kiosk: %s\n' "$*" >&2; }

# The 7" screen only advertises 16:9 modes up to 1920x1080 (its scaler shrinks them), not its own 1024x600,
# and cage picks the preferred one: ask cage for 1024x600. FOT_DISPLAY_MODE=preferred keeps the screen's mode.
display_mode=${FOT_DISPLAY_MODE:-1024x600@60Hz}
if [ "$display_mode" != preferred ]; then
  output=${FOT_DISPLAY_OUTPUT:-$(wlr-randr 2>/dev/null | awk '/^[^ ]/ { print $1; exit }')}
  if [ -z "$output" ]; then
    log "no output found by wlr-randr: keeping the screen's mode"
  elif wlr-randr --output "$output" --custom-mode "$display_mode"; then
    log "$output set to $display_mode"
  else
    log "cannot set $output to $display_mode (see FOT_DISPLAY_MODE in /etc/floppyoctotouch/kiosk.env)"
  fi
fi

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
