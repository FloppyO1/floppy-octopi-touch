# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
