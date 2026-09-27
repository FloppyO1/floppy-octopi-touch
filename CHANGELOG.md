# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Cancel single objects during a print: an "Objects n/m" button on Home opens a bed map (printer profile size,
  the objects' outlines, current object highlighted, cancelled ones struck through) and a list; each cancel asks
  for confirmation, and the last object left cannot be cancelled. It uses Marlin `M486` when the firmware has
  `CANCEL_OBJECTS` (manual switch in System → Settings → Firmware, M115 does not report it) or the Cancel Objects
  OctoPrint plugin; files uploaded before the plugin was installed get an "upload it again" hint.
- Agent `GET /local/objects`: the labelled objects of a G-code file (Cancel Objects plugin, PrusaSlicer/OrcaSlicer
  "OctoPrint comments", `M486`, Cura, Klipper) with their outline on the bed (from the file or the convex hull of
  the extrusion moves), cached on disk like the thumbnails.
- Installer: offers the Cancel Objects plugin (pinned version 0.6.4, Enter = yes) through OctoPrint's Plugin
  Manager API; OctoPrint is restarted only when it is not printing; `--no-cancel-plugin`. A key without admin
  rights or no network only warns with the manual steps. `uninstall.sh` offers to remove the plugin only when
  the installer added it.
- Dev: the Cancel Objects plugin in the OctoPrint container, four-object samples (PrusaSlicer comments and
  `M486`), smoke test and installer test steps for both paths.

### Fixed
- Kiosk: when Chromium's page crashes (seen on the Pi: its renderer killed by the kernel's OOM killer) the agent
  notices that the page's event stream is gone and restarts the kiosk after 60 s (`kiosk_watchdog_s`), instead of
  leaving the "Something went wrong" page on screen.
- Webcam: a stream that ended (streamer restarted) or went silent froze on its last frame forever. The agent now
  cuts such streams (10 s without data) and the preview reconnects by itself.
- Smoke test: the move step no longer depends on a Virtual Printer race that sometimes ran a jog as an absolute
  move.

## [0.9.1] - 2026-09-27

### Added
- `install.sh`, `update.sh` and `uninstall.sh` run themselves again through `sudo` when started without root,
  with `bash`, so `./deploy/install.sh` and `bash deploy/install.sh` (executable bit lost) both work.
- The installer shows where to create the API key with the Pi's real address, and reboots after a 10-second
  countdown that Ctrl+C cancels (the dashboard then starts right away).
- Installer test: self-elevation from a normal user, installer without its executable bit, and interactive runs on
  a fake terminal (`dev/deploy-test/drive.py`) that fail on any question asked after apt starts (100 checks).
- `agent-test` also lints the Python helpers of the installer test.

### Changed
- Every installer question comes first, before apt and pip: the API key (first question), the display settings
  and "reboot at the end"; then it runs unattended. The user of `octoprint.service` is taken without asking.
- API key prompt: asked again without limit when OctoPrint refuses it; saved unchecked when OctoPrint does not
  answer; a saved key that still works is kept without asking (change it with `--api-key=` or on the touch
  screen). The installer waits up to 10 s for OctoPrint to answer.
- Repository: `github.com/FloppyO1/floppy-octopi-touch` (clone commands in the README, System → About, where the
  link now wraps after a slash instead of being cut).
- README: the Raspberry Pi installation starts with a short step-by-step guide; options, update, uninstall,
  troubleshooting and "What the installer does" follow.

## [0.9.0] - 2026-09-25

### Added
- `deploy/install.sh` for OctoPi 1.1.0 (Bookworm, arm64/armhf), idempotent: system and OctoPrint checks, the
  OctoPrint user detected from `octoprint.service` and confirmed, packages (`cage`, `chromium` or
  `chromium-browser`, `python3-venv`, `wlr-randr`, `fonts-dejavu-core`, `curl`), app and agent venv in
  `/opt/floppyoctotouch`, API key checked on `/api/version`, `config.json` with mode 600, systemd units for the
  agent and the kiosk (cage + Chromium on tty1 with a PAM/logind session, restarted when they stop), getty on tty1
  disabled, optional display settings in `config.txt`/`cmdline.txt` with backups, summary and reboot prompt.
  Options `--non-interactive`, `--api-key=`, `--user=`, `--octoprint-url=`, `--skip-display-config`,
  `--listen-lan`. Run from a git clone, it installs the bundled tarball in `release/` after checking its checksum.
- USB sticks mounted read-only (`nosuid,nodev,noexec`) on `/media/usb-<label>` by a udev rule and
  `systemd-mount` (FAT32, exFAT, NTFS, ext4; the boot disk is skipped); "Eject" goes through a sudo rule limited
  to that script and to restarting the kiosk.
- Kiosk launcher: waits for the agent, fresh Chromium profile in `XDG_RUNTIME_DIR` at every start, Wayland,
  no pinch/translate/crash bubble; page and extra flags in `/etc/floppyoctotouch/kiosk.env`.
- `floppyoctotouch-update` (checksum, version comparison, `--force`; keeps key, settings and kiosk options) and
  `floppyoctotouch-uninstall` (`--purge`, `--keep-display-config`; gives tty1 back to getty, removes the display
  lines).
- `scripts/build-release.sh` (Docker service `release`): reproducible `floppyoctotouch-<version>.tar.gz` with the
  built web app, the agent wheel and `deploy/`, plus `.sha256`; the latest one is committed in `release/`.
- Development: `deploy-test` service (Debian bookworm) that installs the release and checks config, units,
  sudo rules, boot files, the running agent, the kiosk launcher, the USB helper, reinstall, update, uninstall and
  the install from a clone (77 checks). README: installation, update/uninstall, files and troubleshooting.

### Changed
- USB sticks mounted as `/media/usb-<label>` are shown with their label only.

## [0.8.0] - 2026-09-25

### Added
- System screen, overview: CPU (tinted by temperature too, with temperature and frequency), RAM and disk ring
  gauges refreshed every 3 s while visible; network (connection type, Wi-Fi name and signal, IP, gateway, host
  name, uptime, interface); OctoPrint restart, Pi reboot and shutdown (listed when configured in OctoPrint) with
  confirmations that warn about a running print; "Restart the screen" (kiosk restart through the agent, page reload
  when no command is configured); OctoPrint custom system commands.
- Power and lights: PSU Control switch (state from its socket message, `turnPSUOn`/`turnPSUOff`, turning off
  always confirmed), optionally in the status bar; custom actions that send G-code, run an OctoPrint system command
  or call a plugin SimpleApi command with JSON fields, with icon, colour, optional confirmation and up to three in
  the status bar.
- Settings tab with seven sections: general (language, accent, 24-hour clock, end-of-print beep and its G-code,
  reset of every setting), screen (screensaver on/off, timeout, thumbnail; screen off and its timeout),
  temperatures (confirmation thresholds, highest targets), motion (jog speeds, paper test inset and travel Z,
  extruder setup), firmware (M115 report, per-capability auto/on/off override, read again), power and lights,
  connection (API key, manual webcam URL).
- OctoPrint API key replaced from the dashboard (in-app keyboard): the agent checks it against OctoPrint, saves it
  in `config.json` (mode 600) and uses it at once, then the page reconnects. The "connecting" overlay offers the
  same when there is no key or OctoPrint rejects it.
- About tab: versions (app, OctoPrint, agent, firmware), host name, repository placeholder, licence and the bundled
  third-party software.
- Status bar: network icon (Wi-Fi bars, Ethernet, no network) with the IP address, and the quick action buttons.
- Agent: `GET /local/system` (CPU usage, temperature and frequency, load, memory, disk, interfaces, default route,
  Wi-Fi from `nmcli` when installed or `/proc/net/wireless`; only `/proc`, `/sys` and `statvfs`), `GET/PUT
  /local/apikey`, `POST /local/kiosk/restart`; config `kiosk_restart_command`, `disk_path`.
- Settings schema v7: `customActions`, `psu.statusBar`.
- Development: the dev OctoPrint gets harmless reboot/shutdown commands and a custom "Toggle lights (dev)" system
  command; the smoke test covers the System screen (metrics, mocked reboot, custom command, screen restart, custom
  actions from the status bar, every settings section, capability override, API key refused and accepted, reset,
  PSU Control with a mocked plugin, the overlay's API key button).

### Changed
- The temporary System screen (session 3) is replaced; language and accent moved to Settings → General.
- The agent runs its external commands (wlr-randr, eject, kiosk restart, nmcli) through one helper, and the proxy
  reads the API key at every request (it can change at runtime).
- The icon and colour picker of the macro editor is a shared component (also used by custom actions).

## [0.7.0] - 2026-09-25

### Added
- Terminal screen: live serial log with coloured sent/received/error lines, auto-scroll that stops when scrolled
  up, pause with a counter of the new lines, clear; filters for temperature reports, plain `ok`, busy/wait, SD
  status and the dashboard's position requests (remembered); command input with the in-app G-code keyboard under
  the log, history of the typed commands and quick M114/M105/M119/M503/M115 buttons.
- Macros tab: big buttons with icon and colour; confirmation when the macro asks for it and always while a job
  runs; comments and blank lines are not sent. Macro manager: add and edit (name and multi-line G-code through the
  on-screen keyboards, icon, colour, confirmation), reorder, delete (confirmed), restore the defaults (confirmed).
- Leveling screen, paper test: the nozzle goes to Z0 over the four corners (configurable distance from the edges)
  and the centre, with a travel height; needs the axes homed (tracked from every `G28`/`M84` sent).
- Leveling screen, mesh: `M420 V` report parsed (Marlin bilinear and mesh bed leveling grids) into a heatmap seen
  from the front, with min/max/range; automatic probing (`G28`, `G29`) with the `autolevel` capability; guided
  manual mesh (`G29 S1`/`S2` with Z jogs) with the `manualMesh` capability; save to EEPROM (`M500`).
- Leveling screen, Z offset: babystepping (`M290`, 0.01/0.05 mm, also while printing) with a running total, probe
  Z offset (`M851`, read and set with the NumPad), save to EEPROM.
- Settings schema v6: `terminal.filters`, `leveling.inset`, `leveling.zHop`, `leveling.babystep`,
  `leveling.meshStep`; macro icons and colours are validated.
- Development: the smoke test covers the terminal (keyboard input, filters, pause, history), macro CRUD and runs,
  the paper test, a mesh report injected through the Virtual Printer (`!!DEBUG:send`), the manual mesh flow,
  babystep, probe offset and M500; `ONLY=terminal,leveling` runs selected steps.

### Changed
- Firmware capabilities count as known only after the `FIRMWARE_NAME` line of the M115 report: after a reload the
  log history may hold only the tail of the report, which hid features such as EEPROM.
- The multi-line input field no longer shows part of a fourth line.

### Removed
- The placeholder screen (every sidebar entry now has its screen).

## [0.6.0] - 2026-09-25

### Added
- Temperature screen: hotend and bed ring gauges (tap or Set = NumPad with presets, confirmation above the
  thresholds), Off per heater and All heaters off (confirmed while a job runs), live uPlot chart of actual and
  target temperatures with a 5/15/30 min window (remembered), preheat presets.
- Preset manager: add and edit (name through the on-screen keyboard, hotend, bed, optional fan), reorder, delete
  (confirmed), restore the defaults (confirmed); names must be unique and temperatures within the limits.
- Move screen: X/Y/Z jog pad with 0.1/1/10/50 mm steps (remembered), home XY/Z/all, motors off (M84), head
  position from M114 (`PositionUpdate` events), part fan, jog speeds for X/Y and Z. Axis inversion and the build
  volume come from the OctoPrint printer profile: once the position is known, jogs are shortened to stay inside
  the volume and refused at the edge. Locked while a job runs.
- Filament screen: guided wizard (material from the presets → heat up and wait → insert → load → purge until
  clean → done, or unload) using M701/M702 when the capability is enabled, otherwise G-code built from the
  extruder settings (bowden length fast, slow load, unload plus bowden, purge; moves split below Marlin's
  200 mm limit); M600 change when advanced pause is enabled, also offered during a print. The end of each step is
  detected with `M400` + `M114`. Manual extrude/retract with length and speed, disabled below the minimum
  extrusion temperature (cold extrusion protection). Extruder setup dialog; until it is saved the wizard warns
  that prudent defaults are used. Locked while a job runs.
- Settings schema v5: `temperature.chartMinutes`, `move.step`, `move.xyFeedrate`, `move.zFeedrate`,
  `filament.minTemp`.
- `Segmented` control in the design system.
- Development: the smoke test covers the three screens (NumPad targets, preset CRUD, jog limits, extruder setup,
  load/unload wizard, manual extrusion) and checks that Move and Filament are locked while printing.

## [0.5.0] - 2026-09-25

### Added
- Files screen with three sources as tabs: OctoPrint local storage (folders with breadcrumb, sort by name, date
  or size, thumbnail grid or compact list, both remembered), the printer's SD card (print, delete, init, read,
  release; hidden when the printer has no card) and a USB stick plugged into the Pi.
- File detail: large thumbnail, estimated time, filament, dimensions, size, upload date, last print; Print,
  Select and Delete (confirmed). The list follows OctoPrint's file events and the end of the slicer analysis.
- Search across every folder through the on-screen keyboard (accent-insensitive).
- Agent: `GET /local/thumbnail` extracts PNG, JPG and QOI thumbnails from PrusaSlicer/OrcaSlicer G-code headers
  (QOI converted to PNG, standard library only), reading OctoPrint's uploads folder (`uploads_dir`) or, if not
  readable, its download; results cached on disk. Thumbnails now show everywhere (Home, recent files, Files)
  without the Slicer Thumbnails plugin.
- Agent: USB sticks under `usb_roots` (default `/media/usb*`): `GET /local/usb`, `/local/usb/thumbnail`,
  `POST /local/usb/import` (upload into OctoPrint's local storage with NDJSON progress, cancellable,
  `usb_max_file_mb` limit), `POST /local/usb/eject` (`usb_eject_command`); every path is confined to its mount
  (no traversal, no symlinks out). `GET /local/events` pushes stick insertion/removal (Server-Sent Events), shown
  as toasts.
- Optional file thumbnail next to the percentage on the printing screensaver (`screensaver.showThumbnail`,
  default off, temporary switch on the System screen).
- Settings schema v4: `files.sort`, `files.direction`, `files.view`, `screensaver.showThumbnail`.
- Development: the fake USB stick is writable by the Playwright container; the smoke test covers browsing,
  sorting, search, detail, delete, SD card, USB import/eject/insertion and the screensaver thumbnail.

### Changed
- `dev/sample-gcode/3dbenchy_prusaslicer.gcode` re-exported with a 300×300 PNG thumbnail.

## [0.4.0] - 2026-09-25

### Added
- Home screen, complete: job view with the file thumbnail or the webcam (switchable, tap to enlarge), progress,
  elapsed/left/ETA, live speed (M220) and flow (M221) sliders, fan (M106/M107) slider from the fan gauge,
  pause (confirmed), resume, stop (confirmed); layer gauge with the DisplayLayerProgress plugin; idle view with
  the selected and recent files (Print asks to check that the bed is clear), preheat presets, cooldown and homing.
- Fan, feed rate and flow are read from the commands in the terminal log (G-code files and other clients
  included) and from Marlin's `FR:`/`Flow:` reports.
- Screensaver after the configured timeout: big progress view while printing, clock, date and temperatures
  otherwise. The touch that wakes it up is swallowed and never presses a button underneath.
- Optional screen off when idle (never while printing), through the new agent endpoint `/local/display`
  (`wlr-randr` on the Pi, a logging no-op in development); a touch turns the screen back on.
- Big notices for finished and failed prints (with the `M300` beep, default on) and for pauses or cancels
  made elsewhere (printer, filament change, another client).
- Agent: `/webcam/*` proxy to camera-streamer (`webcam_url`), so OctoPrint's default relative stream URL works.
- Slider dialog (`dialogs.slider()`), `WebcamView` component.
- Settings schema v3: manual webcam URL (`webcam.url`) and Home preview choice (`home.preview`).
- Development: fake MJPEG webcam service; the smoke test now prints a short job from the Home (overrides,
  pause/resume, webcam, end-of-print notice and beep) and checks screensaver, wake-up touch and screen off.

## [0.3.0] - 2026-09-25

### Added
- Design tokens (CSS custom properties): dark palette, state colours (ok, heating, cooling, paused, error, idle),
  type scale for 50-80 cm viewing, spacing, radii, shadows, layers; Inter variable font and Lucide icons
  bundled (works offline).
- Accent colour variants teal (default), amber and indigo, saved in the settings (`accent`) and selectable on
  the temporary System screen; `?accent=` previews one.
- Components: Button, IconButton, Card, Toggle, Slider, Stepper (hold to repeat), Select, Modal, ConfirmDialog,
  NumPad (limits, presets), OnScreenKeyboard (EN/IT QWERTY, symbols, G-code layout), text input sheet,
  InputField (opens the NumPad or the keyboard), RingGauge (SVG, target tick, tones, sizes S/M/L), InfoRow,
  Spinner, Toast, PromptDialog; promise-based `dialogs.confirm/number/text()` and `toast.show()`.
- App shell at 1024×600: sidebar with 8 screens, status bar (printer state, job %, temperatures, connection,
  24 h clock), "Connecting to OctoPrint" overlay, "Printer disconnected" overlay with port/baud Connect form.
- First Home screen with ring gauges (tap a heater to set its target, confirmation above the threshold),
  job summary with pause/resume/stop (confirmed) and status rows; placeholders for the other screens.
- Marlin host prompts shown as a touch dialog, host notifications as toasts.
- Kiosk hardening with `?kiosk=1` (hidden cursor, no context menu, zoom, selection or dragging).
- Dev-only pages `/ui-gallery` and `/debug` (not in the production build); smoke test covering the shell and
  a script for accent screenshots.

## [0.2.0] - 2026-09-25

### Added
- Typed OctoPrint REST client: connection, printer (print head, tools, bed, chamber, SD card, raw commands),
  job, files (list, select/print, move, copy, delete, folders), printer profiles, settings, system commands,
  SimpleApi plugin calls; agent client for health, settings and (upcoming) USB listing.
- Push socket client: `reauthRequired` handling, throttle (1 Hz `current` updates), injectable transport for tests.
- Svelte 5 stores: connection, printer state and job progress (with ETA), temperatures with a circular history
  buffer, files from local storage, SD card and USB, terminal log, events bus, firmware capabilities
  (M115 parsing + manual overrides), Marlin host prompts/notifications (answered with `M876`), OctoPrint
  settings/profile/plugin detection (PSU Control, Slicer Thumbnails, DisplayLayerProgress, Action Command Prompt).
- Settings store synchronised with the agent: versioned schema (v2) with migrations and defaults (temperature
  presets, example macros, confirmation/maximum temperatures, screensaver, screen off, print-done beep,
  filament parameters, capability overrides); the language choice is persisted.
- Temporary debug page showing every store; formatting helpers; 53 unit tests.
- Development data: an `examples/` folder in local storage and a file on the virtual SD card.

### Fixed
- The agent answers 404 for unknown `/local/*` endpoints instead of the SPA page.
- Removed screenshots committed by mistake under `dev/e2e/` (MSYS path rewriting).

## [0.1.0] - 2026-09-25

### Added
- Repository foundations: README, MIT license, changelog, editor/git settings, contributor notes (`CLAUDE.md`).
- Docker Compose development environment: OctoPrint 1.11.8 with the Virtual Printer (SD card, auto-connect,
  220×220×240 profile), automatic admin user and API key registration, agent with hot reload, Vite dev server,
  and tool services for tests, production build, Playwright screenshots and shellcheck.
- Agent (Python 3.11, aiohttp): static file server with SPA fallback, reverse proxy for `/api`, `/sockjs`
  (WebSocket included), `/plugin` and `/downloads` injecting the OctoPrint API key, `GET/PUT /local/settings`
  with defaults and atomic writes, `GET /local/health`. Listens on 127.0.0.1 unless `--listen-lan` is given.
- Frontend (Svelte 5, TypeScript, Vite): minimal page with agent/OctoPrint versions, printer state and live
  temperatures through the push API (passive login + socket auth, reconnection with backoff), English/Italian.
- `frontend/preview.html` showing the app in a 1024×600 frame.
- Sample G-code files with PrusaSlicer PNG/QOI and OrcaSlicer thumbnails, and their generator.
