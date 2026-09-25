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
| GET | everything else | static files from `static_dir`, `index.html` fallback for extension-less paths (never for `/local/*`, which answers 404) |

The settings document is owned by the frontend (schema version, migrations and defaults live in
`frontend/src/lib/core/settings.ts`); the agent only stores it. The agent's own defaults are the v1 document of
session 1, which the frontend migrates on first load.

## Frontend

Svelte 5 (runes) + TypeScript, built by Vite into static files. No runtime dependency on the Internet: fonts and
icons will be bundled.

| Folder | Content |
|---|---|
| `src/lib/api/` | transport: `http.ts` (JSON helpers, path encoding), `octoprint.ts` (typed REST client), `agent.ts` (`/local/*`), `socket.ts` (push API), `types.ts` (OctoPrint 1.11 types) |
| `src/lib/core/` | pure, unit-tested logic: M115 capabilities, host action parser, temperature ring buffer, file tree helpers, printer phase and plugin detection, settings schema/migrations, formatting |
| `src/lib/stores/` | Svelte 5 stores (classes with `$state`/`$derived`, one singleton each) and `dataLayer.ts`, which wires the socket to them |
| `src/lib/i18n/` | `en.json`, `it.json`, `t()`, `setLocale()` (default English) |
| `src/screens/` | screens; for now only the temporary `Debug.svelte` |

OctoPrint returns absolute `refs` URLs built from its own host (e.g. `http://octoprint:5000/...` in Docker):
the client never uses them and always builds relative paths.

### Live updates (push API)

1. open `ws://<agent>/sockjs/websocket` (the agent relays it to OctoPrint with the API key);
2. OctoPrint sends `{"connected": …}`;
3. the app calls `POST /api/login {"passive": true}` (authenticated by the injected API key) and gets `name` and `session`;
4. the app sends `{"auth": "name:session"}` and `{"throttle": 2}`; from now on `history` (once), `current`
   (about once per second, logs and temperatures are batched by OctoPrint so nothing is lost), `event` and
   `plugin` messages arrive;
5. `reauthRequired` repeats the passive login on the same socket; on close the client reconnects with
   exponential backoff (1 s → 15 s).

### Data layer

`startDataLayer()` loads the settings from the agent, polls `/local/health` every 5 s until OctoPrint is reachable
and authorised, then opens the socket. Each time the socket is authenticated it reloads over REST what the socket
does not carry: `/api/connection`, `/api/settings`, `/api/printerprofiles`, `/api/files?recursive=true` (local
and SD card in one call) and `/local/usb`. After that REST is only used on events that announce a change:

| Event | Reaction |
|---|---|
| `UpdatedFiles`, `FileAdded`, `FileRemoved`, `FolderAdded`, `FolderRemoved` | file list reload (debounced 500 ms) |
| `Connected` | reload connection and printer profile; OctoPrint sends M115 itself |
| `Disconnected` | reset firmware capabilities and host prompts |
| `SettingsUpdated` / `PrinterProfileModified` | reload settings / profile |
| `FirmwareData` | firmware name |

| Store | Source | Notes |
|---|---|---|
| `connection` | `/local/health`, socket status, `connected`, `/api/connection` | connect/disconnect |
| `printer`, `job` | `current.state`, `job`, `progress`, `currentZ` | `phase` derived from the flags, `busy` while a job exists, ETA |
| `temperatures` | `history.temps` / `current.temps` | `TemperatureHistory` (typed arrays, 2048 samples ≈ 30 min+); `revision` bumps on new samples |
| `terminal` | `history.logs` / `current.logs` | last 1000 lines |
| `capabilities` | `Cap:` lines of the M115 answer in the log + settings overrides | sends M115 once if the report is unknown |
| `prompt` | `//action:` lines of live logs (not `history`, to avoid replaying answered prompts) | answers via the Action Command Prompt plugin when the firmware reported `PROMPT_SUPPORT`, else `M876 S<n>` |
| `files` | `/api/files`, `/local/usb` | USB status `unavailable` until the agent endpoint exists (session 5) |
| `server` | `/api/settings`, `/api/printerprofiles`, `plugin` messages | plugin detection from the `plugins` keys of the settings |
| `events` | `event` messages + `host:prompt`, `host:promptClosed`, `host:notification`, `host:action` | `events.on(type, handler)`, last 50 kept |
| `settings` | `/local/settings` | migrated on load, saved 400 ms after `settings.update()` |

Implementation note: keys added to a deep `$state` proxy are not picked up by `in` checks inside an already
computed `$derived`; stores that are read through such checks use `$state.raw` and replace the object.

## Development environment

`dev/docker-compose.yml` (project `floppyoctotouch`):

| Service | Image | Notes |
|---|---|---|
| `octoprint-init` | `octoprint/octoprint:1.11.8` | one-shot: merges `dev/octoprint/config.yaml` into the image's config (first start only), copies `dev/sample-gcode` (plus `examples/` folder and a virtual SD file), creates the admin user, registers `OCTOPRINT_API_KEY` as an application key |
| `octoprint` | `octoprint/octoprint:1.11.8` | OctoPrint on port 5000 (haproxy on 80 is not used), Virtual Printer with SD, volume `octoprint-data` |
| `agent` | `dev/docker/agent.Dockerfile` (Python 3.11) | source mounted, hot reload with `watchfiles` (polling), `dev/fake-usb` mounted as `/media/usb0` |
| `frontend` | `dev/docker/frontend.Dockerfile` (Node 24) | Vite dev server on 5173 proxying to the agent; `node_modules` in a named volume |
| `agent-test`, `frontend-test`, `build`, `playwright`, `shellcheck` | profile `tools` | run on demand with `docker compose run --rm <service>` |

All published ports bind to `127.0.0.1`.
