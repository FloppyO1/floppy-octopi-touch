// Smoke test + screenshots at the target resolution (1024x600).
// Run with: docker compose -f dev/docker-compose.yml run --rm playwright
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://frontend:5173';
const OUT = process.env.SCREENSHOT_DIR ?? '/screenshots';
const VIEWPORT = { width: 1024, height: 600 };

const browser = await chromium.launch();
let failed = false;

try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('console', (msg) => msg.type() === 'error' && console.error('[browser]', msg.text()));
  await page.goto(`${BASE_URL}/`);

  // Live temperatures: the table appears and the "updated" timestamp changes.
  await page.waitForSelector('[data-testid=temperatures]', { timeout: 60_000 });
  const first = await page.textContent('[data-testid=updated-at]');
  await page.waitForFunction(
    (prev) => document.querySelector('[data-testid=updated-at]')?.textContent !== prev,
    first,
    { timeout: 15_000 },
  );
  console.log('octoprint:', await page.textContent('[data-testid=octoprint-version]'));
  console.log('printer  :', await page.textContent('[data-testid=printer-state]'));
  console.log('temps    :', (await page.textContent('[data-testid=temperatures] tbody'))?.trim());
  await page.screenshot({ path: `${OUT}/home-en.png` });

  await page.getByRole('button', { name: 'IT' }).click();
  await page.screenshot({ path: `${OUT}/home-it.png` });

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
