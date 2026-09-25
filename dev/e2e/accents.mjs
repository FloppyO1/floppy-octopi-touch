// Screenshots of the accent colour variants (session 3 decision): Home while printing, the NumPad
// over Home, and the full UI gallery, for every accent.
// Run with: docker compose -f dev/docker-compose.yml run --rm playwright sh -c "npm install && node accents.mjs"
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://frontend:5173';
const OUT = process.env.SCREENSHOT_DIR ?? '/screenshots';
const ACCENTS = ['amber', 'teal', 'indigo'];
const FILE = 'calibration-cube_prusaslicer.gcode';

const browser = await chromium.launch();
let failed = false;

async function api(page, method, path, body) {
  return page.evaluate(
    async ([method, path, body]) => {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      return res.status;
    },
    [method, path, body],
  );
}

try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  page.on('console', (msg) => msg.type() === 'error' && console.error('[browser]', msg.text()));
  await page.goto(`${BASE_URL}/#/home`);
  await page.waitForSelector('[data-testid=gauge-hotend]', { timeout: 60_000 });
  await page.waitForSelector('[data-testid=connection-overlay]', { state: 'detached', timeout: 60_000 });
  await page.waitForSelector('[data-testid=printer-overlay]', { state: 'detached', timeout: 30_000 });

  // A print makes Home representative: heating rings, job progress, status pill.
  console.log('start print:', await api(page, 'POST', `/api/files/local/${FILE}`, { command: 'select', print: true }));
  await page.waitForFunction(() => window.__fot.printer.busy, null, { timeout: 30_000 });
  await page.waitForTimeout(4000);

  for (const accent of ACCENTS) {
    await page.evaluate((a) => (document.documentElement.dataset.accent = a), accent);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/accent-${accent}-home.png` });
  }
  await page.getByTestId('gauge-hotend').click();
  await page.waitForSelector('[data-testid=numpad]');
  await page.waitForTimeout(300);
  for (const accent of ACCENTS) {
    await page.evaluate((a) => (document.documentElement.dataset.accent = a), accent);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/accent-${accent}-numpad.png` });
  }
  await page.keyboard.press('Escape');
  console.log('cancel print:', await api(page, 'POST', '/api/job', { command: 'cancel' }));

  const gallery = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  for (const accent of ACCENTS) {
    await gallery.goto(`${BASE_URL}/ui-gallery?accent=${accent}`);
    await gallery.waitForSelector('[data-testid=keyboard]');
    await gallery.waitForTimeout(500);
    await gallery.screenshot({ path: `${OUT}/accent-${accent}-gallery.png`, fullPage: true });
  }
  console.log(`screenshots saved to ${OUT}`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
