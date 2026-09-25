# CLAUDE.md — FloppyOctoTouch

Touch dashboard for OctoPrint (Raspberry Pi 4 + 7" 1024×600 HDMI touch, Chromium kiosk).
Svelte 5 + TS + Vite frontend, Python 3.11 aiohttp agent that serves the app and proxies OctoPrint.

## Start of every session

The user always starts with: `Leggi docs/PLAN.md ed esegui la procedura della sezione 0.`
Follow **section 0 of `docs/PLAN.md`**: pick the session from "Stato avanzamento" (`[~]` = interrupted, else the
first `[ ]`), mark it `[~]` with the date, execute its block in section 4, close with the section 3 checklist,
then **stop** — never start the next session.

## Conventions

- Chat and `docs/PLAN.md` in **Italian**; code, comments, commits, README, CHANGELOG, `docs/ARCHITECTURE.md`
  and this file in **English**.
- Commits: Conventional Commits, **max 3 lines total**, always ending with the co-author trailer:
  ```
  feat(agent): add reverse proxy for /api and /sockjs

  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```
  (update the trailer if the model changes). Git is **local only**: no remote, no push.
- Versioning: SemVer, session N closes with version `0.N.0` and tag `v0.N.0` (session 10 → `1.0.0`).
  Keep `frontend/package.json` and `agent/pyproject.toml` versions aligned; add a CHANGELOG entry.
- **No tooling on the Windows host**: Node, npm, Python, pytest, ruff, Playwright, shellcheck run only in
  Docker (even though Node/Python exist on the PC). Never `npm install` / `pip install` on the host.
- UI: touch targets ≥ 56 px, no hover-only interactions, confirmations for destructive actions, every string
  through i18n (en + it), everything offline (no CDN), check each changed screen at 1024×600 with Playwright.
- Performance budget on the Pi: JS bundle < ~250 KB gzip, no REST polling where the socket provides data.
- Do not invent OctoPrint APIs: check docs.octoprint.org and verify against the dev container.

## Commands (from the repo root)

```sh
docker compose -f dev/docker-compose.yml up -d               # OctoPrint :5000, agent :8765, Vite :5173
docker compose -f dev/docker-compose.yml run --rm agent-test     # ruff check + ruff format --check + pytest
docker compose -f dev/docker-compose.yml run --rm frontend-test  # svelte-check + tsc (node config) + vitest
docker compose -f dev/docker-compose.yml run --rm build          # frontend/dist
docker compose -f dev/docker-compose.yml run --rm playwright     # smoke test + screenshots -> dev/screenshots
docker compose -f dev/docker-compose.yml run --rm shellcheck
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
agent/floppyoctotouch_agent/   config.py, proxy.py, settings.py, app.py, __main__.py; tests in agent/tests
frontend/src/lib/api/          http.ts, octoprint.ts (typed REST), agent.ts (/local/*), socket.ts, types.ts
frontend/src/lib/core/         pure logic + tests: capabilities (M115), hostActions, tempHistory, files,
                               printerState (phase, tone, plugins), settings (schema/defaults/migrations, accent),
                               format, gauge (ring geometry, heater tone), numpad, keyboard (layouts, editing)
frontend/src/lib/stores/       *.svelte.ts singletons (connection, printer/job, temperatures, files, terminal,
                               events, capabilities, prompt, server, settings, nav, clock) + dataLayer.ts (socket wiring)
frontend/src/lib/i18n/         en.json, it.json, index.svelte.ts (t(), setLocale())
frontend/src/lib/ui/           design system: tokens.css, components (Button, Card, Modal, NumPad, OnScreenKeyboard,
                               RingGauge, …), dialogs.svelte.ts / toast.svelte.ts services, press.ts, theme.ts, kiosk.ts
frontend/src/shell/            Shell, Sidebar, StatusBar, ConnectionOverlay, PrinterOverlay, screens.ts (registry)
frontend/src/screens/          Home (first version), System (temporary), Placeholder; dev/Gallery + dev/Debug (dev only)
frontend/preview.html          1024×600 frame around the app (also in the production build)
dev/docker-compose.yml         dev stack + tool services; dev/docker/*.Dockerfile
dev/octoprint/                 seed config.yaml + init.sh for the OctoPrint volume
dev/e2e/screenshot.mjs         Playwright smoke test/screenshots (own package.json, Playwright 1.63.0);
                               accents.mjs = screenshots of every accent variant
dev/sample-gcode/              samples with PrusaSlicer PNG/QOI and OrcaSlicer thumbnails (dev/tools/make_sample_gcode.py)
dev/fake-usb/                  mounted read-only in the agent as /media/usb0
deploy/, scripts/              placeholders (session 9)
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
- In the Bash tool, long multi-file heredocs can fail to parse: prefer the Write tool for new files.

## Current state

v0.3.0 (session 3): design system (tokens, Inter + Lucide bundled, components, dialogs/toast services),
app shell (sidebar, status bar, connection/printer overlays, host prompt dialog), first Home with ring gauges,
accent teal by default (amber/indigo selectable, `accent` setting), `?kiosk=1` hardening, dev pages
`/ui-gallery` and `/debug`. Next: session 4 (Home, print control, screensaver, notifications).
See `docs/PLAN.md` for details and notes between sessions.
