// Touch target audit: lists the visible interactive elements smaller than 56 px on every screen (1024x600).
// Run with: docker compose -f dev/docker-compose.yml run --rm playwright sh -c "npm install && node targets.mjs"
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://frontend:5173';
const MIN = Number(process.env.MIN_TARGET ?? 56);
const VIEWS = [
  ['home', []],
  ['files', []],
  ['files', ['files-search']],
  ['temperature', []],
  ['temperature', ['set-tool0']],
  ['move', []],
  ['filament', []],
  ['terminal', []],
  ['terminal', ['terminal-tab-macros']],
  ['leveling', []],
  ['leveling', ['leveling-tab-mesh']],
  ['leveling', ['leveling-tab-z']],
  ['system', []],
  ['system', ['system-tab-settings']],
  ['system', ['system-tab-about']],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
let small = 0;
for (const [screen, taps] of VIEWS) {
  await page.goto('about:blank'); // a hash change alone would keep the dialogs of the previous view
  await page.goto(`${BASE_URL}/#/${screen}`);
  await page.waitForSelector(`[data-testid=screen-${screen}]`);
  await page.waitForTimeout(800);
  for (const id of taps) {
    const tab = page.getByTestId(id);
    if (await tab.count()) await tab.click();
    await page.waitForTimeout(300);
  }
  const found = await page.evaluate((min) => {
    const selector = 'button, a[href], input, textarea, [role=button], [role=switch], [role=radio], [role=tab], [role=option]';
    return [...document.querySelectorAll(selector)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const visible = r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && r.bottom > 0 && r.top < 600;
        return visible && (r.width < min || r.height < min);
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        const name = el.dataset.testid || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 30);
        return `${Math.round(r.width)}x${Math.round(r.height)} ${el.tagName.toLowerCase()} "${name}"`;
      });
  }, MIN);
  const label = [screen, ...taps].join(' > ');
  console.log(`\n${label}: ${found.length ? '' : 'ok'}`);
  for (const line of found) console.log(`  ${line}`);
  small += found.length;
}
console.log(`\n${small} targets under ${MIN} px`);
await browser.close();
