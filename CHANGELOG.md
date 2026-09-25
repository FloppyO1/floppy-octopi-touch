# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
