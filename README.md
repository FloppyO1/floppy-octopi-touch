# FloppyOctoTouch

A touch-first dashboard for [OctoPrint](https://octoprint.org/), designed for a Raspberry Pi 4 running
OctoPi with a 7" 1024×600 HDMI touch screen, shown full screen in a Chromium kiosk.

> **Status: early development (v0.6.0).** Development environment, local agent, data layer, design system, app
> shell, the Home screen (print control, live tuning, webcam, screensaver, print notices), the Files screen
> (local storage, SD card, USB stick, slicer thumbnails) and the Temperature, Move and Filament screens are in
> place; Terminal, Leveling and the full System screen are placeholders. The screens are being built session by
> session, see [`docs/PLAN.md`](docs/PLAN.md) (Italian) and [`CHANGELOG.md`](CHANGELOG.md).

![Home screen at 1024×600 while printing](docs/images/home-v0.4.0.png)

![Files screen with slicer thumbnails](docs/images/files-v0.5.0.png)

![Temperature screen with the live chart](docs/images/temperature-v0.6.0.png)

## Features

Available now:

- Home screen with ring gauges (hotend, bed, fan, job, layer with DisplayLayerProgress), progress, times and ETA,
  pause/resume/stop with confirmation, live speed (M220), flow (M221) and fan (M106/M107) sliders, the file
  thumbnail or the webcam; when idle, the recent files ready to print, preheat presets, cooldown and homing.
- Files: OctoPrint local storage with folders, sorting, grid/list views and search with the on-screen keyboard;
  file details (time, filament, dimensions) with print/select/delete; the printer SD card; a USB stick plugged
  into the Pi, whose G-code files are imported into OctoPrint with a progress bar, then ejected safely.
- Slicer thumbnails (PrusaSlicer/OrcaSlicer PNG, JPG and QOI) extracted by the agent, no OctoPrint plugin needed
  (the Slicer Thumbnails plugin is used when installed).
- Screensaver with a large progress/clock view (optionally with the file thumbnail) and optional HDMI power-off
  when idle (never while printing); the touch that wakes the screen never presses a button.
- Temperatures: NumPad targets, per-heater and global off, a live chart (5/15/30 min) and preheat presets you
  can add, edit, reorder and reset.
- Movement: X/Y/Z jog with 0.1/1/10/50 mm steps kept inside the printer profile's build volume, homing, motors
  off, head position, jog speeds.
- Filament: load/unload wizard (heat, insert, load, purge) using M701/M702 or configurable G-code sequences for
  direct or bowden extruders, M600 filament change, manual extrude/retract with cold extrusion protection.
- Big end-of-print / failure / pause notices, with the `M300` beep through the printer's buzzer.
- Marlin host prompts (`M876`) shown as touch dialogs.
- English and Italian, fully offline (no CDN, works without Wi-Fi).

Planned:

- G-code terminal with an on-screen keyboard, macros, manual bed leveling and mesh view.
- System screen and settings, PSU/light control, installer for OctoPi.

## How it works

```
Chromium (kiosk) ──► agent 127.0.0.1:8765 ──► OctoPrint 127.0.0.1:5000
                      • serves the web app
                      • proxies /api, /sockjs, /plugin, /downloads and adds the API key
                      • proxies /webcam/* to camera-streamer (127.0.0.1:8080), like OctoPi's haproxy
                      • local endpoints: /local/health, /local/settings, /local/display (HDMI on/off),
                        /local/thumbnail (G-code thumbnails), /local/usb (USB stick), /local/events, …
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

`dev/fake-usb/` is the fake USB stick (`/media/usb0` in the agent, read-only): drop `.gcode` files there and tap
refresh on the USB tab. The agent notices a stick appearing or disappearing within 2 s. There is no udev/systemd
in Docker, so "Eject" only hides the stick until its content changes (`FOT_USB_EJECT_COMMAND=none`). The agent
reads OctoPrint's uploads (volume mounted read-only) to extract thumbnails, as it does on the Pi.

Agent settings added for files (in `config.json` or as `FOT_*` environment variables):

| Setting | Default | What |
|---|---|---|
| `uploads_dir` (`FOT_UPLOADS_DIR`) | `~/.octoprint/uploads` | OctoPrint's local storage, read for thumbnails (download through OctoPrint if not readable) |
| `usb_roots` (`FOT_USB_ROOTS`) | `/media/usb*` | glob patterns of the USB stick mount points |
| `usb_eject_command` (`FOT_USB_EJECT_COMMAND`) | `systemd-mount --umount {path}` | command that unmounts a stick; `none` only hides it |
| `usb_max_file_mb` (`FOT_USB_MAX_FILE_MB`) | `1024` | largest file accepted for import |

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
| `docker compose -f dev/docker-compose.yml run --rm playwright` | smoke test (data layer, every screen, NumPad and confirmations, host prompt, printer overlay, Files (folders, sort, search, detail, delete, SD card, USB import/eject), Temperature (targets, presets CRUD), Move (jog limits), Filament (setup, load/unload wizard, manual extrusion), a real print from the Home with fan/speed sliders, pause/resume, webcam and the end-of-print notice, screensaver and screen off, kiosk mode, language) + 1024×600 screenshots into `dev/screenshots/` |
| `docker compose -f dev/docker-compose.yml run --rm playwright sh -c "npm install && node accents.mjs"` | screenshots of Home, NumPad and gallery for each accent colour |
| `docker compose -f dev/docker-compose.yml run --rm shellcheck` | lint every shell script |

Sample G-code files with PrusaSlicer (PNG, QOI) and OrcaSlicer thumbnails live in `dev/sample-gcode/` and are
generated by `dev/tools/make_sample_gcode.py`; `3dbenchy_prusaslicer.gcode` is a real PrusaSlicer 2.9 export for
the Tatara A8 profile (240 layers, about 45 min, 300×300 PNG thumbnail), handy for long jobs and real file info.
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
