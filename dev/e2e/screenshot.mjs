// Smoke test + screenshots at the target resolution (1024x600).
// Run with: docker compose -f dev/docker-compose.yml run --rm playwright
// RECONNECT_TEST=1: also waits for the socket to drop and come back (restart OctoPrint meanwhile).
import { unlinkSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://frontend:5173';
const OUT = process.env.SCREENSHOT_DIR ?? '/screenshots';
const VIEWPORT = { width: 1024, height: 600 };
// The production build (served by the agent) has no dev pages (/debug, /ui-gallery).
const DEV = !/:8765/.test(BASE_URL);

const browser = await chromium.launch();
let failed = false;

const text = (page, id) => page.textContent(`[data-testid=${id}]`);
const waitText = (page, id, predicate, timeout = 30_000) =>
  page.waitForFunction(
    ([sel, src]) => new Function('t', `return (${src})(t)`)(document.querySelector(sel)?.textContent ?? ''),
    [`[data-testid=${id}]`, predicate.toString()],
    { timeout },
  );
const api = (page, method, path, body) =>
  page.evaluate(
    async ([method, path, body]) =>
      (
        await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        })
      ).status,
    [method, path, body],
  );
const log = (label, value) => console.log(`${label.padEnd(18)}:`, value);

async function debugPage(page) {
  // Data layer (dev page /debug): live data, capabilities, files, prompt, persisted language.
  await page.goto(`${BASE_URL}/debug`);
  await waitText(page, 'socket-status', (t) => t === 'connected', 60_000);
  await page.waitForSelector('[data-testid=temperatures]', { timeout: 30_000 });
  const samples = await text(page, 'temp-samples');
  await waitText(page, 'temp-samples', new Function(`return (t) => t !== ${JSON.stringify(samples)}`)());
  await waitText(page, 'firmware-name', (t) => t.startsWith('Marlin'));
  await waitText(page, 'capabilities', (t) => t.includes('eepromyes'));
  await waitText(page, 'files-summary', (t) => /local [1-9]/.test(t));
  for (const id of ['octoprint-version', 'printer-phase', 'firmware-name', 'files-summary', 'temp-samples']) {
    log(id, (await text(page, id))?.trim());
  }
  log('plugins', (await text(page, 'plugins'))?.replace(/\s+/g, ' ').trim());

  await page.getByRole('button', { name: 'IT', exact: true }).click();
  await page.waitForTimeout(600); // debounced save
  await waitText(page, 'settings-status', (t) => t.startsWith('ready'));
  await page.reload();
  await waitText(page, 'socket-status', (t) => t === 'connesso', 60_000);
  log('language', 'persisted (it)');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(600);
  await waitText(page, 'settings-status', (t) => t.startsWith('ready'));
  await page.screenshot({ path: `${OUT}/debug.png` });

  if (process.env.RECONNECT_TEST) {
    log('reconnect', 'restart OctoPrint now…');
    await waitText(page, 'socket-status', (t) => t !== 'connected', 120_000);
    await waitText(page, 'socket-status', (t) => t === 'connected', 120_000);
    const before = await text(page, 'temp-samples');
    await waitText(page, 'temp-samples', new Function(`return (t) => t !== ${JSON.stringify(before)}`)());
    log('reconnect', 'socket back, temperatures flowing');
  }
}

async function shell(page) {
  await page.goto(`${BASE_URL}/#/home`);
  await page.waitForSelector('[data-testid=gauge-hotend]', { timeout: 60_000 });
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  await page.waitForSelector('[data-testid=printer-overlay]', { state: 'detached', timeout: 30_000 });
  await waitText(page, 'status-phase', (t) => t.includes('Ready'));
  await waitText(page, 'status-temps', (t) => /\d+°/.test(t));
  log('status bar', (await text(page, 'status-temps'))?.replace(/\s+/g, ' ').trim());
  await page.waitForTimeout(700); // gauge transitions
  await page.screenshot({ path: `${OUT}/home.png` });

  // Heater target: NumPad, then the confirmation above the 250°C threshold.
  await page.getByTestId('gauge-hotend').click();
  await page.waitForSelector('[data-testid=numpad]');
  for (const digit of ['2', '6', '0']) await page.getByRole('button', { name: digit, exact: true }).click();
  await waitText(page, 'numpad-display', (t) => t.startsWith('260'));
  await page.screenshot({ path: `${OUT}/numpad.png` });
  await page.getByTestId('numpad-ok').click();
  await page.waitForSelector('[data-testid=confirm-dialog]');
  await page.waitForTimeout(400); // numpad out / confirm in transitions
  await page.screenshot({ path: `${OUT}/confirm.png` });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForSelector('[data-testid=confirm-dialog]', { state: 'detached' });
  log('numpad', '260°C asked for confirmation, cancelled');

  // Every screen of the sidebar renders.
  for (const id of ['files', 'temperature', 'move', 'filament', 'terminal', 'leveling', 'system']) {
    await page.getByTestId(`nav-${id}`).click();
    await page.waitForSelector(`[data-testid=screen-${id}]`);
  }
  await page.getByTestId('system-tab-settings').click();
  await page.getByTestId('lang-it').click();
  await waitText(page, 'status-phase', (t) => t.includes('Pronta'));
  await page.screenshot({ path: `${OUT}/settings-general-it.png` });
  await page.getByTestId('lang-en').click();
  log('screens', 'all 8 rendered, language switch ok');

  await page.getByTestId('nav-home').click();
  if (DEV) await hostPrompt(page);

  // Printer disconnected: overlay with the Connect form, then reconnect from it.
  await api(page, 'POST', '/api/connection', { command: 'disconnect' });
  await page.waitForSelector('[data-testid=printer-overlay]', { timeout: 15_000 });
  await waitText(page, 'printer-port', (t) => t.includes('VIRTUAL'), 10_000);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/printer-disconnected.png` });
  await page.getByTestId('printer-connect').click();
  await page.waitForSelector('[data-testid=printer-overlay]', { state: 'detached', timeout: 30_000 });
  log('printer overlay', 'shown when disconnected, reconnected from it');
}

// Marlin host prompt (dev only: needs window.__fot to force prompt support).
async function hostPrompt(page) {
  await page.evaluate(() => window.__fot.settings.update((s) => (s.capabilities.overrides.promptSupport = 'on')));
  await api(page, 'POST', '/api/printer/command', {
    commands: [
      '!!DEBUG:action_custom prompt_begin Filament runout detected',
      '!!DEBUG:action_custom prompt_choice Continue',
      '!!DEBUG:action_custom prompt_choice Purge more',
      '!!DEBUG:action_custom prompt_show',
    ],
  });
  await page.waitForSelector('[data-testid=prompt]', { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/prompt.png` });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('[data-testid=prompt]', { state: 'detached' });
  await page.waitForFunction(() => window.__fot.terminal.lines.some((l) => l.text.includes('M876 S0')), null, {
    timeout: 15_000,
  });
  log('prompt', 'shown and answered with M876 S0');
  await api(page, 'POST', '/api/printer/command', { command: '!!DEBUG:action_custom notification Heating done' });
  await page.waitForSelector('[data-testid=toast]', { timeout: 15_000 });
  log('notification', (await page.textContent('[data-testid=toast]'))?.trim());
  await page.evaluate(() => window.__fot.settings.update((s) => (s.capabilities.overrides.promptSupport = 'auto')));
}

// A short job (~25 s on the Virtual Printer, thanks to G4 dwells) uploaded by the test itself,
// with the thumbnail of a sample so the agent's extraction shows up on Home and the screensaver.
const SMOKE_FILE = 'smoke-test.gcode';
const SMOKE_GCODE = [
  '; FloppyOctoTouch smoke test',
  'G28',
  'G90',
  ...Array.from({ length: 12 }, (_, i) => [`G1 X${20 + i * 5} Y20 F3000`, 'G4 S2']).flat(),
  'M107',
].join('\n');
const THUMBNAIL_SAMPLE = 'calibration-cube_prusaslicer.gcode';

/** The thumbnail comment blocks of a sample in OctoPrint's storage. */
const sampleThumbnail = (page) =>
  page.evaluate(async (name) => {
    const text = await (await fetch(`/downloads/files/local/${name}`)).text();
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.startsWith('; thumbnail begin'));
    const end = lines.findLastIndex((l) => l.startsWith('; thumbnail end'));
    return lines.slice(start, end + 1).join('\n');
  }, THUMBNAIL_SAMPLE);

const terminalHas = (page, text, timeout = 15_000) =>
  page.waitForFunction((t) => window.__fot.terminal.lines.some((l) => l.text.includes(t)), text, { timeout });

// Taps a preset of the open slider dialog and waits until it is gone (outro included).
async function sliderPreset(page, label) {
  await page.getByTestId('slider-dialog').getByRole('button', { name: label, exact: true }).click();
  await page.waitForSelector('[data-testid=slider-dialog]', { state: 'detached' });
}

async function uploadFile(page, name, content, folder = '') {
  const status = await page.evaluate(
    async ([name, content, folder]) => {
      const form = new FormData();
      form.append('file', new Blob([content], { type: 'text/plain' }), name);
      if (folder) form.append('path', folder);
      return (await fetch('/api/files/local', { method: 'POST', body: form })).status;
    },
    [name, content, folder],
  );
  if (status !== 201) throw new Error(`upload of ${name} failed: HTTP ${status}`);
}

const uploadSmokeFile = async (page) =>
  uploadFile(page, SMOKE_FILE, `${await sampleThumbnail(page)}\n${SMOKE_GCODE}`);

const BENCHY = '3dbenchy_prusaslicer.gcode';
const DELETE_FILE = 'smoke-delete.gcode';
const USB_FILE = 'smoke-usb.gcode';
// dev/fake-usb, mounted read-only in the agent as /media/usb0 and writable here.
const FAKE_USB = '/fake-usb';

const itemNames = (page) =>
  page.$$eval('[data-testid=files-content] [data-testid^=item-]', (els) =>
    els.map((el) => el.dataset.testid.slice('item-'.length)),
  );
const waitThumb = (page, item) =>
  page.waitForFunction((id) => document.querySelector(`[data-testid="${id}"] img`)?.naturalWidth > 0, `item-${item}`, {
    timeout: 15_000,
  });
const closeModal = async (page, id) => {
  await page.keyboard.press('Escape');
  await page.waitForSelector(`[data-testid=${id}]`, { state: 'detached' });
};

// Files: browse, folders, sort, list view, search with the keyboard, detail, delete, SD card, USB import/eject.
async function filesScreen(page) {
  await page.goto(`${BASE_URL}/#/files`);
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  // Start from the defaults (a failed run may have left other preferences behind).
  if (DEV) {
    await page.evaluate(() =>
      window.__fot.settings.update((s) => Object.assign(s.files, { sort: 'date', direction: 'desc', view: 'grid' })),
    );
  }
  await page.waitForSelector('[data-testid=file-grid]');
  await waitThumb(page, BENCHY);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/files-grid.png` });

  await page.getByTestId('item-examples').click();
  await waitText(page, 'breadcrumb', (t) => t.includes('examples'));
  await page.getByTestId('item-coaster-copy.gcode').waitFor();
  await page.getByTestId('folder-up').click();
  await page.getByTestId(`item-${BENCHY}`).waitFor();
  log('folders', 'opened examples/, back to the root');

  await page.getByTestId('sort-size').click();
  let names = await itemNames(page);
  if (names.filter((n) => n.endsWith('.gcode'))[0] !== BENCHY) throw new Error(`size sort: ${names}`);
  await page.getByTestId('sort-name').click();
  names = (await itemNames(page)).filter((n) => n.endsWith('.gcode'));
  if (names.join() !== [...names].sort((a, b) => a.localeCompare(b)).join()) throw new Error(`name sort: ${names}`);
  await page.getByTestId('files-view').click();
  await page.waitForSelector('[data-testid=file-list]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/files-list.png` });
  await page.getByTestId('files-view').click();
  await page.waitForSelector('[data-testid=file-grid]');
  await page.getByTestId('sort-date').click(); // back to the default, newest first
  log('sort/view', 'size and name order, list and grid');

  // Search through the on-screen keyboard sheet (typed on the physical keyboard, Enter submits).
  await page.getByTestId('files-search').click();
  await page.waitForSelector('[data-testid=text-input]');
  await page.keyboard.type('coaster');
  await page.waitForTimeout(300); // sheet fade-in
  await page.screenshot({ path: `${OUT}/files-search-keyboard.png` });
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=search-chip]');
  names = await itemNames(page);
  if (names.length !== 2 || !names.every((n) => n.includes('coaster'))) throw new Error(`search: ${names}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/files-search.png` });
  await page.getByTestId('search-clear').click();
  log('search', `"coaster" → ${names.join(', ')}`);

  // Detail of the real PrusaSlicer benchy: thumbnail and slicer analysis.
  await page.getByTestId(`item-${BENCHY}`).click();
  await page.waitForSelector('[data-testid=file-detail]');
  await waitText(page, 'detail-estimate', (t) => /\d/.test(t));
  await page.waitForFunction(() => document.querySelector('[data-testid=file-detail] img')?.naturalWidth > 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/file-detail.png` });
  log('detail', (await text(page, 'detail-estimate'))?.trim());
  await closeModal(page, 'file-detail');

  await uploadFile(page, DELETE_FILE, SMOKE_GCODE);
  await page.getByTestId(`item-${DELETE_FILE}`).click();
  await page.getByTestId('detail-delete').click();
  await page.waitForSelector('[data-testid=confirm-dialog]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/files-delete.png` });
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByTestId(`item-${DELETE_FILE}`).waitFor({ state: 'detached', timeout: 15_000 });
  log('delete', 'confirmed, file gone from the list');

  // Printer SD card (the Virtual Printer has one).
  await page.getByTestId('source-sdcard').click();
  if (await page.getByTestId('sd-init').count()) await page.getByTestId('sd-init').click();
  await page.getByTestId('sd-refresh').waitFor({ timeout: 15_000 });
  // OctoPrint lists the card only after an M20: refresh if it has not happened yet.
  const sdFile = page.getByTestId('item-sd-cube.gcode');
  if (!(await sdFile.waitFor({ timeout: 3000 }).then(() => true, () => false))) {
    await page.getByTestId('sd-refresh').click();
    await sdFile.waitFor({ timeout: 15_000 });
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/files-sd.png` });
  log('sd card', `ready, ${(await itemNames(page)).join(', ')}`);

  // USB stick: a file appears after a refresh, is imported into examples/ and the stick ejected.
  await api(page, 'DELETE', `/api/files/local/examples/${USB_FILE}`);
  writeFileSync(`${FAKE_USB}/${USB_FILE}`, `${await sampleThumbnail(page)}\n${SMOKE_GCODE}\n`);
  await page.getByTestId('source-usb').click();
  await page.getByTestId('files-refresh').click();
  await page.getByTestId(`item-${USB_FILE}`).waitFor({ timeout: 15_000 });
  await waitThumb(page, USB_FILE);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/files-usb.png` });
  await page.getByTestId(`item-${USB_FILE}`).click();
  await page.waitForSelector('[data-testid=usb-detail]');
  await page.getByTestId('usb-destination').click();
  await page.getByRole('option', { name: 'examples', exact: true }).click();
  await waitText(page, 'usb-destination', (t) => t.includes('examples'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/usb-detail.png` });
  await page.getByTestId('usb-import').click();
  await page.waitForSelector('[data-testid=file-detail]', { timeout: 30_000 });
  await waitText(page, 'breadcrumb', (t) => t.includes('examples'));
  log('usb import', `${USB_FILE} → examples/, detail of the local copy`);
  await closeModal(page, 'file-detail');

  if (DEV) {
    // The real import of a few KB is too fast to catch: show the dialog with a fake progress.
    await page.evaluate(() => {
      const file = window.__fot.usb.files[0];
      window.__fot.usb.importing = { file, sent: Math.round(file.size * 0.42), total: file.size };
    });
    await page.waitForSelector('[data-testid=import-progress]');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/import-progress.png` });
    await page.evaluate(() => (window.__fot.usb.importing = null));
    await page.waitForSelector('[data-testid=import-progress]', { state: 'detached' });
  }

  await page.getByTestId('source-usb').click();
  await page.locator('[data-testid^=usb-eject-]').click();
  await page.waitForSelector('[data-testid=files-empty]');
  await page.getByText('You can remove the USB stick now.').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/files-usb-ejected.png` });
  log('usb eject', 'stick gone, toast shown');
  // In dev ejecting only hides the stick until its content changes: that is a new insertion (SSE event).
  unlinkSync(`${FAKE_USB}/${USB_FILE}`);
  await page.getByText('USB stick connected').waitFor({ timeout: 15_000 });
  log('usb insert', 'toast from the agent event stream');
  await api(page, 'DELETE', `/api/files/local/examples/${USB_FILE}`);

  await page.getByTestId('source-local').click();
  if (DEV) await page.evaluate(() => window.__fot.settings.flush());
}

// Idle Home → print from the recent files → live overrides → pause/resume → webcam → print done notice.
async function printFlow(page) {
  await page.goto(`${BASE_URL}/#/home`);
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  await waitText(page, 'status-phase', (t) => t.includes('Ready'));
  await uploadSmokeFile(page);
  const printButton = page.getByTestId(`print-${SMOKE_FILE}`);
  await printButton.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/home-idle.png` });

  await printButton.click();
  await page.waitForSelector('[data-testid=confirm-dialog]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/confirm-print.png` });
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Print', exact: true }).click();
  await page.waitForSelector('.home[data-view=job]', { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/home-printing.png` });
  log('print', 'started from the recent files after confirmation');

  // Fan through the slider dialog (preset = immediate), then the feed rate.
  await page.getByTestId('gauge-fan').click();
  await page.waitForSelector('[data-testid=slider-dialog]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/slider-fan.png` });
  await sliderPreset(page, '50%');
  await waitText(page, 'gauge-fan', (t) => t.includes('50'));
  await page.getByTestId('tune-feedrate').click();
  await sliderPreset(page, '110%');
  await waitText(page, 'tune-feedrate', (t) => t.includes('110%'));
  if (DEV) {
    await terminalHas(page, 'M106 S128');
    await terminalHas(page, 'M220 S110');
  }
  await page.getByTestId('tune-feedrate').click();
  await sliderPreset(page, '100%');
  log('overrides', 'fan 50% (M106 S128), speed 110% (M220 S110)');

  // Pause from here: confirmed, and not announced again by a notice.
  await page.getByTestId('job-pause').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByTestId('job-resume').waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid=job-resume]')?.disabled, null, {
    timeout: 15_000,
  });
  await page.waitForTimeout(1500);
  if (await page.getByTestId('notice').count()) throw new Error('local pause was announced');
  await page.getByTestId('job-resume').click();
  await page.getByTestId('job-pause').waitFor({ timeout: 15_000 });
  log('pause/resume', 'confirmed pause, no notice, resumed');

  // Manual control is locked while the job runs.
  await page.getByTestId('nav-move').click();
  await page.getByTestId('move-locked').waitFor();
  if (!(await page.getByTestId('jog-xplus').isDisabled())) throw new Error('jog enabled while printing');
  await page.getByTestId('nav-filament').click();
  await page.getByTestId('filament-locked').waitFor();
  if (!(await page.getByTestId('manual-extrude').isDisabled())) throw new Error('extrude enabled while printing');
  await page.screenshot({ path: `${OUT}/filament-locked.png` });
  await page.getByTestId('nav-leveling').click();
  await page.getByTestId('leveling-locked').waitFor();
  if (!(await page.getByTestId('paper-home').isDisabled())) throw new Error('paper test enabled while printing');
  await page.getByTestId('nav-home').click();
  await page.getByTestId('job-pause').waitFor();
  log('locks', 'Move, Filament and Leveling locked while printing');

  // The choice is persisted: switch only if the thumbnail is shown.
  if ((await page.getAttribute('[data-testid=preview]', 'data-mode')) !== 'webcam') {
    await page.getByTestId('preview-toggle').click();
  }
  await page.waitForSelector('[data-testid=webcam-stream]');
  await page.waitForFunction(() => document.querySelector('[data-testid=webcam-stream]')?.naturalWidth > 0, null, {
    timeout: 15_000,
  });
  await page.screenshot({ path: `${OUT}/home-webcam.png` });
  await page.getByTestId('preview').click();
  await page.waitForSelector('[data-testid=preview-modal]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/preview-webcam.png` });
  await page.getByTestId('preview-modal').getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByTestId('preview-toggle').click();
  log('webcam', 'stream shown in the preview and enlarged');

  if (DEV) {
    // Screensaver while printing, as is and with the optional thumbnail.
    for (const thumb of [false, true]) {
      await page.evaluate((on) => window.__fot.settings.update((s) => (s.screensaver.showThumbnail = on)), thumb);
      await page.evaluate(() => window.__fot.idle.sleep());
      await page.waitForSelector('[data-testid=screensaver][data-mode=screensaver]');
      if (thumb) {
        await page.waitForFunction(() => document.querySelector('[data-testid=screensaver] img')?.naturalWidth > 0);
      }
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/saver-printing${thumb ? '-thumb' : ''}.png` });
      await page.mouse.click(512, 540);
      await page.waitForSelector('[data-testid=screensaver]', { state: 'detached' });
    }
    await page.evaluate(async () => {
      window.__fot.settings.update((s) => (s.screensaver.showThumbnail = false));
      await window.__fot.settings.flush();
    });
    log('saver thumbnail', 'printing screensaver without and with the thumbnail');
  }

  await page.waitForSelector('[data-testid=notice]', { timeout: 120_000 });
  const kind = await page.getAttribute('[data-testid=notice] [data-kind]', 'data-kind');
  if (kind !== 'done') throw new Error(`unexpected notice ${kind}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/notice-done.png` });
  if (DEV) await terminalHas(page, 'M300');
  await page.getByTestId('notice-ok').click();
  await page.waitForSelector('.home[data-view=idle]');
  await api(page, 'DELETE', `/api/files/local/${SMOKE_FILE}`);
  log('print done', `notice shown${DEV ? ', M300 beep sent' : ''}`);
}

// Screensaver after the timeout; the wake-up tap must not press the button underneath.
async function screensaver(page) {
  await page.goto(`${BASE_URL}/#/home`);
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  await page.waitForSelector('[data-testid=preheat-pla]');
  await api(page, 'POST', '/api/printer/tool', { command: 'target', targets: { tool0: 0 } });
  await page.waitForFunction(() => !window.__fot.temperatures.latest.tool0?.target);
  const box = await page.getByTestId('preheat-pla').boundingBox();
  await page.evaluate(() => window.__fot.settings.update((s) => (s.screensaver.timeoutMin = 0.05)));
  await page.waitForSelector('[data-testid=screensaver][data-mode=screensaver]', { timeout: 15_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/saver-idle.png` });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('[data-testid=screensaver]', { state: 'detached' });
  await page.waitForTimeout(800);
  const target = await page.evaluate(() => window.__fot.temperatures.latest.tool0?.target ?? 0);
  if (target !== 0 || (await page.getByTestId('toast').count())) {
    throw new Error('the wake-up tap reached the button under the screensaver');
  }
  await page.evaluate(async () => {
    window.__fot.settings.update((s) => (s.screensaver.timeoutMin = 5));
    await window.__fot.settings.flush();
  });
  log('screensaver', 'shown after the timeout, wake-up tap swallowed');

  // Screen off: the agent switches the output (no-op in dev), a tap turns it back on.
  await page.evaluate(() => window.__fot.idle.sleep('off'));
  await page.waitForSelector('[data-testid=screensaver][data-mode=off]');
  await page.waitForFunction(async () => (await (await fetch('/local/display')).json()).on === false);
  await page.mouse.click(512, 300);
  await page.waitForSelector('[data-testid=screensaver]', { state: 'detached' });
  await page.waitForFunction(async () => (await (await fetch('/local/display')).json()).on === true);
  log('screen off', 'display off through the agent, back on at the first tap');
}

// Types digits on the open NumPad and confirms; waits for its outro so the next one is unambiguous.
async function numpadEnter(page, digits) {
  await page.waitForSelector('[data-testid=numpad]');
  for (const d of digits) await page.getByTestId('numpad').getByRole('button', { name: d, exact: true }).click();
  await page.getByTestId('numpad-ok').click();
  await page.waitForSelector('[data-testid=numpad]', { state: 'detached' });
}

const waitDisabled = (page, id, disabled = true) =>
  page.waitForFunction(([sel, d]) => document.querySelector(sel)?.disabled === d, [`[data-testid=${id}]`, disabled], {
    timeout: 20_000,
  });

// Temperature: NumPad target, off, window, presets CRUD (add with the keyboard, reorder, delete, restore), preheat.
async function temperatureScreen(page) {
  await page.goto(`${BASE_URL}/#/temperature`);
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  await page.waitForSelector('[data-testid=temp-chart] canvas', { timeout: 20_000 });
  await page.getByTestId('chart-window-5').click();
  await page.getByTestId('set-tool0').click();
  await numpadEnter(page, '190');
  await waitText(page, 'heater-tool0', (t) => t.includes('Target 190'));
  await waitText(page, 'heater-tool0', (t) => t.includes('At temperature'), 60_000);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/temperature.png` });
  await page.getByTestId('off-tool0').click();
  await waitDisabled(page, 'off-tool0');
  await page.getByTestId('chart-window-15').click();
  log('temperature', 'target 190°C from the NumPad, reached, turned off');

  await page.getByTestId('presets-manage').click();
  await page.getByTestId('preset-add').click();
  await page.getByTestId('preset-name').click();
  await page.waitForSelector('[data-testid=text-input]');
  await page.keyboard.type('ABS');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=text-input]', { state: 'detached' });
  await page.getByTestId('preset-hotend').click();
  await numpadEnter(page, '245');
  await page.getByTestId('preset-bed').click();
  await numpadEnter(page, '100');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/preset-editor.png` });
  await page.getByTestId('preset-save').click();
  await page.waitForSelector('[data-testid=preset-editor]', { state: 'detached' });
  const rows = () =>
    page.$$eval('[data-testid^=preset-row-]', (els) => els.map((el) => el.querySelector('.name').textContent));
  const absId = await page.$eval('[data-testid^=preset-row-]:last-child', (el) => el.dataset.testid.slice('preset-row-'.length));
  await page.getByTestId(`preset-up-${absId}`).click();
  if ((await rows()).join() !== 'PLA,PETG,ABS,TPU') throw new Error(`preset order: ${await rows()}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/presets.png` });
  await page.getByTestId(`preset-delete-${absId}`).click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForSelector('[data-testid=confirm-dialog]', { state: 'detached' });
  await page.getByTestId('preset-down-pla').click();
  await page.getByTestId('preset-restore').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await page.waitForSelector('[data-testid=confirm-dialog]', { state: 'detached' });
  if ((await rows()).join() !== 'PLA,PETG,TPU') throw new Error(`restored presets: ${await rows()}`);
  await closeModal(page, 'preset-manager');
  log('presets', 'ABS added with keyboard + NumPad, moved, deleted; defaults restored');

  await page.getByTestId('temp-preset-pla').click();
  await waitDisabled(page, 'off-bed', false);
  await page.getByTestId('all-off').click();
  await waitDisabled(page, 'off-tool0');
  await waitDisabled(page, 'off-bed');
  log('preheat', 'PLA preset from the screen, then all heaters off');
}

// Move: home, jog with steps, soft limits from the profile (clamped moves, edge toast), motors off.
async function moveScreen(page) {
  await page.goto(`${BASE_URL}/#/move`);
  await page.waitForSelector('[data-testid=jog-xplus]');
  await page.getByTestId('home-all').click();
  await waitText(page, 'pos-x', (t) => t.trim() === '0.00');
  await waitText(page, 'pos-z', (t) => t.trim() === '0.00');
  await page.getByTestId('jog-step-10').click();
  await page.getByTestId('jog-xplus').click();
  await waitText(page, 'pos-x', (t) => t.trim() === '10.00');
  if (DEV) await terminalHas(page, 'G0 X10 F3000');
  await page.getByTestId('jog-zminus').click();
  await page.getByText('Z is already at the edge of the build volume').waitFor();
  await page.getByTestId('jog-step-50').click();
  // One at a time: the Virtual Printer applies G91/G90 at once but buffers the moves, so quick jogs
  // would run as absolute moves there (real firmware is sequential).
  for (let i = 0; i < 5; i++) {
    await page.getByTestId('jog-xplus').click();
    await page.waitForTimeout(1800);
  }
  await page.waitForTimeout(2000); // the debounced M114 (after M400) must confirm it
  if ((await text(page, 'pos-x')).trim() !== '220.00') throw new Error(`x not clamped: ${await text(page, 'pos-x')}`);
  await page.getByTestId('jog-yplus').click();
  await waitText(page, 'pos-y', (t) => t.trim() === '50.00');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/move.png` });
  await page.getByTestId('jog-step-10').click();
  await page.getByTestId('motors-off').click();
  await waitText(page, 'pos-x', (t) => t.trim() === '—');
  log('move', 'homed, jogged, clamped at X 220 (profile), Z edge refused, motors off');
}

// Filament: extruder setup, manual extrusion, load wizard (heat → insert → load → purge) and unload.
async function filamentScreen(page) {
  await page.goto(`${BASE_URL}/#/filament`);
  await page.waitForSelector('[data-testid=wizard][data-step=material]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/filament.png` });
  await page.getByTestId('filament-setup-open').click();
  await page.getByTestId('extruder-type').click();
  await page.getByRole('option', { name: 'Direct drive', exact: true }).click();
  await page.getByText('Slow load length', { exact: true }).locator('..').getByRole('button').click();
  await numpadEnter(page, '20');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/filament-setup.png` });
  await page.getByTestId('extruder-save').click();
  await page.waitForSelector('[data-testid=filament-setup]', { state: 'detached' });
  await page.waitForSelector('[data-testid=filament-not-configured]', { state: 'detached' });

  await page.getByTestId('material-pla').click();
  await page.getByTestId('wizard-start').click();
  await page.waitForSelector('[data-testid=wizard][data-step=insert]', { timeout: 60_000 });
  await page.getByTestId('wizard-load').click();
  await page.waitForSelector('[data-testid=wizard][data-step=run]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/filament-run.png` });
  await page.waitForSelector('[data-testid=wizard][data-step=purge]', { timeout: 60_000 });
  if (DEV) await terminalHas(page, 'G1 E20 F150');
  await page.getByTestId('wizard-clean').click();
  await page.getByTestId('wizard-finish').click();
  log('load wizard', 'PLA heated, 20 mm loaded (M83/G1/M400/M114), purge → done');

  await waitDisabled(page, 'manual-extrude', false);
  await page.screenshot({ path: `${OUT}/filament-hot.png` });
  await page.getByTestId('manual-extrude').click();
  if (DEV) await terminalHas(page, 'G1 E10 F150');

  await page.getByTestId('filament-action-unload').click();
  await page.getByTestId('wizard-start').click();
  await page.waitForSelector('[data-testid=wizard][data-step=done]', { timeout: 60_000 });
  if (DEV) await terminalHas(page, 'G1 E-100 F1500');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/filament-done.png` });
  await page.getByTestId('wizard-cool').click();
  await page.waitForSelector('[data-testid=wizard][data-step=material]');
  await page.getByTestId('filament-action-load').click();
  log('unload wizard', 'retracted 100 mm, hotend cooled; manual extrude sent');

  // Back to the prudent defaults, so the next run sees the first-use warning again.
  await page.evaluate(async () => {
    const doc = await (await fetch('/local/settings')).json();
    doc.filament = { ...doc.filament, extruderType: 'unknown', configured: false, loadSlowLength: 100 };
    await fetch('/local/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  });
  await page.reload(); // the settings store would otherwise write its copy back later
}

const logHas = (page, text, timeout = 15_000) =>
  page.waitForFunction((t) => document.querySelector('[data-testid=terminal-log]')?.textContent.includes(t), text, {
    timeout,
  });

// Taps keys of the open on-screen keyboard (one key per character, ' ' = space).
async function tapKeys(page, keys) {
  const keyboard = page.getByTestId('keyboard');
  for (const key of keys) {
    if (key === ' ') await keyboard.getByRole('button', { name: 'space', exact: true }).click();
    else await keyboard.getByRole('button', { name: key, exact: true }).click();
  }
}

// Deep-merges `patch` into the stored settings behind the app's back (production build too): reload after.
const patchSettings = (page, patch) =>
  page.evaluate(async (patch) => {
    const merge = (target, source) => {
      for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = merge(target[key] ?? {}, value);
        else target[key] = value;
      }
      return target;
    };
    const doc = merge(await (await fetch('/local/settings')).json(), patch);
    await fetch('/local/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) });
  }, patch);
const setOverrides = (page, overrides) => patchSettings(page, { capabilities: { overrides } });

// Lines the Virtual Printer sends back as if the firmware wrote them (`!!DEBUG:send`).
const fakeFirmware = (page, lines) =>
  api(page, 'POST', '/api/printer/command', { commands: lines.map((l) => `!!DEBUG:send ${l}`) });

// Terminal: keyboard input, quick commands, filters, pause, history, clear.
async function terminalScreen(page) {
  await page.goto(`${BASE_URL}/#/terminal`);
  await page.waitForSelector('[data-testid=terminal-log]');
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  await page.getByTestId('terminal-input').click();
  await page.waitForSelector('[data-testid=keyboard][data-layer=gcode]');
  await tapKeys(page, 'M115');
  await waitText(page, 'terminal-input', (t) => t.includes('M115'));
  await page.screenshot({ path: `${OUT}/terminal-keyboard.png` });
  await page.getByTestId('terminal-send').click();
  await logHas(page, 'FIRMWARE_NAME');
  await waitText(page, 'terminal-input', (t) => !t.includes('M115'));
  await page.getByTestId('terminal-keyboard-toggle').click();
  await page.getByTestId('quick-M114').click();
  await logHas(page, ' Y:');
  log('terminal', 'M115 typed on the G-code keyboard and answered, quick M114');

  // Filters: hide the plain "ok" lines.
  const okLines = () =>
    page.$$eval('[data-testid=terminal-log] .line', (els) => els.filter((el) => el.textContent.trim() === 'ok').length);
  if ((await okLines()) === 0) throw new Error('expected "ok" lines with the default filters');
  await page.getByTestId('terminal-filters').click();
  await page.getByTestId('filter-ok').getByRole('switch').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/terminal-filters.png` });
  await closeModal(page, 'terminal-filter-dialog');
  if ((await okLines()) !== 0) throw new Error('"ok" lines still shown with the filter on');
  await waitText(page, 'terminal-filters', (t) => t.includes('4 hidden'));

  // Pause: new lines are counted, not shown.
  await page.getByTestId('terminal-pause').click();
  await page.getByTestId('quick-M115').click();
  await waitText(page, 'terminal-paused', (t) => !/ 0 new/.test(t));
  await page.screenshot({ path: `${OUT}/terminal-paused.png` });
  await page.getByTestId('terminal-pause').click();
  await page.waitForSelector('[data-testid=terminal-paused]', { state: 'detached' });

  // History: pick the typed command again and send it with the physical Enter key.
  await page.getByTestId('terminal-history').click();
  await page.getByTestId('terminal-history-list').getByRole('button', { name: 'M115', exact: true }).click();
  await waitText(page, 'terminal-input', (t) => t.includes('M115'));
  await page.keyboard.press('Enter');
  await waitText(page, 'terminal-input', (t) => !t.includes('M115'));
  await page.getByTestId('terminal-keyboard-toggle').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/terminal.png` });

  await page.getByTestId('terminal-filters').click();
  await page.getByTestId('filter-ok').getByRole('switch').click();
  await closeModal(page, 'terminal-filter-dialog');
  await page.getByTestId('terminal-clear').click();
  await page.waitForSelector('[data-testid=terminal-log] .empty', { timeout: 5000 }).catch(() => undefined);
  log('terminal', 'filter, pause with counter, history, clear');
}

// Macros: run (with and without confirmation), add with the keyboards, reorder, delete, restore.
async function macrosScreen(page) {
  await page.goto(`${BASE_URL}/#/terminal`);
  await page.getByTestId('terminal-tab-macros').click();
  await page.waitForSelector('[data-testid=macro-grid]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/macros.png` });
  await page.getByTestId('macro-report').click();
  await page.getByText('Report settings sent').waitFor();
  await page.getByTestId('macro-motors-off').click();
  await page.waitForSelector('[data-testid=confirm-dialog]');
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByText('Motors off sent').waitFor();
  log('macros', 'M503 run at once, M84 after the confirmation');

  await page.getByTestId('macros-manage').click();
  await page.getByTestId('macro-add').click();
  await page.getByTestId('macro-name').click();
  await page.waitForSelector('[data-testid=text-input]');
  await page.keyboard.type('Beep');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid=text-input]', { state: 'detached' });
  await page.getByTestId('macro-gcode').click();
  await page.waitForSelector('[data-testid=keyboard][data-layer=gcode]');
  await tapKeys(page, 'M300 S440 P200');
  await page.keyboard.press('Enter'); // multiline: a new line
  await page.keyboard.type('M117 Beep ; comment');
  await page.getByTestId('text-input-ok').click();
  await page.waitForSelector('[data-testid=text-input]', { state: 'detached' });
  await page.getByTestId('macro-icon-bell').click();
  await page.getByTestId('macro-color-ok').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/macro-editor.png` });
  await page.getByTestId('macro-save').click();
  await page.waitForSelector('[data-testid=macro-editor]', { state: 'detached' });
  const rows = () =>
    page.$$eval('[data-testid^=macro-row-]', (els) => els.map((el) => el.querySelector('.name').textContent));
  const beepId = await page.$eval('[data-testid^=macro-row-]:last-child', (el) => el.dataset.testid.slice('macro-row-'.length));
  await page.getByTestId(`macro-up-${beepId}`).click();
  if ((await rows()).join() !== 'Home all,Park head,Motors off,Beep,Report settings') throw new Error(`macro order: ${await rows()}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/macro-manager.png` });
  await closeModal(page, 'macro-manager');

  await page.getByTestId(`macro-${beepId}`).click();
  await page.getByText('Beep sent').waitFor();
  await page.getByTestId('terminal-tab-console').click();
  await logHas(page, 'M117 Beep');
  if (await page.$eval('[data-testid=terminal-log]', (el) => el.textContent.includes('comment'))) {
    throw new Error('the macro comment was sent');
  }
  await page.getByTestId('terminal-tab-macros').click();

  await page.getByTestId('macros-manage').click();
  await page.getByTestId(`macro-delete-${beepId}`).click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForSelector('[data-testid=confirm-dialog]', { state: 'detached' });
  await page.getByTestId('macro-down-home').click();
  await page.getByTestId('macro-restore').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await page.waitForSelector('[data-testid=confirm-dialog]', { state: 'detached' });
  if ((await rows()).join() !== 'Home all,Park head,Motors off,Report settings') throw new Error(`restored macros: ${await rows()}`);
  await closeModal(page, 'macro-manager');
  await page.getByTestId('terminal-tab-console').click();
  log('macro CRUD', 'Beep added (keyboard, icon, colour), moved, run without its comment, deleted; restored');
}

// Marlin 2.1 `G29 S0` / `M420 V` output of a 3x3 manual mesh, sent back by the Virtual Printer.
const MBL_REPORT = [
  'Mesh Bed Leveling ON',
  '3x3 mesh. Z offset: 0.00000',
  'Measured points:',
  '        0        1        2',
  ' 0 +0.12500 +0.05000 -0.01250',
  ' 1 +0.08750 +0.00000 -0.05000',
  ' 2 +0.02500 -0.03750 -0.09000',
  'echo:Bed Leveling ON',
];

// Leveling: paper test (home, points, lift), mesh report → heatmap, manual mesh, babystep, probe offset, M500.
async function levelingScreen(page) {
  const TOOLS = ['manualMesh', 'autolevel', 'zProbe', 'babystepping'];
  const overrideTools = (value) => setOverrides(page, Object.fromEntries(TOOLS.map((k) => [k, value])));
  await page.goto(`${BASE_URL}/#/leveling`);
  await overrideTools('auto'); // in case an earlier run stopped half-way
  await page.reload();
  await page.waitForSelector('[data-testid=paper-bed]');
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  // Motors off (from any client): nothing is homed any more.
  await api(page, 'POST', '/api/printer/command', { commands: ['M84', 'M851 Z0.2'] });
  await page.waitForSelector('[data-testid=paper-not-homed]');
  await waitDisabled(page, 'point-front-left');
  await page.getByTestId('paper-home').click();
  await waitDisabled(page, 'paper-next', false);
  await page.getByTestId('paper-next').click();
  await waitText(page, 'paper-position', (t) => t.includes('Front left') && t.includes('Z 0.00'));
  await page.waitForTimeout(1500);
  await page.getByTestId('paper-next').click();
  await waitText(page, 'paper-position', (t) => t.includes('Front right'));
  await page.waitForTimeout(1500);
  await page.getByTestId('point-center').click();
  await waitText(page, 'paper-position', (t) => t.includes('Centre') && t.includes('Z 0.00'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/leveling-paper.png` });
  await page.getByTestId('paper-finish').click();
  await waitText(page, 'paper-position', (t) => t.includes('Z 5.00'));
  log('paper test', 'homed, front-left → front-right → centre at Z0, lifted to 5 mm');

  await page.getByTestId('leveling-tab-mesh').click();
  await page.waitForSelector('[data-testid=mesh-no-tools]');
  await page.screenshot({ path: `${OUT}/leveling-mesh-none.png` });
  // Pretend the firmware has manual mesh, a probe and babystepping (the Virtual Printer has none).
  await overrideTools('on');
  await page.reload();
  await page.getByTestId('leveling-tab-mesh').click();
  await page.getByTestId('mesh-read').click();
  await fakeFirmware(page, MBL_REPORT);
  await page.waitForSelector('[data-testid=mesh-map]');
  await waitText(page, 'mesh-range', (t) => t.includes('0.215'));
  await waitText(page, 'mesh-meta', (t) => t.includes('compensation on'));
  const cell = await text(page, 'mesh-cell-0-0');
  if (cell.trim() !== '+0.125') throw new Error(`front-left mesh cell: ${cell}`);
  await page.waitForSelector('[data-testid=toast]', { state: 'detached', timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/leveling-mesh.png` });
  log('mesh', 'MBL report parsed: 3x3, range 0.215 mm');

  await page.getByTestId('mbl-start').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Start manual mesh', exact: true }).click();
  await waitText(page, 'mbl-point', (t) => t.includes('Point 1 of 9'));
  await page.getByTestId('mbl-down').click();
  await page.getByTestId('mbl-next').click();
  await waitText(page, 'mbl-point', (t) => t.includes('Point 2 of 9'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/leveling-mbl.png` });
  await fakeFirmware(page, ['Mesh probing done.']);
  await page.waitForSelector('[data-testid=mbl-start]', { timeout: 15_000 });
  if (DEV) await terminalHas(page, 'Send: M420 V');
  log('manual mesh', 'G29 S1, Z jog, G29 S2; "Mesh probing done." ends it and reads the mesh');

  await page.getByTestId('leveling-tab-z').click();
  await waitText(page, 'probe-offset', (t) => t.includes('+0.20'));
  await page.getByTestId('babystep-step-0.05').click();
  await page.getByTestId('babystep-up').click();
  await waitText(page, 'babystep-total', (t) => t.includes('+0.05'));
  await page.getByTestId('babystep-step-0.01').click();
  await page.getByTestId('babystep-down').click();
  await waitText(page, 'babystep-total', (t) => t.includes('+0.04'));
  if (DEV) await terminalHas(page, 'M290 Z-0.01');
  await page.getByTestId('probe-set').click();
  await page.waitForSelector('[data-testid=numpad]');
  // Positive: the Virtual Printer ignores negative M851 values (its parameter regex has no sign).
  for (const key of ['0', 'Decimal point', '3', '5']) {
    await page.getByTestId('numpad').getByRole('button', { name: key, exact: true }).click();
  }
  await page.getByTestId('numpad-ok').click();
  await page.waitForSelector('[data-testid=numpad]', { state: 'detached' });
  await waitText(page, 'probe-offset', (t) => t.includes('+0.35'));
  await page.getByTestId('z-save').click();
  await page.getByTestId('confirm-dialog').getByRole('button', { name: 'Save to EEPROM', exact: true }).click();
  await page.getByText('Settings saved to EEPROM').waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/leveling-z.png` });
  log('z offset', 'babystep +0.05 −0.01, M851 Z0.35 read back, M500');

  // Back to the Virtual Printer's own capabilities and defaults.
  await api(page, 'POST', '/api/printer/command', { commands: ['M851 Z0.2', 'M500'] });
  await overrideTools('auto');
  await patchSettings(page, { leveling: { babystep: 0.05 } });
  await page.reload();
}

// Types on the physical keyboard into the open text sheet and confirms it.
async function typeText(page, text) {
  await page.waitForSelector('[data-testid=text-input]');
  await page.keyboard.type(text);
  await page.getByTestId('text-input-ok').click();
  await page.waitForSelector('[data-testid=text-input]', { state: 'detached' });
}

const confirmWith = async (page, label) => {
  await page.getByTestId('confirm-dialog').getByRole('button', { name: label, exact: true }).click();
  await page.waitForSelector('[data-testid=confirm-dialog]', { state: 'detached' });
};

const DEV_API_KEY = process.env.OCTOPRINT_API_KEY ?? 'floppyoctotouch-dev-api-key-not-secret';

// System: host rings, network, system commands (mocked: nothing reboots), custom actions with the
// status bar, every settings section, capability override, API key, reset, About.
async function systemScreen(page) {
  await page.goto(`${BASE_URL}/#/system`);
  // Leftovers of an interrupted run would clash with the names used below.
  await patchSettings(page, { customActions: [] });
  await page.reload();
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  await waitText(page, 'gauge-ram', (t) => /\d/.test(t));
  await waitText(page, 'net-ip', (t) => /^\d+\.\d+\.\d+\.\d+$/.test(t));
  await waitText(page, 'status-network', (t) => /\d+\.\d+\.\d+\.\d+/.test(t));
  await page.waitForSelector('[data-testid=syscmd-shutdown]');
  await page.waitForTimeout(800); // ring transitions
  await page.screenshot({ path: `${OUT}/system.png` });
  log('system', `${(await text(page, 'net-ip')).trim()} · ${(await text(page, 'gauge-cpu')).replace(/\s+/g, ' ').trim()}`);

  // Reboot: confirmation, then the POST (intercepted: the dev container must not act on it).
  const calls = [];
  const handler = (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    calls.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 204 });
  };
  await page.route('**/api/system/commands/core/*', handler);
  await page.getByTestId('syscmd-reboot').click();
  await page.waitForSelector('[data-testid=confirm-dialog]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/system-reboot.png` });
  await confirmWith(page, 'Reboot the Pi');
  await page.getByText('The Raspberry Pi is rebooting…').waitFor();
  await page.unroute('**/api/system/commands/core/*', handler);
  if (calls.join() !== '/api/system/commands/core/reboot') throw new Error(`system commands sent: ${calls}`);
  // A custom OctoPrint command (an `echo` in dev) really runs.
  await page.getByTestId('syscmd-lights').click();
  await confirmWith(page, 'Run');
  await page.getByText('Toggle lights (dev) started').waitFor();
  // Screen restart: no kiosk command in dev, so the page reloads.
  await page.getByTestId('kiosk-restart').click();
  await Promise.all([page.waitForEvent('load', { timeout: 15_000 }), confirmWith(page, 'Restart the screen')]);
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  log('system commands', 'reboot confirmed (mocked), custom OctoPrint command run, screen restarted');

  // Custom actions: a G-code one in the status bar, a system command one, a plugin one rejected.
  await page.getByTestId('actions-manage').click();
  await page.getByTestId('action-add').click();
  await page.getByTestId('action-name').click();
  await typeText(page, 'Case light');
  await page.getByTestId('action-gcode').click();
  await typeText(page, 'M355 S1');
  await page.getByTestId('action-statusbar').getByRole('switch').click();
  await page.getByTestId('action-color-ok').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/action-editor.png` });
  await page.getByTestId('action-save').click();
  await page.waitForSelector('[data-testid=action-editor]', { state: 'detached' });

  await page.getByTestId('action-add').click();
  await page.getByTestId('action-name').click();
  await typeText(page, 'Lights');
  await page.getByTestId('action-kind-system').click();
  await page.getByTestId('action-system').click();
  await page.getByRole('option', { name: 'Toggle lights (dev)' }).click();
  await page.getByTestId('action-save').click();
  await page.waitForSelector('[data-testid=action-editor]', { state: 'detached' });

  await page.getByTestId('action-add').click();
  await page.getByTestId('action-name').click();
  await typeText(page, 'Relay');
  await page.getByTestId('action-kind-plugin').click();
  await page.getByTestId('action-plugin-id').click();
  await typeText(page, 'psucontrol');
  await page.getByTestId('action-plugin-command').click();
  await typeText(page, 'togglePSU');
  await page.getByTestId('action-plugin-data').click();
  await typeText(page, '[1]');
  await page.getByTestId('action-save').click();
  await waitText(page, 'action-error', (t) => t.includes('JSON object'));
  await page.screenshot({ path: `${OUT}/action-error.png` });
  await page.getByTestId('action-editor').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForSelector('[data-testid=action-editor]', { state: 'detached' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/action-manager.png` });
  await closeModal(page, 'action-manager');

  const lightId = await page.$eval('[data-testid^=status-action-]', (el) => el.dataset.testid.slice('status-action-'.length));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/system-actions.png` });
  await page.getByTestId(`status-action-${lightId}`).click();
  await page.getByText('Case light sent').waitFor();
  if (DEV) await page.waitForFunction(() => window.__fot.terminal.lines.some((l) => l.text.includes('M355 S1')));
  await page.getByRole('button', { name: 'Lights', exact: true }).click();
  await page.getByText('Lights sent').waitFor();
  log('custom actions', 'G-code from the status bar, OctoPrint command, bad plugin JSON rejected');

  // Settings: every section renders; values go through the NumPad and the stored document.
  await page.getByTestId('system-tab-settings').click();
  for (const section of ['general', 'display', 'temperature', 'motion', 'firmware', 'power', 'connection']) {
    await page.getByTestId(`settings-${section}`).click();
    await page.waitForSelector(`[data-testid=settings-panel-${section}]`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/settings-${section}.png` });
  }
  const stored = () => page.evaluate(async () => (await fetch('/local/settings')).json());
  await page.getByTestId('settings-display').click();
  await page.getByTestId('saver-timeout').click();
  await numpadEnter(page, '12');
  await page.waitForTimeout(700); // debounced save
  if ((await stored()).screensaver.timeoutMin !== 12) throw new Error('screensaver timeout not saved');
  await page.getByTestId('saver-timeout').click();
  await numpadEnter(page, '5');

  await page.getByTestId('settings-firmware').click();
  await waitText(page, 'firmware-name', (t) => t.startsWith('Marlin'));
  await page.getByTestId('cap-manualMesh-on').click();
  await page.waitForTimeout(700);
  if ((await stored()).capabilities.overrides.manualMesh !== 'on') throw new Error('capability override not saved');
  await page.getByTestId('cap-manualMesh-auto').click();
  log('settings', '7 sections, screensaver 12 min saved, manual mesh forced on and back to auto');

  // API key: a wrong key is refused by OctoPrint, the right one is saved and the page reconnects.
  await page.getByTestId('settings-connection').click();
  const hint = DEV_API_KEY.slice(-4);
  await waitText(page, 'apikey-state', new Function(`return (t) => t.includes(${JSON.stringify(hint)})`)());
  await page.getByTestId('apikey-change').click();
  await typeText(page, 'this-key-is-wrong-0123456789');
  await page.getByText('OctoPrint rejected this key: nothing changed.').waitFor();
  await page.getByTestId('apikey-change').click();
  await typeText(page, DEV_API_KEY);
  await page.getByText(/API key (saved|in use)/).waitFor();
  await page.waitForEvent('load', { timeout: 15_000 });
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  log('api key', 'wrong key refused, dev key saved, reconnected after the reload');

  // Reset: everything back to the defaults (the custom actions go too).
  await page.getByTestId('system-tab-settings').click();
  await page.getByTestId('settings-reset').click();
  await page.waitForSelector('[data-testid=confirm-dialog]');
  await confirmWith(page, 'Reset all settings');
  await page.getByText('Settings reset').waitFor();
  if ((await stored()).customActions.length) throw new Error('reset kept the custom actions');
  await page.waitForSelector('[data-testid^=status-action-]', { state: 'detached' });

  await page.getByTestId('system-tab-about').click();
  await waitText(page, 'about-version', (t) => /^v\d+\.\d+\.\d+/.test(t));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/system-about.png` });

  // Italian overview.
  await page.getByTestId('system-tab-settings').click();
  await page.getByTestId('settings-general').click();
  await page.getByTestId('lang-it').click();
  await page.getByTestId('system-tab-overview').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/system-it.png` });
  await page.getByTestId('system-tab-settings').click();
  await page.getByTestId('lang-en').click();
  await page.waitForTimeout(700);
  log('reset / about', 'settings reset to the defaults, About shows the version');

  // PSU Control is not installed in dev: the test answers its settings key and SimpleApi.
  let psuOn = true;
  const psuCalls = [];
  const settingsRoute = async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.plugins = { ...json.plugins, psucontrol: {} };
    await route.fulfill({ response, json });
  };
  const psuRoute = (route) => {
    if (route.request().method() === 'POST') {
      const { command } = route.request().postDataJSON();
      psuCalls.push(command);
      psuOn = command === 'turnPSUOn';
    }
    return route.fulfill({ json: { isPSUOn: psuOn } });
  };
  await page.route('**/api/settings', settingsRoute);
  await page.route('**/api/plugin/psucontrol', psuRoute);
  await patchSettings(page, { psu: { statusBar: true } });
  await page.reload();
  await page.waitForSelector('[data-testid=status-psu]', { timeout: 30_000 });
  await waitText(page, 'psu-toggle', (t) => t.trim().endsWith('On'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/system-psu.png` });
  await page.getByTestId('status-psu').click();
  await confirmWith(page, 'Turn off');
  await waitText(page, 'psu-toggle', (t) => t.trim().endsWith('Off'));
  await page.getByTestId('psu-toggle').click(); // turning on does not ask
  await waitText(page, 'psu-toggle', (t) => t.trim().endsWith('On'));
  if (psuCalls.join() !== 'turnPSUOff,turnPSUOn') throw new Error(`PSU commands: ${psuCalls}`);
  await page.unroute('**/api/settings', settingsRoute);
  await page.unroute('**/api/plugin/psucontrol', psuRoute);
  await patchSettings(page, { psu: { statusBar: false } });
  log('psu control', 'status bar switch: off after the confirmation, on at once');

  // No API key accepted: the connection overlay offers to enter one, the keyboard shows above it.
  const health = (route) =>
    route.fulfill({
      json: { status: 'ok', version: '0', apiKeyConfigured: true, octoprint: { reachable: true, authorized: false, version: null } },
    });
  await page.route('**/local/health', health);
  await page.reload();
  await page.waitForSelector('[data-testid=overlay-apikey]', { timeout: 15_000 });
  await page.getByTestId('overlay-apikey').click();
  await page.waitForSelector('[data-testid=text-input]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/overlay-apikey.png` });
  await page.keyboard.press('Escape');
  await page.unroute('**/local/health', health);
  await page.reload();
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  log('overlay api key', 'offered when the key is rejected, keyboard above the overlay');
}

async function kiosk(page) {
  await page.goto(`${BASE_URL}/?kiosk=1#/home`);
  await page.waitForSelector('[data-testid=gauge-hotend]');
  const result = await page.evaluate(() => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return { kiosk: document.documentElement.classList.contains('kiosk'), blocked: event.defaultPrevented };
  });
  if (!result.kiosk || !result.blocked) throw new Error(`kiosk mode not active: ${JSON.stringify(result)}`);
  log('kiosk', 'cursor hidden, context menu blocked');
}

async function gallery(page) {
  await page.goto(`${BASE_URL}/ui-gallery`);
  await page.waitForSelector('[data-testid=keyboard]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/gallery.png`, fullPage: true });
  await page.getByRole('button', { name: /Benchy PETG/ }).click();
  await page.waitForSelector('[data-testid=text-input]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/keyboard.png` });
  log('gallery', 'rendered, keyboard sheet opens');
}

try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('console', (msg) => {
    // 404s are expected: files without a thumbnail, the agent fallback for them.
    if (msg.type() === 'error' && !msg.text().includes('404')) console.error('[browser]', msg.text());
  });
  // ONLY=terminal,leveling runs just those steps (quick checks while developing a screen).
  const only = process.env.ONLY?.split(',');
  const steps = [
    ['debug', debugPage, DEV],
    ['shell', shell, true],
    ['files', filesScreen, true],
    ['temperature', temperatureScreen, true],
    ['move', moveScreen, true],
    ['filament', filamentScreen, true],
    ['terminal', terminalScreen, true],
    ['macros', macrosScreen, true],
    ['leveling', levelingScreen, true],
    ['system', systemScreen, true],
    ['print', printFlow, true],
    ['screensaver', screensaver, DEV],
    ['kiosk', kiosk, true],
    ['gallery', gallery, DEV],
  ];
  for (const [name, step, enabled] of steps) {
    if (enabled && (!only || only.includes(name))) await step(page);
  }

  const preview = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await preview.goto(`${BASE_URL}/preview.html`);
  await preview.frameLocator('iframe').locator('[data-testid=gauge-hotend]').waitFor();
  await preview.waitForTimeout(1500);
  await preview.screenshot({ path: `${OUT}/preview.png` });

  console.log(`screenshots saved to ${OUT}`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
