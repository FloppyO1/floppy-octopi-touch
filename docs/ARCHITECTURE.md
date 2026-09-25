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
│   • /webcam/* ──► camera-streamer 127.0.0.1:8080 (prefix removed, no API key)          │
│   • /local/* endpoints (health, settings, display; later system, thumbnails, USB)      │
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
| `proxy.py` | `OctoPrintProxy`: streams HTTP requests/responses (bodies untouched, `Content-Encoding` preserved), bridges WebSocket upgrades; strips client `X-Api-Key`, `Authorization`, `Origin`, `Referer` and hop-by-hop headers. `WebcamProxy`: `GET /webcam/<path>` → `<webcam_url>/<path>` (what OctoPi's haproxy does), streams endless MJPEG responses until the browser closes them |
| `display.py` | `Display`: HDMI output power with `wlr-randr --output <display_output> --on/--off` (the cage session's Wayland display), or backend `none` (only logs; development) |
| `settings.py` | `SettingsStore`: one JSON document (`<data_dir>/settings.json`), defaults when missing or corrupted, atomic writes, 256 KiB limit |
| `app.py` | application factory and `/local/*` handlers |
| `__main__.py` | CLI (`--host`, `--port`, `--listen-lan`) |

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/local/health` | agent version, whether an API key is configured, OctoPrint reachability/authorization/version |
| GET | `/local/settings` | dashboard settings document (defaults on first start) |
| PUT | `/local/settings` | replace the settings document (JSON object) |
| GET | `/local/display` | `{on, backend, output}` |
| PUT | `/local/display` | `{"on": false}` / `{"on": true}` switches the HDMI output; 503 with `detail` if `wlr-randr` fails |
| * | `/api/**`, `/sockjs/**`, `/plugin/**`, `/downloads/**` | proxied to OctoPrint |
| GET | `/webcam/**` | proxied to the webcam streamer (`webcam_url`, default `http://127.0.0.1:8080`); 502 if unreachable |
| GET | everything else | static files from `static_dir`, `index.html` fallback for extension-less paths (never for `/local/*`, which answers 404) |

The settings document is owned by the frontend (schema version, migrations and defaults live in
`frontend/src/lib/core/settings.ts`); the agent only stores it. The agent's own defaults are the v1 document of
session 1, which the frontend migrates on first load.

## Frontend

Svelte 5 (runes) + TypeScript, built by Vite into static files. No runtime dependency on the Internet: fonts and
icons are bundled.

| Folder | Content |
|---|---|
| `src/lib/api/` | transport: `http.ts` (JSON helpers, path encoding), `octoprint.ts` (typed REST client), `agent.ts` (`/local/*`), `socket.ts` (push API), `types.ts` (OctoPrint 1.11 types) |
| `src/lib/core/` | pure, unit-tested logic: M115 capabilities, host action parser, temperature ring buffer, file tree helpers (recent files, thumbnails), printer phase/tone and plugin detection, settings schema/migrations, formatting, gauge geometry, NumPad entry, keyboard layouts, overrides from the log (`tune`), DisplayLayerProgress layers (`layer`), webcam source (`webcam`), idle levels (`idle`), print notices (`notices`) |
| `src/lib/stores/` | Svelte 5 stores (classes with `$state`/`$derived`, one singleton each) and `dataLayer.ts`, which wires the socket to them |
| `src/lib/i18n/` | `en.json`, `it.json`, `t()`, `setLocale()` (default English) |
| `src/lib/ui/` | design system: tokens, components, `dialogs`/`toast` services, `pressable` attachment, theme (accent) and kiosk helpers |
| `src/shell/` | app shell: sidebar, status bar, screen registry, connection and printer overlays, screensaver, print notice dialog |
| `src/screens/` | screens (`Home` with its parts in `home/`, temporary `System`, `Placeholder`), shared `heaterTarget.ts`, dev-only pages in `dev/` (`Gallery`, `Debug`) |

OctoPrint returns absolute `refs` URLs built from its own host (e.g. `http://octoprint:5000/...` in Docker):
the client never uses them and always builds relative paths.

### Design system and shell

- **Tokens** (`src/lib/ui/tokens.css`): colours (surfaces, text, state colours `--ok`, `--heating`, `--cooling`,
  `--paused`, `--error`, `--idle`), type scale (`--fs-xs` 13 px … `--fs-display` 64 px), spacing, radii,
  shadows, touch sizes (`--touch` 56 px, `--touch-lg` 64 px), layout (`--sidebar-w`, `--statusbar-h`) and
  z-index layers. Components never use raw colours.
- **Accent**: `data-accent="teal|amber|indigo"` on `<html>` (any element works too, e.g. swatches). The value
  comes from the `accent` setting (applied when the settings load); `?accent=` overrides it for previews.
- **Font and icons**: Inter variable (Latin and Latin Extended subsets only) via `@fontsource-variable/inter`,
  Lucide icons imported one by one from `@lucide/svelte/icons/<name>` (tree-shaken).
- **Touch feedback**: the `pressable` attachment (`{@attach pressable}`) sets `data-pressed` from pointerdown to
  pointerup, because Chromium delays `:active` on touch screens. Styles use `:global([data-pressed])`, otherwise
  Svelte drops the selector as unused.
- **Dialogs**: `dialogs.confirm()`, `dialogs.number()`, `dialogs.slider()` and `dialogs.text()` return promises and are rendered by
  `DialogHost` (mounted once in `App.svelte`) as a stack, so a confirmation can follow a NumPad. The NumPad and
  the text sheet (on-screen keyboard) never use native inputs. `toast.show()` is rendered by `ToastHost`.
- **Shell** (`src/shell/`): `Shell` = `Sidebar` (88 px) + `StatusBar` (48 px) + content area (936×552).
  `screens.ts` is the screen registry (icon, component, whether the "printer disconnected" overlay applies).
  The current screen lives in the `nav` store and in the URL hash. `ConnectionOverlay` covers everything while
  the agent/OctoPrint/socket are not ready (after 800 ms, to avoid flashes); `PrinterOverlay` covers printer
  screens while the serial connection is down and offers port/baud selection and Connect.
- **Kiosk hardening** (`src/lib/ui/kiosk.ts`, `?kiosk=1`): hidden cursor, and prevented context menu, drag,
  text selection, pinch/ctrl+wheel/keyboard zoom.
- **Dev pages**: `/ui-gallery` and `/debug` are loaded with dynamic imports guarded by `import.meta.env.DEV`,
  so they are not part of the production build.

### Home, screensaver and notices

- **Home** (`src/screens/Home.svelte`): ring gauges on top (hotend, bed, fan; job and, with DisplayLayerProgress,
  layer while a job exists), then `home/JobView` (preview, progress, times, speed/flow buttons, pause/resume/stop)
  or `home/IdleView` (selected + recent files with a confirmed Print button, preheat presets, cooldown, homing).
  Pause and stop ask for confirmation; starting a print reminds to clear the bed.
- **Overrides**: OctoPrint does not report fan, feed rate or flow. The `tune` store reads them from the terminal
  log: every command OctoPrint sends is logged as `Send: …` (G-code file lines and other clients included), and
  Marlin's `FR:` / `Flow:` reports are parsed too. Feed rate and flow start at 100 % on (re)connection, the fan
  is unknown (`—`) until a command is seen. Sliders send `M220`/`M221` through the REST printhead/tool commands
  and `M106 S<0-255>` / `M107`.
- **Preview**: the file's thumbnail (Slicer Thumbnails plugin field for now; the agent's own extraction comes in
  session 5) or the webcam; the choice is the `home.preview` setting. The webcam is the first entry of
  `/api/settings` → `webcam.webcams[]` (`compat.stream`, flip/rotate) unless `webcam.url` is set in the dashboard
  settings. On OctoPi the stream URL is the relative `/webcam/?action=stream`, served by the agent's proxy.
  `WebcamView` keeps the MJPEG connection only while it is mounted and the UI is awake, and retries every 10 s.
- **Idle levels** (`core/idle.ts`, `stores/idle.svelte.ts`): `active` → `screensaver` after
  `screensaver.timeoutMin` → `off` after `screenOff.timeoutMin`, the latter only without a job. A host prompt or a
  print notice keeps the UI active. `Screensaver.svelte` shows the big view (progress or clock + temperatures),
  cancels open dialogs, and calls `PUT /local/display` when entering/leaving `off` (and turns the output back on
  at startup if it was left off).
- **Wake-up touch**: the idle store listens on `window` in the capture phase. When the UI is not active, the
  pointerdown that wakes it and its whole sequence (pointerup, mouse events, click) are stopped before any
  component sees them, plus any tap in the following 400 ms.
- **Notices** (`core/notices.ts`, `stores/notices.svelte.ts`, `shell/NoticeDialog.svelte`): `PrintDone` and
  `PrintFailed` (`reason: error`) open a big popup and send the `printDone.beepGcode` (`M300`, default on);
  `PrintFailed` with `reason: cancelled` and `PrintPaused` are shown only when they were not requested from this
  screen in the last 60 s (`job.local`). `PrintResumed` closes a pause notice, `PrintStarted` any notice.

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
| `Connected` | reload connection and printer profile, reset the overrides; OctoPrint sends M115 itself |
| `Disconnected` | reset firmware capabilities, host prompts and overrides |
| `PrintDone`, `PrintFailed`, `PrintPaused`, `PrintResumed`, `PrintCancelled`, `PrintStarted` | print notices |
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
| `server` | `/api/settings`, `/api/printerprofiles`, `plugin` messages | plugin detection from the `plugins` keys of the settings; `webcam` source; DisplayLayerProgress values (`/plugin/DisplayLayerProgress/values` once, then the `DisplayLayerProgress-websocket-payload` messages) |
| `tune` | `Send:`/`Recv:` log lines | fan %, feed rate %, flow % (see Home) |
| `notices` | print events | current big notice, print-done beep |
| `idle` | touches/keys, clock, settings | `active` / `screensaver` / `off`, wake-up touch swallowing |
| `nav`, `clock` | URL hash / timer | current screen; wall clock ticking every second |
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
| `webcam` | `octoprint/octoprint:1.11.8` (for its ffmpeg) | `dev/fake-webcam/server.py`: MJPEG test pattern on 8080 (`/?action=stream`, `/?action=snapshot`) |
| `agent` | `dev/docker/agent.Dockerfile` (Python 3.11) | source mounted, hot reload with `watchfiles` (polling), `dev/fake-usb` mounted as `/media/usb0`, webcam → `http://webcam:8080`, display backend `none` |
| `frontend` | `dev/docker/frontend.Dockerfile` (Node 24) | Vite dev server on 5173 proxying to the agent; `node_modules` in a named volume |
| `agent-test`, `frontend-test`, `build`, `playwright`, `shellcheck` | profile `tools` | run on demand with `docker compose run --rm <service>` |

All published ports bind to `127.0.0.1`.
