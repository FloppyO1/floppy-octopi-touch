#!/bin/sh
# One-shot initialisation of the development OctoPrint volume.
# Runs in the octoprint/octoprint image before the server starts (docker compose "octoprint-init").
set -eu

BASE=/octoprint/octoprint
USERNAME="${OCTOPRINT_DEV_USER:-admin}"
PASSWORD="${OCTOPRINT_DEV_PASSWORD:-admin}"
API_KEY="${OCTOPRINT_API_KEY:-}"
APP_ID="FloppyOctoTouch (dev)"

mkdir -p "$BASE/uploads" "$BASE/data/appkeys" "$BASE/virtualSd"

MARKER="$BASE/.floppyoctotouch-seeded"
if [ ! -f "$MARKER" ]; then
  # The image already ships a config.yaml: deep-merge the seed into it (once).
  CONFIG="$BASE/config.yaml" python - <<'EOF'
import os

import yaml


def merge(base, extra):
    for key, value in extra.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge(base[key], value)
        else:
            base[key] = value
    return base


path = os.environ["CONFIG"]
config = {}
if os.path.exists(path):
    with open(path, encoding="utf-8") as fh:
        config = yaml.safe_load(fh) or {}
with open("/seed/config.yaml", encoding="utf-8") as fh:
    merge(config, yaml.safe_load(fh))
with open(path, "w", encoding="utf-8") as fh:
    yaml.safe_dump(config, fh, sort_keys=True)
EOF
  touch "$MARKER"
  echo "init: merged seed into config.yaml"
fi

for f in /samples/*.gcode; do
  [ -e "$f" ] || continue
  name=$(basename "$f")
  if [ ! -e "$BASE/uploads/$name" ]; then
    cp "$f" "$BASE/uploads/$name"
    echo "init: added sample $name"
  fi
done

# A sub-folder, so the file browser has a tree to navigate.
mkdir -p "$BASE/uploads/examples"
if [ -e /samples/coaster_prusaslicer-qoi.gcode ] && [ ! -e "$BASE/uploads/examples/coaster-copy.gcode" ]; then
  cp /samples/coaster_prusaslicer-qoi.gcode "$BASE/uploads/examples/coaster-copy.gcode"
  echo "init: added examples/coaster-copy.gcode"
fi

# One file on the Virtual Printer's SD card. Not an 8.3 name: the Virtual Printer drops files whose
# name is already a DOS name (its short/long name map overwrites them).
if [ -e /samples/calibration-cube_prusaslicer.gcode ] && [ ! -e "$BASE/virtualSd/sd-cube.gcode" ]; then
  cp /samples/calibration-cube_prusaslicer.gcode "$BASE/virtualSd/sd-cube.gcode"
  echo "init: added sd-cube.gcode to the virtual SD card"
fi

if ! octoprint --basedir "$BASE" user list 2>/dev/null | grep -q "$USERNAME"; then
  octoprint --basedir "$BASE" user add --password "$PASSWORD" --admin "$USERNAME"
  echo "init: created admin user '$USERNAME'"
fi

if [ -n "$API_KEY" ]; then
  # Register the key from dev/.env as an application key of the dev user (App Keys plugin storage).
  KEYS_FILE="$BASE/data/appkeys/keys.yaml" USERNAME="$USERNAME" API_KEY="$API_KEY" APP_ID="$APP_ID" \
    python - <<'EOF'
import os

import yaml

path, user = os.environ["KEYS_FILE"], os.environ["USERNAME"]
app_id, api_key = os.environ["APP_ID"], os.environ["API_KEY"]
data = {}
if os.path.exists(path):
    with open(path, encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
keys = [k for k in data.get(user, []) if k.get("app_id") != app_id]
keys.append({"app_id": app_id, "api_key": api_key})
data[user] = keys
with open(path, "w", encoding="utf-8") as fh:
    yaml.safe_dump(data, fh)
print(f"init: API key registered for '{user}' as '{app_id}'")
EOF
else
  echo "init: OCTOPRINT_API_KEY is empty, no API key registered"
fi
