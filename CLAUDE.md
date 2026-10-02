# CLAUDE.md — FloppyOctoTouch

Touch dashboard for OctoPrint (Raspberry Pi 4 + 7" 1024×600 HDMI touch, Chromium kiosk).
Svelte 5 + TS + Vite frontend, Python 3.11 aiohttp agent that serves the app and proxies OctoPrint.

## Start of every session

The user always starts with: `Leggi docs/PLAN.md ed esegui la procedura della sezione 0.`
Follow **section 0 of `docs/PLAN.md`**: pick the session from "Stato avanzamento" (`[~]` = interrupted, else the
first `[ ]`), mark it `[~]` with the date, execute its block in section 4, close with the section 3 checklist,
then **stop** — never start the next session.

## Conventions

- **TOP RULE — no personal data in the repo (it is public).** Never write data from the user's real setup (Pi user
  name, hostname, IP/MAC addresses, SSID/WiFi passwords, API keys, serial numbers, emails, Windows paths, pasted
  terminal output) into code, comments, tests, fixtures, commits, tags, `docs/PLAN.md`, this file, README, CHANGELOG,
  screenshots or the tarball. Use generic placeholders (`pi`, `octopi.local`, `192.168.1.x`, the dev key); check real-Pi
  screenshots (System shows IP/SSID) and `git diff --cached` before every commit. Only exception: the project
  identity already chosen (author "Filippo Castellan", git identity `FloppyO1`, repository URL).
- Chat and `docs/PLAN.md` in **Italian**; code, comments, commits, README, CHANGELOG, `docs/ARCHITECTURE.md`
  and this file in **English**.
- Commits: Conventional Commits, **max 3 lines total**, always ending with the co-author trailer:
  ```
  feat(agent): add reverse proxy for /api and /sockjs

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
  (update the trailer if the model changes). Remote `github` = `https://github.com/FloppyO1/floppy-octopi-touch`,
  managed by the user: Claude commits and tags locally and **never pushes**.
- Versioning: SemVer, session N closes with version `0.N.0` and tag `v0.N.0` (exceptions: session 9b → `0.9.1`; the **final session** → `1.0.0`).
- Tests on the real Pi never block a session: they go to the list of the "final session" in `docs/PLAN.md`, which
  always stays the last one (new sessions are added before it).
  Keep `frontend/package.json` and `agent/pyproject.toml` versions aligned; add a CHANGELOG entry.
- **No tooling on the Windows host**: Node, npm, Python, pytest, ruff, Playwright, shellcheck run only in
  Docker (even though Node/Python exist on the PC). Never `npm install` / `pip install` on the host.
- UI: touch targets ≥ 56 px, no hover-only interactions, confirmations for destructive actions, every string
  through i18n (en + it), everything offline (no CDN), check each changed screen at 1024×600 with Playwright.
- Performance budget on the Pi: JS bundle < ~250 KB gzip, no REST polling where the socket provides data.
- Do not invent OctoPrint APIs: check docs.octoprint.org and verify against the dev container.

## Commands (from the repo root)

```sh
docker compose -f dev/docker-compose.yml up -d               # OctoPrint :5000, agent :8765, Vite :5173, fake webcam
docker compose -f dev/docker-compose.yml run --rm agent-test     # ruff check + ruff format --check + pytest
docker compose -f dev/docker-compose.yml run --rm frontend-test  # svelte-check + tsc (node config) + vitest
docker compose -f dev/docker-compose.yml run --rm build          # frontend/dist
docker compose -f dev/docker-compose.yml run --rm playwright     # smoke test + screenshots -> dev/screenshots
docker compose -f dev/docker-compose.yml run --rm -e ONLY=terminal,leveling playwright   # only some steps
docker compose -f dev/docker-compose.yml run --rm shellcheck
docker compose -f dev/docker-compose.yml run --rm release          # release/floppyoctotouch-<version>.tar.gz + .sha256
docker compose -f dev/docker-compose.yml run --rm deploy-test      # installer test (needs the tarball in release/)
docker compose -f dev/docker-compose.yml down -v             # wipe OctoPrint/agent data (re-seed)
```

- Auto-format the agent: `docker compose -f dev/docker-compose.yml run --rm agent-test sh -c "ruff format . && ruff check --fix ."`.
- Add an npm dependency: `docker compose -f dev/docker-compose.yml run --rm frontend-test npm install -D <pkg>`.
- One-off Python in Docker with a bind mount from Git Bash: prefix `MSYS_NO_PATHCONV=1` and use `$(pwd -W)`,
  otherwise MSYS rewrites `/paths` (this also affects `-e VAR=/path` arguments).
- Dev credentials: OctoPrint `admin` / `admin`; API key from `dev/.env` (`OCTOPRINT_API_KEY`, default
  `floppyoctotouch-dev-api-key-not-secret`), registered automatically by `octoprint-init`.

## Layout

```
agent/floppyoctotouch_agent/   config.py, proxy.py (OctoPrint + /webcam), display.py (wlr-randr), settings.py, app.py,
                               commands.py (run_command for external programs), system.py (/proc, /sys, nmcli),
                               control.py (/local/system, /local/apikey, /local/kiosk/restart),
                               watchdog.py (restarts the kiosk when its page is gone),
                               thumbnails.py (G-code thumbnails + disk cache), usb.py (sticks, import, watcher),
                               files.py (/local/thumbnail, /local/objects, /local/usb*, /local/events SSE),
                               objects.py (labelled objects of a G-code file + footprint, disk cache),
                               __main__.py; tests in agent/tests
frontend/src/lib/api/          http.ts, octoprint.ts (typed REST), agent.ts (/local/*), socket.ts, types.ts
frontend/src/lib/core/         pure logic + tests: capabilities (M115), hostActions, tempHistory, files,
                               printerState (phase, tone, plugins), settings (schema/defaults/migrations, accent),
                               format, gauge (ring geometry, heater tone), numpad, keyboard (layouts, editing),
                               tune (fan/M220/M221 from the log), layer (DLP), webcam, idle, notices, presets,
                               lists (move/upsert/remove by id), move (jog direction + volume limits), filament
                               (load/unload/purge G-code), chart, terminal (filters, line kinds, history), macros,
                               mesh (LevelingParser: M420 V / G29 reports, stats, colour scale), leveling (paper
                               test points, G-code, G28/M84 detection), system (usage/heat tones, network
                               summary, system command order, HTML confirm → text), power (PSU state, custom
                               actions: validation, sanitising), objects (cancel method, object list, bed geometry),
                               heatup (blocking M109/M190 waits from the log, M108 override commands)
frontend/src/lib/stores/       *.svelte.ts singletons (connection, printer/job, temperatures, files, usb, terminal,
                               events, capabilities, prompt, server, settings, nav, clock, tune, notices, idle,
                               leveling, system (polled only while watched), power (PSU Control), objects (cancel objects))
                               + dataLayer.ts (socket wiring)
frontend/src/lib/i18n/         en.json, it.json, index.svelte.ts (t(), setLocale())
frontend/src/lib/ui/           design system: tokens.css, components (Button, Card, Modal, NumPad, OnScreenKeyboard, Thumb,
                               RingGauge, SliderDialog, Segmented, WebcamView, …), dialogs.svelte.ts / toast.svelte.ts services,
                               press.ts, theme.ts, kiosk.ts, fit.ts (scales the app on screens other than 1024×600)
frontend/src/shell/            Shell, Sidebar, StatusBar, ConnectionOverlay, PrinterOverlay, Screensaver, NoticeDialog,
                               screens.ts (registry)
frontend/src/screens/          Home + home/ (JobView, IdleView, Preview, StatusRows, ObjectsDialog, actions.ts), Files + files/
                               (view state, items, FileGrid, FileDetail, UsbDetail, ImportProgress, actions.ts),
                               Temperature + temperature/ (HeaterCard, TempChart = uPlot, PresetManager/Editor),
                               Move + move/actions.ts, Filament + filament/ (flow.svelte.ts wizard state, Wizard,
                               ManualPanel, FilamentSetup), Terminal + terminal/ (view state, Console, MacroGrid,
                               MacroManager/Editor, macroLook.ts, actions.ts), Leveling + leveling/ (view state,
                               PaperTest, MeshPanel, MeshMap heatmap, ZPanel, actions.ts), heaterTarget.ts,
                               System + system/ (view state, Overview, SettingsPanel + settings/*Section, About,
                               ActionManager/Editor, actions.ts also used by the status bar and the connection
                               overlay); terminal/LookPicker (icon + colour, macros and actions); dev/Gallery +
                               dev/Debug (dev only)
frontend/preview.html          1024×600 frame around the app (also in the production build)
dev/docker-compose.yml         dev stack + tool services; dev/docker/*.Dockerfile
dev/octoprint/                 seed config.yaml + init.sh for the OctoPrint volume
dev/e2e/screenshot.mjs         Playwright smoke test/screenshots (own package.json, Playwright 1.63.0);
                               accents.mjs = screenshots of every accent variant, targets.mjs = touch targets < 56 px
dev/sample-gcode/              samples with PrusaSlicer PNG/QOI and OrcaSlicer thumbnails (dev/tools/make_sample_gcode.py)
                               + 3dbenchy_prusaslicer.gcode (real export, Tatara A8 profile, 300x300 PNG, ~45 min)
                               + four-objects_prusaslicer.gcode / four-objects-m486_prusaslicer.gcode (cancel objects)
dev/fake-usb/                  mounted read-only in the agent as /media/usb0, writable in playwright (/fake-usb)
dev/fake-webcam/server.py      MJPEG test pattern (ffmpeg testsrc) on :8080, service `webcam`
deploy/                        install.sh, update.sh, uninstall.sh, lib/common.sh, systemd/*.service.in, pam/, udev/,
                               sudoers/, kiosk/ (kiosk.sh + kiosk.env), usb/usb-mount.sh (udev + systemd-mount)
scripts/build-release.sh       release tarball (service `release`) -> release/ (only the latest, committed)
docs/github/release.yml        suggested GitHub Action (inactive until copied to .github/workflows/): draft release at a tag
dev/deploy-test/               installer test on Debian bookworm (run.sh, fake_octoprint.py, drive.py = answers the
                               questions on a fake terminal; service `deploy-test`)
```

## Gotchas

- The `octoprint/octoprint` image already ships a `config.yaml` in the volume: `init.sh` deep-merges the seed
  once (marker `.floppyoctotouch-seeded`). Changing `dev/octoprint/config.yaml` requires `down -v`.
  The rest of `init.sh` (samples, API key) runs at every `up`, or on demand with `run --rm octoprint-init`.
- OctoPrint in the image listens on 5000 (haproxy on 80 is unused). Healthcheck uses `/robots.txt`.
- Windows bind mounts do not deliver inotify events: Vite and watchfiles use polling (already configured).
- Vite only accepts known hosts: `frontend` is whitelisted for the Playwright container.
- The Playwright npm version in `dev/e2e/package.json` must match the `mcr.microsoft.com/playwright` image tag.
- The Virtual Printer reports a `chamber` entry with `null` values: the UI hides heaters without readings.
- Virtual Printer SD card: files whose name is already 8.3 (e.g. `CUBE.GCO`) are silently dropped from M20
  (bug in its name map); use long names in `virtualSd/`. `!!DEBUG:action_custom <action> <params>` makes it emit
  `//action:` lines (host prompts/notifications). OctoPrint only lists SD files after an SD refresh (M20).
- `-e VAR=/path` in `docker compose run` from Git Bash is rewritten by MSYS into a Windows path: prefix
  `MSYS_NO_PATHCONV=1` (this is how stray files ended up under `dev/e2e/C:/...` in session 1).
- Svelte 5: keys added to a deep `$state` proxy are not seen by `in` checks inside an already computed
  `$derived`. Use `$state.raw` and replace the object (see `capabilities.svelte.ts`).
- OctoPrint `refs` URLs are absolute to its own host (`http://octoprint:5000/...`): never use them.
- The Action Command Prompt plugin drops prompt answers unless the firmware reported `Cap:PROMPT_SUPPORT`;
  `prompt.answer()` then falls back to `M876 S<n>`.
- In dev the stores are exposed as `window.__fot` (handy for Playwright one-off checks); not in the production
  build, so the smoke test skips the parts that need it when `BASE_URL` is the agent.
- Touch feedback uses the `pressable` attachment (`data-pressed`): style it as `.x:global([data-pressed])`,
  a plain `[data-pressed]` selector is dropped by Svelte as unused.
- Icons: import each one as `@lucide/svelte/icons/<name>` (never the barrel). Dialogs: use `dialogs.*()` and
  `toast.show()`, never native inputs/`confirm()`. Every new screen goes into `src/shell/screens.ts`.
- The agent dev image stores the package version at build time: after a version bump run
  `docker compose -f dev/docker-compose.yml build agent` (otherwise `/local/health` reports the old version).
- Screenshots can fail with `EINVAL` on the Windows bind mount when the PNG is open in the IDE: just rerun.
- Windows may reserve port 5173 (`bind: … autorizzazioni`), so `up`/`playwright` cannot start `frontend`. Run Vite
  inside the Docker network only, then Playwright without deps:
  `docker compose -f dev/docker-compose.yml run -d --rm --no-deps --use-aliases --name fot-vite frontend`, then
  `… run --rm --no-deps -e ONLY=screensaver playwright`, finally `docker stop fot-vite`. Or test the agent build:
  `run --rm build`, then `-e BASE_URL=http://agent:8765` (DEV-only steps are skipped there).
- cage (wlroots) on the Pi refuses `wlr-randr --on` together with a mode, and `--on` alone picks the first mode of
  the list (800x450 on the 7" screen): the agent switches the output on, then sets the mode in a second call.
- In the Bash tool, long multi-file heredocs can fail to parse: prefer the Write tool for new files.
- Settings are saved 400 ms after `settings.update()`: a Playwright step that changes them and then navigates
  must `await window.__fot.settings.flush()`, or the change (e.g. a 3 s screensaver timeout) is lost or, worse,
  left behind for the next run. Dev settings persist in the `agent-data` volume.
- Dialogs keep their DOM during the outro transition: in Playwright wait for `[data-testid=…]` to be detached
  before reopening the same dialog, or locators match two of them.
- The idle store listens on `window` in the capture phase and swallows the wake-up tap: to trigger the
  screensaver in tests use `window.__fot.idle.sleep()` / `sleep('off')`, any click wakes it.
- OctoPrint logs every sent line as `Send: …` in `current.logs`; fan/feed rate/flow come only from there
  (`core/tune.ts`). The Virtual Printer prints the samples in about a minute and supports `G4` dwells.
- An `<img>` with `height: 100%` inside an auto-sized grid row ignores the height: position it absolutely
  (see `WebcamView`).
- MJPEG in Chromium: `load` fires at the first frame, then nothing, whether the stream ends, breaks or stalls;
  only a cut connection shows (`naturalWidth` 0). The agent cuts ended/silent webcam streams and `WebcamView`
  polls `naturalWidth`. Vite's dev proxy turns the cut into a clean end: test webcam recovery against the agent
  build (`BASE_URL=http://agent:8765`), e.g. with `docker compose … restart webcam` / `pause webcam`.
- The Pi 4 with 8 GB under OctoPi runs a 32-bit kernel (`arm_64bit=0`): only ~768 MB of lowmem, 512 MB of it CMA,
  so the kernel can hit the OOM killer with GBs free (it killed Chromium's renderer). The kiosk watchdog
  (`kiosk_watchdog_s`) restarts the kiosk; `arm_64bit=1` (64-bit kernel, 32-bit userland) removes the limit.
- Files copied into OctoPrint's uploads while it runs (e.g. by `init.sh` after a sample changed) are not analysed
  until a restart, and `init.sh` never overwrites: replace a sample by deleting it and uploading it through
  `/api/files/local` (then OctoPrint analyses it at once).
- Fake USB stick in dev: the agent sees `dev/fake-usb` read-only; "Eject" only hides it until the folder mtime
  changes (adding/removing a file = a new insertion event). Mount changes are polled every 2 s (no inotify).
- The agent reads thumbnails straight from OctoPrint's uploads (`FOT_UPLOADS_DIR`, volume mounted `:ro`); the
  disk cache is keyed by path + size + mtime, so a re-uploaded file gets a fresh thumbnail.

- Virtual Printer and moves: it applies `G90`/`G91` at once but buffers `G0`/`G1`, and reads the relative flag only
  when its buffer thread runs the move: the `G90` that OctoPrint sends right after every jog sometimes turns that
  jog into an absolute move, whatever the pause between jogs. It also answers `M114` immediately (hence `M400`
  before every `M114` in the app). Real Marlin is sequential. In Playwright, only jog from 0 or set a known position
  with `G92` + `read-position` first (see the move step).
- OctoPrint fires `PositionUpdate` (x, y, z, e, t, f, reason) for every position report, also the automatic ones:
  with `Cap:AUTOREPORT_POS` it sends `M154 S5` itself. So the filament wizard ends its steps on an echoed marker
  after `M400` (`M118 E1 FOT-DONE <token>` → `Recv: echo:FOT-DONE <token>`, event `fot:marker`), never on the
  next `PositionUpdate`. M118 is always built into Marlin 2.1; the Virtual Printer answers it too.
- Heat-up waits: OctoPrint force-sends `M108` (in `serial.emergencyCommands`) ahead of the line waiting for `ok` only
  when the firmware reported `Cap:EMERGENCY_PARSER:1`; API commands sent while printing go before the job's next
  lines. The Virtual Printer heats at once and ignores M108: the smoke test fakes the wait with
  `window.__fot.temperatures.ingestLog(['Send: N7 M109 S200*1'])` and checks the request with `page.route`.
- The display lines in `config.txt` (`hdmi_*`) and `video=` in `cmdline.txt` do nothing with KMS on the 7" screen
  (1024×600 is not in its EDID): the installer adds them only with `--display-config`; the mode comes from
  `wlr-randr` (kiosk.sh / agent, System → Settings → Screen).
- Dialogs survive a hash-only navigation: a Playwright script that visits several screens should go through
  `about:blank` (see `dev/e2e/targets.mjs`).
- In the Bash tool, `perl -pe` replacements interpolate `@60`-like text as arrays and `$1`-like text: check the diff,
  or use the Edit tool for anything with `@`/`$`.
- A Card's `{#snippet actions()}` shadows a script variable called `actions` inside the Card: name it otherwise.
- `Wizard.svelte` and a `wizard.svelte.ts` in the same folder clash (case-insensitive file names): that is why
  the wizard state lives in `filament/flow.svelte.ts`.
- Fake firmware output: `!!DEBUG:send <line>` makes the Virtual Printer send `<line>` back (do not rely on
  leading spaces or empty lines). The smoke test injects mesh reports and "Mesh probing done." this way.
  The Virtual Printer has no mesh, no `G29`, no `M290`, and its `M851` ignores negative values.
- Firmware features the Virtual Printer lacks (manual mesh, probe, babystepping) are tested by forcing capability
  overrides in the stored settings (`PUT /local/settings`, then reload): see `setOverrides()` in the smoke test,
  which also puts them back to `auto`.
- Values parsed from the `history` log replay may be stale (e.g. an old `M851` answer): screens that show firmware
  state ask again when they open. Capabilities count as known only after a `FIRMWARE_NAME` line.
- Vite reads `frontend/package.json` only when it starts: after a version bump restart the `frontend` service
  (`docker compose -f dev/docker-compose.yml restart frontend`), or About shows the old version.
- Escape closes every stacked modal at once (each `Modal` listens on the window): in Playwright close an editor
  opened from a manager with its Cancel button.
- `waitText()` in the smoke test serialises its predicate: it cannot see outer variables, build it with
  `new Function(...)` (see the API key check).
- The dev OctoPrint has `echo` reboot/shutdown commands and a custom `lights` system command (seed + applied once
  through `/api/settings`); the smoke test still intercepts `POST /api/system/commands/core/*`. PSU Control is
  not installed: the smoke test fakes its `plugins` key in `/api/settings` and its SimpleApi with `page.route`.
- Cancel Objects plugin (0.6.4, installed by `init.sh` in dev, by `install.sh` on the Pi through the Plugin Manager
  API, then OctoPrint must restart): it rewrites G-code **when a file is uploaded** (`@Object` / `@Objectstop`), so
  files uploaded before it was installed cannot be cancelled (the app shows an "upload it again" hint). Its SimpleApi
  is `POST /api/plugin/cancelobject` (`objlist`, `cancel` with `cancelled: <id>`, ids by first appearance in the
  file); the plugin list is `GET /plugin/pluginmanager/plugins` (not under `/api`). Marlin `M486` has no answer and
  M115 does not report it: the `cancelObjects` capability is a manual override (smoke test: `setOverrides()`).
- M486 state comes only from live `Send: M486 …` lines, never from the `history` replay (it can hold an old
  print's `M486 P`). `M486 A<name>` must not be parsed for parameters: names like "copy 1" contain a `C`.
- The agent's `/local/apikey` writes the key into `config_path` (`FOT_CONFIG`, default
  `~/.config/floppyoctotouch/config.json`); in Docker `FOT_API_KEY` wins again at the next start.
- Deploy scripts: after changing anything in `deploy/` rebuild the tarball (`run --rm release`) before
  `deploy-test`, which only installs what is in `release/`. The release tarball is committed: regenerate it at every
  version bump (the build deletes older ones). `deploy-test` has no systemd as PID 1: units are enabled, never
  started (cage, logind, udev and wlr-randr are only verifiable on the Pi).
- Shell scripts that source `deploy/lib/common.sh` use `# shellcheck source=SCRIPTDIR/lib/common.sh` (shellcheck
  runs from the repo root with `-x`).
- Installer questions: only through `ask_*` in `common.sh` (they print to `/dev/tty` and end with `] ` or `: `, which
  is how `dev/deploy-test/drive.py` spots them) and only before `==> Installing packages` (the test fails otherwise).
  A new question means new `--answers` entries in `dev/deploy-test/run.sh`. The scripts re-exec themselves with
  `sudo` (`ensure_root`), so parse the arguments before calling it.

## Current state

v0.11.0 (session 11 closed formally: cancel objects — agent `/local/objects`, Home "Objects" dialog, M486 or the
Cancel Objects plugin, installer question — already shipped in 0.10.0, no code changes). Next: session 12 (date,
time and time zone of the Pi; motors/heaters/fan off after Stop via `afterPrintCancelled`), then the final session.
v0.10.0 (session 10, fixes from the Pi and polish): a heater target changed during a blocking heat-up applies at
once with EMERGENCY_PARSER (new wait + M108), filament wizard with Change (unload + load), cancel turning the hotend
off, "cool down at the end" (settings v8) and an `M118` end marker; installer without the display question (lines
only with `--display-config`), 32-bit kernel warning, message before apt; the app scales on other screen sizes;
uPlot lazy-loaded (main bundle 129 KB gzip); kiosk watchdog, webcam recovery, resolution setting and the OctoPi 1.1.0
fixes. v0.9.x: one-command installer (sudo re-exec, questions first, agent + kiosk units with cage + Chromium on
tty1, read-only USB automount, update/uninstall, bookworm installer test, now 133 checks), running on a real Pi.
Before: every screen (sessions 3-8). All the tests on the Pi (hardware checklist, cancel objects with the printer,
the session 10 fixes) are in the final session (v1.0.0).
Repository: `https://github.com/FloppyO1/floppy-octopi-touch` (README clone commands, About screen).
See `docs/PLAN.md` for details and notes between sessions.
