# FloppyOctoTouch

A touch-first dashboard for [OctoPrint](https://octoprint.org/), designed for a Raspberry Pi 4 running
OctoPi with a 7" 1024×600 HDMI touch screen, shown full screen in a Chromium kiosk.

> **Status: early development (v0.4.0).** Development environment, local agent, data layer, design system, app
> shell and the Home screen (print control, live tuning, webcam, screensaver, print notices) are in place; the
> other screens are placeholders. The screens are being built session by session, see
> [`docs/PLAN.md`](docs/PLAN.md) (Italian) and [`CHANGELOG.md`](CHANGELOG.md).

![Home screen at 1024×600 while printing](docs/images/home-v0.4.0.png)

## Features

Available now:

- Home screen with ring gauges (hotend, bed, fan, job, layer with DisplayLayerProgress), progress, times and ETA,
  pause/resume/stop with confirmation, live speed (M220), flow (M221) and fan (M106/M107) sliders, the file
  thumbnail or the webcam; when idle, the recent files ready to print, preheat presets, cooldown and homing.
- Screensaver with a large progress/clock view and optional HDMI power-off when idle (never while printing);
  the touch that wakes the screen never presses a button.
- Big end-of-print / failure / pause notices, with the `M300` beep through the printer's buzzer.
- Marlin host prompts (`M876`) shown as touch dialogs.
- English and Italian, fully offline (no CDN, works without Wi-Fi).

Planned:

- File browser for OctoPrint local storage, the printer SD card and a USB stick plugged into the Pi, with slicer thumbnails.
- Temperatures with presets and a live chart, movement/jog, filament load/unload wizard.
- G-code terminal with an on-screen keyboard, macros, manual bed leveling and mesh view.
- System screen and settings, PSU/light control, installer for OctoPi.

## How it works

```
Chromium (kiosk) ──► agent 127.0.0.1:8765 ──► OctoPrint 127.0.0.1:5000
                      • serves the web app
                      • proxies /api, /sockjs, /plugin, /downloads and adds the API key
                      • proxies /webcam/* to camera-streamer (127.0.0.1:8080), like OctoPi's haproxy
                      • local endpoints: /local/health, /local/settings, /local/display (HDMI on/off), …
```

The browser never sees the OctoPrint API key: the Python agent injects it. For this reason the agent listens on
`127.0.0.1` only. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

- **Frontend**: Svelte 5 + TypeScript + Vite (`frontend/`).
- **Agent**: Python 3.11 + aiohttp (`agent/`).

## Development

Everything runs in Docker: nothing (Node, Python, Playwright…) needs to be installed on the host.
Requirements: Docker with Compose v2 (Docker Desktop on Windows/macOS works).

```sh
# optional: copy and adjust ports / credentials
cp dev/.env.example dev/.env

docker compose -f dev/docker-compose.yml up -d
```

| URL | What |
|---|---|
| http://localhost:5173/preview.html | the dashboard inside a 1024×600 frame (Vite dev server, hot reload) |
| http://localhost:5173/ | the dashboard without frame |
| http://localhost:8765/ | the agent (serves `frontend/dist` once built, same as on the Pi) |
| http://localhost:5000/ | OctoPrint with the Virtual Printer (user `admin`, password `admin`) |

The development OctoPrint is prepared automatically on first start (`octoprint-init` service): seed config
(Virtual Printer with SD card, auto-connect, 220×220×240 printer profile), admin user, sample G-code files
(plus an `examples/` folder and one file on the virtual SD card).
To start from scratch: `docker compose -f dev/docker-compose.yml down -v`.

The `webcam` service is a fake camera: an MJPEG test pattern with a frame counter (ffmpeg `testsrc`) on port 8080,
like camera-streamer on OctoPi. OctoPrint's default stream URL `/webcam/?action=stream` reaches it through the
agent. Stop it (`docker compose -f dev/docker-compose.yml stop webcam`) to see the "no webcam" fallback. In Docker
the HDMI power endpoint (`/local/display`) only logs (`FOT_DISPLAY_BACKEND=none`).

Pages and URL options useful while developing:

| URL | What |
|---|---|
| `/#/home`, `/#/files`, … `/#/system` | a screen of the app (the hash keeps the current screen across reloads) |
| `/ui-gallery` | every design-system component with demo data (dev server only) |
| `/debug` | every data store: connection, printer state, job, temperatures, files, capabilities, plugins, prompts, settings, events, terminal (dev server only) |
| `?accent=teal\|amber\|indigo` | previews an accent colour (the saved one is chosen on the System screen) |
| `?kiosk=1` | kiosk hardening: hidden cursor, no context menu, no zoom, no text selection or dragging |

In the Vite dev server the stores are also available in the browser console as `window.__fot`.

The Virtual Printer can emit Marlin host actions to test prompts and notifications, e.g. send
`!!DEBUG:action_custom notification Hello` from the OctoPrint terminal (the `/debug` page has buttons for this).
Prompts are shown only when the firmware reports `Cap:PROMPT_SUPPORT` (or the override is on).

### OctoPrint API key

The agent authenticates to OctoPrint with an API key taken from `OCTOPRINT_API_KEY` in `dev/.env`.
In development you do not need to create it: `octoprint-init` registers that value as an application key of the
dev user at every start (a default value is used when `dev/.env` does not exist).

To use a key created by hand (as you will do on the Pi):

1. open OctoPrint at http://localhost:5000 and log in;
2. go to **Settings → Application Keys**, enter an application name (e.g. `FloppyOctoTouch`) and click **Generate**;
3. put the key in `dev/.env` as `OCTOPRINT_API_KEY=...` and restart: `docker compose -f dev/docker-compose.yml up -d`.

`http://localhost:8765/local/health` tells whether OctoPrint is reachable and the key is accepted.

### Recurring commands

All commands are run from the repository root.

| Command | What |
|---|---|
| `docker compose -f dev/docker-compose.yml up -d` | start OctoPrint, agent and Vite |
| `docker compose -f dev/docker-compose.yml logs -f agent` | follow the agent logs (same for `octoprint`, `frontend`) |
| `docker compose -f dev/docker-compose.yml down` | stop everything (`-v` also wipes OctoPrint data) |
| `docker compose -f dev/docker-compose.yml run --rm agent-test` | agent: ruff lint + format check + pytest |
| `docker compose -f dev/docker-compose.yml run --rm frontend-test` | frontend: svelte-check + tsc + vitest |
| `docker compose -f dev/docker-compose.yml run --rm build` | production build of the frontend into `frontend/dist` |
| `docker compose -f dev/docker-compose.yml run --rm playwright` | smoke test (data layer, every screen, NumPad and confirmations, host prompt, printer overlay, a real print from the Home with fan/speed sliders, pause/resume, webcam and the end-of-print notice, screensaver and screen off, kiosk mode, language) + 1024×600 screenshots into `dev/screenshots/` |
| `docker compose -f dev/docker-compose.yml run --rm playwright sh -c "npm install && node accents.mjs"` | screenshots of Home, NumPad and gallery for each accent colour |
| `docker compose -f dev/docker-compose.yml run --rm shellcheck` | lint every shell script |

Sample G-code files with PrusaSlicer (PNG, QOI) and OrcaSlicer thumbnails live in `dev/sample-gcode/` and are
generated by `dev/tools/make_sample_gcode.py`; `3dbenchy_prusaslicer.gcode` is a real PrusaSlicer 2.9 export for
the Tatara A8 profile (240 layers, about 1 h, no thumbnail), handy for long jobs and the "no thumbnail" case.
`dev/fake-usb/` is mounted into the agent as a fake USB stick.

## Installation on the Raspberry Pi

Not available yet: an `install.sh` for OctoPi 1.1.0 (Bookworm) is planned (kiosk with `cage` + Chromium,
systemd services, USB automount).

## Project layout

```
agent/      Python agent (aiohttp): static files, OctoPrint proxy, local endpoints
frontend/   Svelte 5 + TypeScript web app
deploy/     install/update/uninstall scripts, systemd units, kiosk launcher (to come)
dev/        Docker Compose environment, OctoPrint seed, Playwright scripts, sample G-code
docs/       plan (Italian) and architecture notes
scripts/    release tooling (to come)
```

## License

[MIT](LICENSE) © 2026 Filippo Castellan
