# Architecture

## Components

```
┌──────────────────────────── Raspberry Pi 4 (OctoPi 1.1.0) ────────────────────────────┐
│  cage (Wayland kiosk) ── Chromium --kiosk http://127.0.0.1:8765                         │
│                                    │                                                   │
│  FloppyOctoTouch agent (aiohttp) ◄─┘  127.0.0.1:8765                                   │
│   • static files (frontend/dist, SPA fallback)                                         │
│   • reverse proxy /api /sockjs /plugin /downloads ──────────► OctoPrint 127.0.0.1:5000 │
│     (adds X-Api-Key, relays WebSockets)                                                │
│   • /local/* endpoints (health, settings; later system, thumbnails, USB, display)      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

The kiosk, systemd units and installer are planned; today the same topology runs in Docker (see below).

### Why a local agent

- **Same origin**: the web app talks only to the agent, so OctoPrint needs no CORS configuration and
  OctoPi's haproxy is left untouched.
- **API key stays server side**: it lives in `~/.config/floppyoctotouch/config.json` (mode 600 on the Pi) and
  is added to every proxied request. The browser code never sees it.
- **Local features**: endpoints that OctoPrint does not offer (network status, thumbnail extraction, USB stick
  import, HDMI power) can be added without writing an OctoPrint plugin.
- **Security**: because the proxy authenticates every request, the agent binds to `127.0.0.1` by default.
  `--listen-lan` exists but logs a warning: anyone reaching the port would control the printer.

## Agent

Package `agent/floppyoctotouch_agent`:

| Module | Role |
|---|---|
| `config.py` | `Config` dataclass; JSON file (`FOT_CONFIG`, default `~/.config/floppyoctotouch/config.json`) overridden by `FOT_*` env vars |
| `proxy.py` | `OctoPrintProxy`: streams HTTP requests/responses (bodies untouched, `Content-Encoding` preserved), bridges WebSocket upgrades; strips client `X-Api-Key`, `Authorization`, `Origin`, `Referer` and hop-by-hop headers |
| `settings.py` | `SettingsStore`: one JSON document (`<data_dir>/settings.json`), defaults when missing or corrupted, atomic writes, 256 KiB limit |
| `app.py` | application factory and `/local/*` handlers |
| `__main__.py` | CLI (`--host`, `--port`, `--listen-lan`) |

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/local/health` | agent version, whether an API key is configured, OctoPrint reachability/authorization/version |
| GET | `/local/settings` | dashboard settings document (defaults on first start) |
| PUT | `/local/settings` | replace the settings document (JSON object) |
| * | `/api/**`, `/sockjs/**`, `/plugin/**`, `/downloads/**` | proxied to OctoPrint |
| GET | everything else | static files from `static_dir`, `index.html` fallback for extension-less paths |

The settings document is owned by the frontend (schema version, migrations and full defaults arrive with the
data layer); the agent only stores it.

## Frontend

Svelte 5 (runes) + TypeScript, built by Vite into static files. No runtime dependency on the Internet: fonts and
icons will be bundled.

- `src/lib/api/http.ts`: JSON helpers (same-origin requests).
- `src/lib/api/octoprint.ts`: REST calls (`/api/version`, `/api/connection`, passive login, agent health).
- `src/lib/api/socket.ts`: push API client over the raw WebSocket `/sockjs/websocket`.
- `src/lib/i18n/`: `en.json`, `it.json`, `t()` with runtime switch (default English).

### Live updates (push API)

1. open `ws://<agent>/sockjs/websocket` (the agent relays it to OctoPrint with the API key);
2. OctoPrint sends `{"connected": …}`;
3. the app calls `POST /api/login {"passive": true}` (authenticated by the injected API key) and gets `name` and `session`;
4. the app sends `{"auth": "name:session"}`; from now on `current`, `history`, `event`, `plugin` messages arrive
   (`current` roughly every 500 ms with state and temperatures);
5. on close the client reconnects with exponential backoff (1 s → 15 s).

## Development environment

`dev/docker-compose.yml` (project `floppyoctotouch`):

| Service | Image | Notes |
|---|---|---|
| `octoprint-init` | `octoprint/octoprint:1.11.8` | one-shot: merges `dev/octoprint/config.yaml` into the image's config (first start only), copies `dev/sample-gcode`, creates the admin user, registers `OCTOPRINT_API_KEY` as an application key |
| `octoprint` | `octoprint/octoprint:1.11.8` | OctoPrint on port 5000 (haproxy on 80 is not used), Virtual Printer with SD, volume `octoprint-data` |
| `agent` | `dev/docker/agent.Dockerfile` (Python 3.11) | source mounted, hot reload with `watchfiles` (polling), `dev/fake-usb` mounted as `/media/usb0` |
| `frontend` | `dev/docker/frontend.Dockerfile` (Node 24) | Vite dev server on 5173 proxying to the agent; `node_modules` in a named volume |
| `agent-test`, `frontend-test`, `build`, `playwright`, `shellcheck` | profile `tools` | run on demand with `docker compose run --rm <service>` |

All published ports bind to `127.0.0.1`.
