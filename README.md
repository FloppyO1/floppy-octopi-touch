# FloppyOctoTouch

A touch-first dashboard for [OctoPrint](https://octoprint.org/), designed for a Raspberry Pi 4 running
OctoPi with a 7" 1024×600 HDMI touch screen, shown full screen in a Chromium kiosk.

> **Status: early development (v0.9.0).** Development environment, local agent, data layer, design system, app
> shell and every screen are in place: Home (print control, live tuning, webcam, screensaver, print notices),
> Files (local storage, SD card, USB stick, slicer thumbnails), Temperature, Move, Filament, Terminal with
> macros, Leveling and System with the settings, and the installer for the Pi (not yet tested on real hardware:
> that is the next step). Everything is built session by session, see [`docs/PLAN.md`](docs/PLAN.md) (Italian) and [`CHANGELOG.md`](CHANGELOG.md).

![Home screen at 1024×600 while printing](docs/images/home-v0.4.0.png)

![Files screen with slicer thumbnails](docs/images/files-v0.5.0.png)

![Temperature screen with the live chart](docs/images/temperature-v0.6.0.png)

![Leveling screen with the bed mesh heatmap](docs/images/leveling-v0.7.0.png)

![System screen with the Raspberry Pi metrics](docs/images/system-v0.8.0.png)

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
  can add, edit, reorder and reset. A target changed while the print waits for its heat-up (`M109`/`M190`)
  applies at once when the firmware has `EMERGENCY_PARSER` (the wait is ended with `M108` and restarted).
- Movement: X/Y/Z jog with 0.1/1/10/50 mm steps kept inside the printer profile's build volume, homing, motors
  off, head position, jog speeds.
- Filament: load, unload and change wizard (heat, unload, swap, load, purge) using M701/M702 or configurable
  G-code sequences for direct or bowden extruders; cancelling turns the hotend off, an option turns it off at the
  end too. Firmware filament change (M600) during a print, manual extrude/retract with cold extrusion protection.
- Terminal: live serial log with filters (temperatures, `ok`, busy, SD status, position), pause and auto-scroll,
  commands typed on an in-app G-code keyboard, history and quick commands; macros as big buttons you can add,
  edit, reorder and reset, with optional confirmation.
- Leveling: paper test at the four corners and the centre (no probe needed), bed mesh heatmap from `M420 V`
  (Marlin bilinear and mesh bed leveling), guided manual mesh (`G29 S1/S2`) or automatic `G29` when the firmware
  has them, babystepping (`M290`, also while printing), probe Z offset (`M851`), save to EEPROM (`M500`).
- System: CPU (with temperature and frequency), RAM and disk rings, network (IP, Wi-Fi name and signal,
  gateway), OctoPrint restart, Pi reboot/shutdown and custom system commands with confirmation, screen restart.
- Power and lights: PSU Control switch (also in the status bar) and custom action buttons that send G-code, run
  an OctoPrint system command or call a plugin API, up to three of them in the status bar.
- Date and time of the Pi (System → Settings → Date & time): time zone picked by region and city (daylight
  saving time follows the zone), automatic time over the internet (NTP) on or off, a manual date and time for a
  Pi without internet, 12/24-hour clock. The whole system changes (OctoPrint, logs, the dashboard), through
  `timedatectl`; every time on the screen uses the Pi's zone at once. The Pi has no clock battery: a manual time
  is saved for `fake-hwclock`, but without internet it can still drift or go back after a restart.
- What happens after Stop: OctoPrint runs its "after print job is cancelled" G-code script at every Stop (also
  from its web page). System → Settings → Motion shows whether it turns the motors, the hot end(s), the bed and
  the part fan off, and **Fix** appends only the missing lines (`M104 T<n> S0`, `M140 S0`, `M106 S0`, `M84`) after
  a preview, leaving the rest of the script alone. When something is missing the dashboard asks once after
  connecting ("Don't ask again" is a setting). A key without the settings permission gets the manual steps.
- Settings on the screen: language, accent colour, end-of-print beep, screensaver and screen off,
  temperature thresholds and limits, jog speeds, paper test, extruder, firmware capability overrides, webcam
  URL, OctoPrint API key (checked by the agent, also from the "connecting" overlay), reset.
- Big end-of-print / failure / pause notices, with the `M300` beep through the printer's buzzer.
- Marlin host prompts (`M876`) shown as touch dialogs.
- Cancel single objects during a print (Home → Objects): a bed map with the objects' outlines and a list, a tap
  and a confirmation. It works through the [Cancel Objects](https://github.com/paukstelis/OctoPrint-Cancelobject)
  OctoPrint plugin (the installer offers it) or the firmware's `M486` (Marlin `CANCEL_OBJECTS`, switched on in
  System → Settings → Firmware). The slicer must label the objects: PrusaSlicer / OrcaSlicer "Label objects" =
  `OctoPrint comments` (`Firmware-specific` once the firmware has `M486`). Files uploaded before the plugin was
  installed must be uploaded again: the plugin prepares each file when it is uploaded.
- English and Italian, fully offline (no CDN, works without Wi-Fi).
- Laid out for the 1024×600 panel; on a screen of another size the whole app is scaled to fit.
- One-command installer for OctoPi (kiosk, services, USB automount), see below.

Planned: the complete test on the real hardware (version 1.0.0).

## How it works

```
Chromium (kiosk) ──► agent 127.0.0.1:8765 ──► OctoPrint 127.0.0.1:5000
                      • serves the web app
                      • proxies /api, /sockjs, /plugin, /downloads and adds the API key
                      • proxies /webcam/* to camera-streamer (127.0.0.1:8080), like OctoPi's haproxy
                      • local endpoints: /local/health, /local/settings, /local/system (CPU, RAM, disk,
                        network), /local/apikey, /local/kiosk/restart, /local/display (HDMI on/off),
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

Agent settings added for files and the System screen (in `config.json` or as `FOT_*` environment variables):

| Setting | Default | What |
|---|---|---|
| `uploads_dir` (`FOT_UPLOADS_DIR`) | `~/.octoprint/uploads` | OctoPrint's local storage, read for thumbnails (download through OctoPrint if not readable) |
| `usb_roots` (`FOT_USB_ROOTS`) | `/media/usb*` | glob patterns of the USB stick mount points |
| `usb_eject_command` (`FOT_USB_EJECT_COMMAND`) | `systemd-mount --umount {path}` | command that unmounts a stick; `none` only hides it |
| `usb_max_file_mb` (`FOT_USB_MAX_FILE_MB`) | `1024` | largest file accepted for import |
| `kiosk_restart_command` (`FOT_KIOSK_RESTART_COMMAND`) | `sudo -n systemctl restart floppyoctotouch-kiosk.service` | "Restart the screen" on the System screen; `none` only logs (the page reloads) |
| `kiosk_watchdog_s` (`FOT_KIOSK_WATCHDOG_S`) | `60` | seconds without the kiosk page (e.g. Chromium's renderer crashed) before the kiosk is restarted with `kiosk_restart_command`; `0` turns it off |
| `disk_path` (`FOT_DISK_PATH`) | `/` | file system shown as "disk" on the System screen |

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

The key can also be replaced from the dashboard (System → Settings → Connection, or the button on the
"connecting" overlay when OctoPrint rejects it): the agent checks it against OctoPrint, saves it in its
`config.json` (mode 600) and uses it at once. A key set through `FOT_API_KEY` (as in Docker) wins again at the
next start.

The development OctoPrint has harmless reboot/shutdown commands (`echo`) and a custom `Toggle lights (dev)`
system command, so the System screen shows them; the smoke test intercepts reboot/shutdown anyway.

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
| `docker compose -f dev/docker-compose.yml run --rm playwright` | smoke test (data layer, every screen, NumPad and confirmations, host prompt, printer overlay, Files (folders, sort, search, detail, delete, SD card, USB import/eject), Temperature (targets, presets CRUD), Move (jog limits), Temperature during a heat-up (M108), Filament (setup, load/unload/change wizard, cancel, cool down at the end, manual extrusion), Terminal (keyboard, filters, pause, history), macros CRUD, Leveling (paper test, mesh heatmap, manual mesh, babystep, probe offset), System (metrics, system commands, custom actions and status bar, every settings section, API key, reset, PSU Control), a real print from the Home with fan/speed sliders, pause/resume, webcam and the end-of-print notice, screensaver and screen off, kiosk mode, scaling on other screen sizes, language) + 1024×600 screenshots into `dev/screenshots/`; `-e ONLY=terminal,leveling` runs only those steps |
| `docker compose -f dev/docker-compose.yml run --rm playwright sh -c "npm install && node accents.mjs"` | screenshots of Home, NumPad and gallery for each accent colour |
| `docker compose -f dev/docker-compose.yml run --rm playwright sh -c "npm install && node targets.mjs"` | lists the touch targets under 56 px on every screen (`MIN_TARGET=` to change the size) |
| `docker compose -f dev/docker-compose.yml run --rm shellcheck` | lint every shell script |
| `docker compose -f dev/docker-compose.yml run --rm release` | build `release/floppyoctotouch-<version>.tar.gz` + `.sha256` (web app, agent wheel, `deploy/`); older tarballs are deleted |
| `docker compose -f dev/docker-compose.yml run --rm deploy-test` | installer test in Debian bookworm: install, checks, agent + kiosk launcher, USB helper, reinstall, update, uninstall, install from a clone, sudo self-elevation, interactive questions on a fake terminal |

Sample G-code files with PrusaSlicer (PNG, QOI) and OrcaSlicer thumbnails live in `dev/sample-gcode/` and are
generated by `dev/tools/make_sample_gcode.py`; `3dbenchy_prusaslicer.gcode` is a real PrusaSlicer 2.9 export for
the Tatara A8 profile (240 layers, about 45 min, 300×300 PNG thumbnail), handy for long jobs and real file info.
`dev/fake-usb/` is mounted into the agent as a fake USB stick.

`docs/github/release.yml` is a ready GitHub Action, not active yet: copied to `.github/workflows/`, it tests and
builds the release at every `v*` tag and attaches the tarball to a draft GitHub release.

## Installation on the Raspberry Pi

### Quick start

1. **What you need:** a Raspberry Pi 4 with **OctoPi 1.1.0** and OctoPrint already set up, and the 7" 1024×600
   screen connected (HDMI cable for the picture, USB cable for the touch).

2. **Create an API key in OctoPrint.** On a PC or phone, open OctoPrint in the browser (`http://octopi.local/`
   or the Pi's IP address) and log in. Click the **wrench icon** (Settings) at the top, then **Application Keys**.
   In **App identifier** type `FloppyOctoTouch`, click **Generate** and copy the key it shows.

3. **Run these commands on the Pi.** Open a terminal on the PC and connect over SSH (use the user and host name
   you chose in Raspberry Pi Imager if you changed them), then copy the lines as they are:

   ```sh
   ssh pi@octopi.local
   git clone https://github.com/FloppyO1/floppy-octopi-touch.git
   cd floppy-octopi-touch
   ./deploy/install.sh
   ```

   OctoPi already has `git`; if the command is missing, install it first with `sudo apt install -y git`.

4. **Answer the installer.** It asks everything at the start:
   - **the API key**: paste it (in most SSH terminals: right click or Ctrl+Shift+V) and press Enter. Nothing
     shows while you paste, that is normal. If OctoPrint refuses it, the installer asks again. Pressing Enter
     without a key is fine too: the touch screen asks for it later;
   - **"Install the Cancel Objects plugin?"** (it lets the dashboard remove single objects from a print) and
     **"Reboot automatically at the end?"** (not needed): press Enter.

   Then it works on its own for a few minutes (it downloads Chromium), shows a summary and starts the dashboard
   on the screen. If you asked for the reboot, it reboots after a 10-second countdown instead (Ctrl+C cancels it).

### Install without git

Copy the `floppy-octopi-touch` folder to the Pi (for example with `scp -r` or WinSCP) and run
`bash floppy-octopi-touch/deploy/install.sh`. Or copy only the release tarball and its checksum file from `release/`:

```sh
sha256sum -c floppyoctotouch-X.Y.Z.tar.gz.sha256
tar xzf floppyoctotouch-X.Y.Z.tar.gz
bash floppyoctotouch-X.Y.Z/deploy/install.sh
```

`bash …/install.sh` works even when the copy lost the executable bit (files copied from Windows or a zip).

### Installer options

The installer runs itself through `sudo` when needed and can be run again at any time: it repairs or
reconfigures the installation and keeps a saved API key that OctoPrint still accepts, without asking for it.

| Option | Effect |
|---|---|
| `--api-key=KEY` | use this key instead of asking (checked against OctoPrint; the installation stops if it is refused) |
| `--non-interactive` | never ask: detected or default answers (no automatic reboot) |
| `--user=NAME` | dashboard user instead of the one of `octoprint.service` |
| `--octoprint-url=URL` | OctoPrint address (default `http://127.0.0.1:<port>`) |
| `--display-config` | add the screen maker's lines to `config.txt` and `video=HDMI-A-1:1024x600@60` to `cmdline.txt` (with backups). Only useful with the legacy firmware display stack: with KMS (OctoPi's default) they change nothing, the kiosk sets the 1024×600 mode itself |
| `--skip-display-config` | do not touch `config.txt` / `cmdline.txt` (the default now; still accepted) |
| `--listen-lan` | agent on every interface instead of `127.0.0.1`. **Anyone on the network then controls the printer** (the agent adds the API key to every request) |
| `--no-cancel-plugin` | do not offer the Cancel Objects OctoPrint plugin (`--non-interactive` installs it otherwise) |

### Update and uninstall

```sh
cd floppy-octopi-touch && git pull && ./deploy/install.sh   # from the clone
floppyoctotouch-update floppyoctotouch-X.Y.Z.tar.gz         # from a tarball (+ its .sha256)
floppyoctotouch-uninstall                                   # --purge also deletes the configuration
```

Updates keep the API key, the dashboard settings and the kiosk options, and do not touch the display settings;
`floppyoctotouch-update` refuses a damaged tarball and asks before reinstalling the same version or going back
(`--force` skips the questions). Uninstalling removes the dashboard services and files, gives tty1 back to the
login prompt and removes the display lines added by `--display-config` (with a backup); the installed packages stay. Updates never
touch OctoPrint's plugins; uninstalling offers to remove the Cancel Objects plugin only if the installer added it
(`--non-interactive` keeps it).

### Troubleshooting

Logs: `journalctl -u floppyoctotouch-agent -u floppyoctotouch-kiosk -b` (add `-f` to follow them);
USB mounts: `journalctl -t floppyoctotouch-usb -b`. State: `systemctl status floppyoctotouch-kiosk`,
`curl http://127.0.0.1:8765/local/health`.

- **Black screen after boot.** The kiosk waits for the agent: check `systemctl status floppyoctotouch-agent`.
  If the agent runs, look at the kiosk log (cage needs the logind session on tty1: `loginctl` should list a
  session of the dashboard user on `seat0`/`tty1`). With a USB keyboard, **Ctrl+Alt+F2** opens another console.
- **Wrong resolution or no picture.** The kiosk sets the 1024×600 mode with `wlr-randr` at every start (the
  screen does not announce it, so with KMS `config.txt` and `cmdline.txt` cannot set it). Pick another mode in
  System → Settings → Screen (it goes back by itself after 15 s unless confirmed), or force one with
  `FOT_DISPLAY_MODE` in `/etc/floppyoctotouch/kiosk.env`. `ls /sys/class/drm` shows the connector name
  (`card?-HDMI-A-1` or `-HDMI-A-2` for the second port).
- **Chromium's "Something went wrong" page after hours on, or the installer warns about a 32-bit kernel.**
  OctoPi runs a 32-bit kernel (`arm_64bit=0` in `/boot/firmware/config.txt`, `uname -m` says `armv7l`): on a
  Pi 4 with more than 3 GB it keeps only ~768 MB for itself and can kill Chromium with gigabytes free (the
  dashboard restarts the kiosk by itself after a minute). The 64-bit kernel avoids it and the programs stay as
  they are: check that `/boot/firmware/kernel8.img` and a `/lib/modules/*-v8` folder exist, change the line to
  `arm_64bit=1`, `sudo reboot`; `uname -m` then says `aarch64` (set `arm_64bit=0` again to go back).
  `journalctl -k | grep -i oom` shows whether the OOM killer was the cause.
- **Touch does not respond.** The touch panel is a USB device: plug its cable in (the kiosk also starts without
  it) and restart the kiosk, `sudo systemctl restart floppyoctotouch-kiosk`. `ls /dev/input/by-id` should list
  it; the user must be in the `input` group (`id <user>`; rerun the installer to fix it).
- **"Connecting to OctoPrint…" / API key rejected.** Enter a new key from the overlay or System → Settings →
  Connection (the agent checks it and saves it), or run `./deploy/install.sh --api-key=KEY` again. Check that
  OctoPrint runs: `systemctl status octoprint`.
- **USB stick not shown.** It must be FAT32, exFAT, NTFS or ext4 and not on the boot disk; see the
  `floppyoctotouch-usb` log and `findmnt /media/usb-*`. exFAT needs a kernel that supports it (Bookworm does).
- **Wrong time or date.** `timedatectl` shows the zone, whether NTP is on and synchronised; changes made from
  the dashboard are logged with `journalctl -t floppyoctotouch-time -b`. Without internet switch the automatic
  time off in System → Settings → Date & time and set the clock by hand ("read only" there means the sudo rule
  is missing: run the update again).
- **Motors, heaters or fan stay on after Stop.** Check System → Settings → Motion → After Stop; the script is in
  OctoPrint → Settings → GCODE Scripts → "After print job is cancelled".
- **Screen off does not come back / wlr-randr errors.** The agent talks to the cage session through
  `WAYLAND_DISPLAY=wayland-0` in `/run/user/<uid>`; the screen-off option can be disabled in System → Settings.

### What the installer does

1. checks the system (Bookworm, arm64/armhf) and that OctoPrint answers on `127.0.0.1` (port taken from
   `octoprint.service`); the dashboard runs as the user of `octoprint.service` (normally `pi`);
2. asks its questions (API key, checked on `/api/version`; Cancel Objects plugin; reboot) and warns about a
   32-bit kernel on a Pi with more than 3 GB of RAM;
3. installs `cage`, `chromium` (or `chromium-browser`), `python3-venv`, `wlr-randr`, `fonts-dejavu-core`, `curl`;
4. copies the app to `/opt/floppyoctotouch` and creates the agent's virtual environment there;
5. writes `~/.config/floppyoctotouch/config.json` with mode 600;
6. installs the systemd units `floppyoctotouch-agent` and `floppyoctotouch-kiosk` (cage + Chromium on tty1,
   restarted if they stop) and disables the login prompt on tty1;
7. installs a udev rule that mounts USB sticks **read-only** on `/media/usb-<label>` (FAT32, exFAT, NTFS, ext4),
   a sudo rule limited to "eject a stick", "restart the kiosk" and the date/time wrapper
   (`deploy/time/time-set.sh`, which checks its arguments before calling `timedatectl`), and adds the user to
   `video`, `render`, `input`;
8. if accepted, installs the Cancel Objects plugin (a fixed, tested version) through OctoPrint's Plugin Manager API,
   like its own button, and restarts OctoPrint unless it is printing;
9. only with `--display-config`: adds the screen maker's lines to `config.txt` and `video=HDMI-A-1:1024x600@60` to
   `cmdline.txt` (in `/boot/firmware`, with backups);
10. starts the agent, prints a summary and reboots (or starts the kiosk).

| Path | What |
|---|---|
| `~/.config/floppyoctotouch/config.json` | agent configuration: API key, OctoPrint URL, webcam URL, USB and display options (mode 600) |
| `~/.config/floppyoctotouch/settings.json` | dashboard settings (changed from the System screen) |
| `/etc/floppyoctotouch/kiosk.env` | kiosk page and extra Chromium flags (`sudo systemctl restart floppyoctotouch-kiosk`) |
| `/etc/floppyoctotouch/install.conf` | what the installer did (user, `cmdline.txt` token, Cancel Objects plugin), read by update/uninstall |
| `/opt/floppyoctotouch` | app, agent venv, deploy scripts |

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#deployment-on-the-pi).

## Project layout

```
agent/      Python agent (aiohttp): static files, OctoPrint proxy, local endpoints
frontend/   Svelte 5 + TypeScript web app
deploy/     install/update/uninstall scripts, systemd units, kiosk launcher, USB automount, udev/sudo/PAM files
dev/        Docker Compose environment, OctoPrint seed, Playwright scripts, sample G-code
docs/       plan (Italian) and architecture notes
scripts/    build-release.sh (release tarball)
release/    the latest release tarball + .sha256 (installed by deploy/install.sh from a clone)
```

## License

[MIT](LICENSE) © 2026 Filippo Castellan
