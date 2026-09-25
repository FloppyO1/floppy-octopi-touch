// Smoke test + screenshots at the target resolution (1024x600).
// Run with: docker compose -f dev/docker-compose.yml run --rm playwright
// RECONNECT_TEST=1: also waits for the socket to drop and come back (restart OctoPrint meanwhile).
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://frontend:5173';
const OUT = process.env.SCREENSHOT_DIR ?? '/screenshots';
const VIEWPORT = { width: 1024, height: 600 };

const browser = await chromium.launch();
let failed = false;

const text = (page, id) => page.textContent(`[data-testid=${id}]`);
const waitText = (page, id, predicate, timeout = 30_000) =>
  page.waitForFunction(
    ([sel, src]) => new Function('t', `return (${src})(t)`)(document.querySelector(sel)?.textContent ?? ''),
    [`[data-testid=${id}]`, predicate.toString()],
    { timeout },
  );

try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('console', (msg) => msg.type() === 'error' && console.error('[browser]', msg.text()));
  await page.goto(`${BASE_URL}/`);

  // Live data: socket open, temperatures arriving, history growing.
  await waitText(page, 'socket-status', (t) => t === 'connected', 60_000);
  await page.waitForSelector('[data-testid=temperatures]', { timeout: 30_000 });
  const samples = await text(page, 'temp-samples');
  await waitText(page, 'temp-samples', new Function(`return (t) => t !== ${JSON.stringify(samples)}`)());
  // Capabilities: the dashboard sends M115 itself when the report is unknown.
  await waitText(page, 'firmware-name', (t) => t.startsWith('Marlin'));
  await waitText(page, 'capabilities', (t) => t.includes('eepromyes'));
  await waitText(page, 'files-summary', (t) => /local [1-9]/.test(t));
  for (const id of ['octoprint-version', 'printer-phase', 'firmware-name', 'files-summary', 'temp-samples']) {
    console.log(`${id.padEnd(18)}:`, (await text(page, id))?.trim());
  }
  console.log('capabilities      :', (await text(page, 'capabilities'))?.replace(/\s+/g, ' ').trim());
  console.log('plugins           :', (await text(page, 'plugins'))?.replace(/\s+/g, ' ').trim());

  // Host prompt: force prompt support on, trigger a prompt from the Virtual Printer, answer it.
  const override = page.getByRole('button', { name: /^Override:/ });
  while (!(await override.textContent()).includes('on')) await override.click();
  await waitText(page, 'prompt-enabled', (t) => t === 'yes');
  await page.getByRole('button', { name: 'Test prompt' }).click();
  await page.waitForSelector('[data-testid=prompt]', { timeout: 15_000 });
  await page.screenshot({ path: `${OUT}/debug-prompt.png` });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForSelector('[data-testid=prompt]', { state: 'detached' });
  await waitText(page, 'terminal', (t) => t.includes('M876 S0'), 15_000);
  console.log('prompt            : shown and answered with M876 S0');

  await page.getByRole('button', { name: 'Test notification' }).click();
  await waitText(page, 'notifications', (t) => t.includes('Heating done'), 15_000);
  console.log('notification      : received');
  while (!(await override.textContent()).includes('auto')) await override.click();

  // Language is persisted through the agent: switch, reload, still Italian.
  await page.getByRole('button', { name: 'IT', exact: true }).click();
  await waitText(page, 'settings-status', (t) => t.startsWith('ready'));
  await page.waitForTimeout(600); // debounced save
  await page.reload();
  await waitText(page, 'socket-status', (t) => t === 'connesso', 60_000);
  await page.waitForSelector('[data-testid=temperatures]');
  await page.screenshot({ path: `${OUT}/debug-it.png` });
  console.log('language          : persisted (it)');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.waitForTimeout(600);
  await waitText(page, 'settings-status', (t) => t.startsWith('ready'));
  await page.screenshot({ path: `${OUT}/debug-en.png` });

  if (process.env.RECONNECT_TEST) {
    console.log('reconnect         : restart OctoPrint now…');
    await waitText(page, 'socket-status', (t) => t !== 'connected', 120_000);
    console.log('reconnect         : socket dropped');
    await waitText(page, 'socket-status', (t) => t === 'connected', 120_000);
    const before = await text(page, 'temp-samples');
    await waitText(page, 'temp-samples', new Function(`return (t) => t !== ${JSON.stringify(before)}`)());
    console.log('reconnect         : socket back, temperatures flowing');
  }

  const preview = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await preview.goto(`${BASE_URL}/preview.html`);
  await preview.frameLocator('iframe').locator('[data-testid=temperatures]').waitFor();
  await preview.screenshot({ path: `${OUT}/preview.png` });

  console.log(`screenshots saved to ${OUT}`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
}

process.exit(failed ? 1 : 0);
