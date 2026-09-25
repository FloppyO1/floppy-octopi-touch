// Smoke test + screenshots at the target resolution (1024x600).
// Run with: docker compose -f dev/docker-compose.yml run --rm playwright
// RECONNECT_TEST=1: also waits for the socket to drop and come back (restart OctoPrint meanwhile).
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
  await page.screenshot({ path: `${OUT}/system.png` });
  await page.getByTestId('lang-it').click();
  await waitText(page, 'status-phase', (t) => t.includes('Pronta'));
  await page.screenshot({ path: `${OUT}/system-it.png` });
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

// A short job (~25 s on the Virtual Printer, thanks to G4 dwells) uploaded by the test itself.
const SMOKE_FILE = 'smoke-test.gcode';
const SMOKE_GCODE = [
  '; FloppyOctoTouch smoke test',
  'G28',
  'G90',
  ...Array.from({ length: 12 }, (_, i) => [`G1 X${20 + i * 5} Y20 F3000`, 'G4 S2']).flat(),
  'M107',
].join('\n');

const terminalHas = (page, text, timeout = 15_000) =>
  page.waitForFunction((t) => window.__fot.terminal.lines.some((l) => l.text.includes(t)), text, { timeout });

// Taps a preset of the open slider dialog and waits until it is gone (outro included).
async function sliderPreset(page, label) {
  await page.getByTestId('slider-dialog').getByRole('button', { name: label, exact: true }).click();
  await page.waitForSelector('[data-testid=slider-dialog]', { state: 'detached' });
}

async function uploadSmokeFile(page) {
  const status = await page.evaluate(
    async ([name, content]) => {
      const form = new FormData();
      form.append('file', new Blob([content], { type: 'text/plain' }), name);
      return (await fetch('/api/files/local', { method: 'POST', body: form })).status;
    },
    [SMOKE_FILE, SMOKE_GCODE],
  );
  if (status !== 201) throw new Error(`upload failed: HTTP ${status}`);
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
    await page.evaluate(() => window.__fot.idle.sleep());
    await page.waitForSelector('[data-testid=screensaver][data-mode=screensaver]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/saver-printing.png` });
    await page.mouse.click(512, 540);
    await page.waitForSelector('[data-testid=screensaver]', { state: 'detached' });
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
    // /local/usb does not exist before session 5.
    if (msg.type() === 'error' && !msg.text().includes('404')) console.error('[browser]', msg.text());
  });
  if (DEV) await debugPage(page);
  await shell(page);
  await printFlow(page);
  if (DEV) await screensaver(page);
  await kiosk(page);
  if (DEV) await gallery(page);

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
