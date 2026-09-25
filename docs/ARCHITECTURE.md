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
│   • /local/* endpoints (health, settings, system, API key, kiosk, display, thumbnails, │
│     USB, events)                                                                       │
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
| `commands.py` | `run_command()`: runs an external program with a timeout, `CommandError` with a readable reason (not installed, timed out, exit status + stderr); used for wlr-randr, eject, kiosk restart and nmcli |
| `system.py` | `SystemInfo`: CPU usage from two `/proc/stat` samples (the previous request's, or two 250 ms apart when older than 30 s), SoC temperature (`/sys/class/thermal`, the `cpu` zone first), frequency (`cpufreq`), load, memory (`MemAvailable`), disk (`statvfs` of `disk_path`, like `df`), interfaces (`/sys/class/net` without lo/docker/veth/bridges, IPv4 via `SIOCGIFADDR`), default route and gateway (`/proc/net/route`), Wi-Fi SSID/signal from `nmcli -t … device wifi list --rescan no` (cached 10 s, not retried when missing) or the link quality of `/proc/net/wireless` |
| `control.py` | `ControlApi`: `/local/system`, `/local/apikey` (validation on OctoPrint, `save_config_values()` into the config file with mode 600, used at once by the proxy and the files API), `/local/kiosk/restart` |
| `thumbnails.py` | `ThumbnailScanner` (line by line, stops at the first G-code command, largest valid image wins), QOI decoder and PNG encoder (standard library only), `ThumbnailCache` on disk (`<data_dir>/thumbnails/<sha1>.png\|.jpg`, `.none` for files without a thumbnail, 1000 entries, one extraction at a time) |
| `usb.py` | `UsbManager`: mounts matching `usb_roots`, G-code listing (depth 5, 1000 files, system folders skipped), `resolve()` that confines every path to its mount (no `..`, no symlinks out), eject command; streamed multipart body with a known length for the import; `EventHub` + `UsbWatcher` (mount polling every 2 s) |
| `files.py` | `FilesApi`: the thumbnail, USB and event endpoints, `ApiError` → JSON `{error, detail}` middleware |
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
| GET | `/local/thumbnail?path=<local path>&v=<date>` | thumbnail of a file of OctoPrint's local storage as PNG/JPEG (cached; `v` busts the browser cache), 404 `no_thumbnail`; read from `uploads_dir`, or streamed from `/downloads/files/local/…` when that folder is not readable |
| GET | `/local/usb` | `{mounts: [{id, name}], files: [{mount, path, name, size, date}]}` |
| GET | `/local/usb/thumbnail?mount=<id>&path=<path>` | thumbnail of a file on a stick |
| POST | `/local/usb/import` | `{mount, path, folder}` → uploads the file to `/api/files/local` (so OctoPrint analyses it) and streams NDJSON: `{sent, total}` every 250 ms, then `{done, name, path}` or `{error}`; closing the request cancels the upload; 413 above `usb_max_file_mb` |
| POST | `/local/usb/eject` | `{mount}` → runs `usb_eject_command` (`{path}` = mount point) |
| GET | `/local/system` | `{version, hostname, uptime, cpu: {percent, cores, temperature, frequency, maxFrequency, load}, memory: {total, used, percent}, disk: {path, total, used, free, percent}, network: {primary, gateway, interfaces: [{name, state, mac, ipv4, wireless}], wifi: {interface, connected, ssid, signal}}}`; missing values are `null` |
| GET | `/local/apikey` | `{configured, hint: "…abcd", source: env|file|none, persistent}` (never the key) |
| PUT | `/local/apikey` | `{"apiKey": "…"}`: 400 `invalid_format` (16-128 of `A-Za-z0-9_-`), 422 `rejected` (OctoPrint's `/api/version` did not answer 200 with it), 502 `octoprint_unreachable`, 500 `save_failed`; otherwise saved to `config_path`, used at once, answers like GET (`persistent: false` when `FOT_API_KEY` will win again at the next start) |
| POST | `/local/kiosk/restart` | runs `kiosk_restart_command` → `{restarted: true}`, 503 `kiosk_restart_failed`; no command configured → `{restarted: false}` (the page reloads itself) |
| GET | `/local/events` | Server-Sent Events: `usb` with the current mounts on connection and on every change, pings every 15 s |
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
| `src/lib/core/` | pure, unit-tested logic: M115 capabilities, host action parser, temperature ring buffer, file tree helpers (recent files, thumbnails, sort, search, breadcrumbs), printer phase/tone and plugin detection, settings schema/migrations, formatting, gauge geometry, NumPad entry, keyboard layouts, overrides from the log (`tune`), DisplayLayerProgress layers (`layer`), webcam source (`webcam`), idle levels (`idle`), print notices (`notices`), presets validation (`presets`), generic list operations (`lists`), jog limits (`move`), filament sequences (`filament`), chart colours (`chart`), terminal filters and history (`terminal`), macros (`macros`), mesh parser and stats (`mesh`), paper test points and leveling G-code (`leveling`) |
| `src/lib/stores/` | Svelte 5 stores (classes with `$state`/`$derived`, one singleton each) and `dataLayer.ts`, which wires the socket to them |
| `src/lib/i18n/` | `en.json`, `it.json`, `t()`, `setLocale()` (default English) |
| `src/lib/ui/` | design system: tokens, components, `dialogs`/`toast` services, `pressable` attachment, theme (accent) and kiosk helpers |
| `src/shell/` | app shell: sidebar, status bar, screen registry, connection and printer overlays, screensaver, print notice dialog |
| `src/screens/` | screens (`Home` with its parts in `home/`, `Files` in `files/`, `Temperature` in `temperature/`, `Move` in `move/`, `Filament` in `filament/`, `Terminal` in `terminal/`, `Leveling` in `leveling/`, temporary `System`), shared `heaterTarget.ts`, dev-only pages in `dev/` (`Gallery`, `Debug`) |

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
- **Preview**: the file's thumbnail (see Files) or the webcam; the choice is the `home.preview` setting. The webcam is the first entry of
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
- **Screensaver thumbnail**: with `screensaver.showThumbnail` the printing view puts the file thumbnail (~220 px)
  left of the percentage; without a thumbnail the layout stays the plain one.

### Files

- **Screen** (`src/screens/Files.svelte`, parts in `files/`): tabs Local / SD card (only when OctoPrint reports SD
  support and the firmware/override does not say otherwise, `core/files.ts` → `sdAvailable()`) / USB stick.
  `files/view.svelte.ts` keeps tab, folder, search and open detail across navigation. `items.ts` maps OctoPrint
  entries and stick files to one `Item` shape sorted with `compareItems()` (folders first). Sort key, direction
  and grid/list view are settings (`files.*`, schema v4).
- **Search** uses `dialogs.text()` (on-screen keyboard) and matches the whole path in every folder, ignoring case
  and accents (`searchFiles()` / `matchesQuery()`).
- **Detail** (`FileDetail`): slicer analysis from `gcodeAnalysis` (time, filament, dimensions), last print from
  `prints.last`; Print (bed-clear confirmation, shared with the Home), Select, Delete (confirmation). SD card
  files have no thumbnail or analysis; SD commands (`M21`/`M20`/`M22` through `POST /api/printer/sd`) are
  disabled while printing.
- **Thumbnails**: `thumbnailUrl()` returns the Slicer Thumbnails plugin URL when the entry has one, otherwise
  `/local/thumbnail?path=…&v=<date>` for local G-code files. `Thumb.svelte` falls back to an icon on 404, so
  Home, recent files, the screensaver and the browser all share the same logic.
- **USB** (`stores/usb.svelte.ts`): subscribes to `/local/events` (`EventSource`, reconnects by itself); each
  `usb` event replaces the mounts and reloads `/local/usb`; mounts appearing/disappearing after the first event
  become `usb:inserted` / `usb:removed` on the events bus (toasts in `App.svelte`). The import reads the NDJSON
  stream (`ImportProgress` dialog with cancel), asks before overwriting a file with the same name, then opens
  the detail of the local copy.
- **Live updates**: `UpdatedFiles`, `FileAdded`, `FileRemoved`, `FolderAdded`, `FolderRemoved`, `FileDeselected`
  and `MetadataAnalysisFinished` reload the file list (debounced).

### Temperature, Move and Filament

- **Temperature** (`src/screens/Temperature.svelte`, parts in `temperature/`): `HeaterCard` per heater (gauge and
  Set → `askHeaterTarget()`, Off → `heaterOff()`), All heaters off (`allHeatersOff()`; both confirm while a job
  runs), `TempChart` and the presets row (preheat disabled during a job). `TempChart` builds one uPlot instance
  per heater set (actual + dashed target series, colours from the state tokens via `core/chart.ts`) and calls
  `setData()` on every `temperatures.revision`; the x range is always `[last - window, last]`, the y range starts
  at 0. The window (`temperature.chartMinutes`) is a setting. `PresetManager`/`PresetEditor` use the pure helpers
  of `core/presets.ts` (move, upsert, remove, validate: unique name ≤ 24 chars, temperatures within the NumPad
  maxima) and `defaultPresets()` to restore.
- **Move** (`src/screens/Move.svelte`, `move/actions.ts`): the step and the X/Y and Z feed rates are settings
  (`move.*`). `planJog()` (`core/move.ts`) turns the on-screen direction into a machine move (profile
  `axes.<axis>.inverted`) and, when the position is known, clamps it to the profile volume (`axisBounds()`:
  0…size, or centred for `origin: center`); a zero move shows a toast. `printer.jog()` updates the position
  optimistically before the request (so quick taps are limited correctly) and schedules one `M400` + `M114`
  600 ms after the last jog; `reportPosition()` drops M114 answers older than the last jog. Homing asks for the
  position after `G28`, `M84` makes it unknown. Everything but the fan is disabled while `printer.busy`.
- **Filament** (`src/screens/Filament.svelte`, parts in `filament/`): `flow.svelte.ts` is the wizard state machine
  (`material → heat → [insert] → run → [purge] → done`), a singleton so a running step survives navigation. The
  heat step sets the preset's hotend target and advances once `reachedTarget()`; each run sends
  `actionGcode()` (`core/filament.ts`: `M701`/`M702` with the `filamentLoadUnload` capability, `M600` for a
  change, otherwise `M83`, `G1 E… F…` pieces of ≤ 100 mm, `M82`) followed by `M400` + `M114`, and waits for the
  next `PositionUpdate` (timeout: nominal duration + 30 s, 5 min for firmware commands, none for M600). The
  progress bar is a CSS animation over the nominal duration. `canExtrude()` blocks extrusion below
  `filament.minTemp`. `FilamentSetup` edits `filament.*` and sets `configured`; until then the wizard warns once
  per session. During a job the screen is locked and, with the `advancedPause` capability, offers `M600`.

### Terminal and macros

- **Console** (`src/screens/Terminal.svelte`, parts in `terminal/`): the log is `terminal.lines` (last 1000) run
  through `visibleLines()` (`core/terminal.ts`: newest 300 after the filters). The filters follow OctoPrint's own
  terminal filters (temperature reports and M105, plain `ok`, `busy`/`wait`, SD status and M27, the dashboard's
  M400/M114 and their answers) and are settings (`terminal.filters`, true = hidden). `lineKind()` colours sent,
  received, warning (`Unknown command`), error and OctoPrint's own lines. The view follows the end until the user
  scrolls up ("Latest" jumps back); Pause freezes the list at the last line id and counts what arrives meanwhile.
  Clear empties the local copy only. Tab, command being typed and pause live in `terminal/view.svelte.ts`.
- **Input**: an in-app `OnScreenKeyboard` (G-code layer first) opens under the command field instead of the
  full-screen text sheet, so the log stays visible; Enter sends. `terminal.submit()` normalizes the command and
  keeps a session history (newest first, no duplicates, 30 entries) shown as a list. Five quick read-only commands
  (M114, M105, M119, M503, M115) are one tap.
- **Macros**: `settings.macros` (name, icon, colour, multi-line G-code, confirm). `macroCommands()`
  (`core/macros.ts`) drops `;` comments and blank lines; `runMacro()` asks first when the macro says so and always
  while a job runs (the commands go between the file's lines). `MacroManager`/`MacroEditor` mirror the preset
  manager (generic list operations in `core/lists.ts`, `defaultMacros()` to restore); icons are names mapped to
  Lucide components in `terminal/macroLook.ts`, colours map to theme tokens.

### Leveling and mesh

- **Screen** (`src/screens/Leveling.svelte`, parts in `leveling/`): tabs Paper test / Mesh / Z offset. Moves are
  disabled while `printer.busy`; babystepping stays available. The `leveling` store reads the terminal log with
  `LevelingParser` (`core/mesh.ts`) and keeps the last mesh, "no mesh stored", leveling on/off, the probe Z
  offset, the babysteps sent and the state of the dashboard's own procedures.
- **Homing**: `printer.homedAxes` follows every sent `G28` (per axis) and `M84`/`M18` in the log, whoever sent it,
  and resets on `Disconnected`; the paper test needs X, Y and Z homed.
- **Paper test** (`PaperTest.svelte`): `levelingPoints()` (`core/leveling.ts`) puts the four corners
  `leveling.inset` mm inside the profile volume (clamped, `origin: center` aware) plus the centre; a point sends
  `G90`, lift to `leveling.zHop`, travel, `G1 Z0`, then `M400` + `M114`. "Raise nozzle" lifts again.
- **Mesh** (`MeshPanel.svelte`, `MeshMap.svelte`): Read sends `M420 V`. The parser recognises Marlin's bilinear
  grid (`Bilinear Leveling Grid:`, 3 decimals; a following subdivided grid is ignored) and the MBL report
  (`Measured points:`, 5 decimals), rows indexed by Y (0 = front), `=====`/`nan` = not probed; a report may span
  several socket messages and `Send:` lines in between are skipped. The heatmap draws the back row on top with a
  diverging scale around the mesh average (blue lower, orange higher, grey average, at least ±0.05 mm so a flat
  bed stays pale), the value in every cell, the extremes outlined and min/max/range below. Automatic `G28` + `G29`
  + `M420 V` with the `autolevel` capability; guided manual mesh with `manualMesh`: `G29 S1`, Z jogs (steps
  `leveling.meshStep`, soft endstops are loose during MBL), `G29 S2` per point, "Mesh probing done." ends it and
  reads the mesh; cancelling homes again. Save sends `M500` (with `eeprom`).
- **Z offset** (`ZPanel.svelte`): babystep `M290 Z±` (0.01/0.05 mm, `babystepping` capability, also while
  printing) with a running total; probe offset `M851` (read on opening, set with the NumPad, `zProbe`); `M500`.

### System and settings

- **Screen** (`src/screens/System.svelte`, parts in `system/`): tabs Overview / Settings / About; the tab and the
  settings section are kept across navigation (`system/view.svelte.ts`).
- **Overview** (`Overview.svelte`): `system.watch(3000)` while mounted (the `system` store polls `/local/system`
  at the pace of its fastest watcher; the status bar watches every 30 s for the network). CPU ring tone = heat
  (`cpuTempTone`, 70/80 °C) when it is worse than the load (`usageTone`, 75/90 %). OctoPrint's
  `/api/system/commands` are ordered by `systemActions()`: restart, reboot and shutdown get our own localised
  confirmations (danger when a job runs), custom/plugin commands show OctoPrint's confirmation text as plain text
  (`plainText()`). "Restart the screen" calls `/local/kiosk/restart` and reloads the page when that does nothing.
- **Power and lights**: `power` store (PSU Control: `isPSUOn` from the plugin socket message or
  `GET /api/plugin/psucontrol`, `turnPSUOn`/`turnPSUOff`; off always confirmed). Custom actions
  (`core/power.ts`, settings `customActions`) send G-code (`terminal.send`), run a system command or call
  `POST /api/plugin/<id>` with `{command, ...data}`; up to `STATUS_BAR_MAX_ACTIONS` (3) are also status bar
  buttons (56 × 48 px, the bar height). Icons and colours are the macro ones (`terminal/LookPicker.svelte`).
- **Settings** (`SettingsPanel.svelte` + `system/settings/*Section.svelte`): every control writes through
  `settings.update()` (debounced save, no Save button). Firmware lists `CAPABILITY_KEYS` with the reported value and
  an auto/on/off `Segmented` override. The extruder setup reuses the Filament screen's dialog. Reset =
  `settings.reset()` (defaults saved at once).
- **API key** (`system/actions.ts` → `changeApiKey()`): in-app keyboard → `PUT /local/apikey` → toast → page
  reload (the socket logs in again). The connection overlay offers the same button for the `noApiKey` and
  `unauthorized` reasons and drops below the dialogs (`--z-overlay`) while one is open.

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
and SD card in one call); the agent's `/local/events` stream starts at once and drives the `usb` store.
After that REST is only used on events that announce a change:

| Event | Reaction |
|---|---|
| `UpdatedFiles`, `FileAdded`, `FileRemoved`, `FolderAdded`, `FolderRemoved`, `FileDeselected`, `MetadataAnalysisFinished` | file list reload (debounced 500 ms) |
| `Connected` | reload connection and printer profile, reset the overrides; OctoPrint sends M115 itself |
| `Disconnected` | reset firmware capabilities, host prompts, overrides, head position, homing and leveling state |
| `PositionUpdate` | head position (M114 answer), ignored when a jog was sent after the last request |
| `PrintDone`, `PrintFailed`, `PrintPaused`, `PrintResumed`, `PrintCancelled`, `PrintStarted` | print notices |
| `SettingsUpdated` / `PrinterProfileModified` | reload settings / profile |
| `FirmwareData` | firmware name |

| Store | Source | Notes |
|---|---|---|
| `connection` | `/local/health`, socket status, `connected`, `/api/connection` | connect/disconnect |
| `printer`, `job` | `current.state`, `job`, `progress`, `currentZ`, `PositionUpdate` | `phase` derived from the flags, `busy` while a job exists, ETA; head `position`, jog (optimistic), home, motors off; `homedAxes` from the sent `G28`/`M84` lines |
| `temperatures` | `history.temps` / `current.temps` | `TemperatureHistory` (typed arrays, 2048 samples ≈ 30 min+); `revision` bumps on new samples |
| `terminal` | `history.logs` / `current.logs` | last 1000 lines, typed-command history, `submit()`, `clear()` |
| `leveling` | `Recv:` log lines (`LevelingParser`) | last mesh, no-mesh flag, leveling on/off, probe Z offset, babystep total, paper test point, manual mesh run |
| `capabilities` | `Cap:` lines of the M115 answer in the log + settings overrides | known only with the `FIRMWARE_NAME` line (a report cut by `history` is not); sends M115 once if unknown |
| `prompt` | `//action:` lines of live logs (not `history`, to avoid replaying answered prompts) | answers via the Action Command Prompt plugin when the firmware reported `PROMPT_SUPPORT`, else `M876 S<n>` |
| `files` | `/api/files` | local tree and SD card list, `find()`, `thumbnailFor()`, select/delete, SD init/refresh/release |
| `usb` | `/local/events`, `/local/usb` | mounts, stick files, import progress |
| `server` | `/api/settings`, `/api/printerprofiles`, `plugin` messages | plugin detection from the `plugins` keys of the settings; `webcam` source; DisplayLayerProgress values (`/plugin/DisplayLayerProgress/values` once, then the `DisplayLayerProgress-websocket-payload` messages) |
| `tune` | `Send:`/`Recv:` log lines | fan %, feed rate %, flow % (see Home) |
| `notices` | print events | current big notice, print-done beep |
| `idle` | touches/keys, clock, settings | `active` / `screensaver` / `off`, wake-up touch swallowing |
| `nav`, `clock` | URL hash / timer | current screen; wall clock ticking every second |
| `events` | `event` messages + `host:prompt`, `host:promptClosed`, `host:notification`, `host:action` | `events.on(type, handler)`, last 50 kept |
| `settings` | `/local/settings` | migrated on load, saved 400 ms after `settings.update()` |
| `system` | `/local/system`, `/api/system/commands` | host info polled only while watched (`watch(ms)` returns the stop function), `network` summary, ordered system commands |
| `power` | `plugin` messages of `psucontrol`, `/api/plugin/psucontrol` | PSU state, `set(on)` |

Implementation note: keys added to a deep `$state` proxy are not picked up by `in` checks inside an already
computed `$derived`; stores that are read through such checks use `$state.raw` and replace the object.

## Development environment

`dev/docker-compose.yml` (project `floppyoctotouch`):

| Service | Image | Notes |
|---|---|---|
| `octoprint-init` | `octoprint/octoprint:1.11.8` | one-shot: merges `dev/octoprint/config.yaml` into the image's config (first start only), copies `dev/sample-gcode` (plus `examples/` folder and a virtual SD file), creates the admin user, registers `OCTOPRINT_API_KEY` as an application key |
| `octoprint` | `octoprint/octoprint:1.11.8` | OctoPrint on port 5000 (haproxy on 80 is not used), Virtual Printer with SD, volume `octoprint-data` |
| `webcam` | `octoprint/octoprint:1.11.8` (for its ffmpeg) | `dev/fake-webcam/server.py`: MJPEG test pattern on 8080 (`/?action=stream`, `/?action=snapshot`) |
| `agent` | `dev/docker/agent.Dockerfile` (Python 3.11) | source mounted, hot reload with `watchfiles` (polling), `dev/fake-usb` mounted as `/media/usb0` (eject command `none`), OctoPrint's volume read-only for the thumbnails (`FOT_UPLOADS_DIR`), webcam → `http://webcam:8080`, display backend `none` |
| `frontend` | `dev/docker/frontend.Dockerfile` (Node 24) | Vite dev server on 5173 proxying to the agent; `node_modules` in a named volume |
| `agent-test`, `frontend-test`, `build`, `playwright`, `shellcheck` | profile `tools` | run on demand with `docker compose run --rm <service>` |

All published ports bind to `127.0.0.1`.
