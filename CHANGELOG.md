# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
