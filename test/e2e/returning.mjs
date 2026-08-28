/**
 * A host screen that has been here before.
 *
 * An incognito window starts with nothing: no saved room id, no Firebase auth
 * session in IndexedDB, no service worker. A normal window has all three, and
 * that is the only difference the browser itself makes. This reloads the same
 * context repeatedly so the second load onwards is a returning visit, and
 * watches whether the screen ever declares itself not connected.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3400';
const LOADS = 5;
const ENV = Object.fromEntries(
  fs.readFileSync(new URL('./app.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, { timeout = 25000, every = 300 } = {}) {
  const stop = Date.now() + timeout;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > stop) return false;
    await sleep(every);
  }
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Every refused request, whatever refused it -- this is what an extension or a
// shield would look like from inside the page.
const failures = [];
page.on('requestfailed', (r) => failures.push(`${r.failure()?.errorText}  ${r.url().slice(0, 90)}`));
page.on('console', (m) => {
  if (m.type() === 'error') failures.push(`console: ${m.text().slice(0, 140)}`);
});

const line = () => page.locator('.tally-head .status-line').textContent();
const notConnected = async () => (await page.locator('.join-warn').count()) > 0;
const deadQr = async () => (await page.locator('img.qr.is-dead').count()) > 0;

for (let i = 1; i <= LOADS; i++) {
  await page.goto(`${BASE}/host`, { waitUntil: 'domcontentloaded' });
  if (i === 1) {
    await page.fill('input.field', ENV.HOST_PASSCODE);
    await page.click('button[type=submit]');
  }
  await page.waitForSelector('.tally-head', { timeout: 25000 });

  const ok = await until(async () => (await line()).includes('Waiting for the first phone'));
  const label = i === 1 ? 'first ever load' : `returning load ${i}`;
  check(`${label}: the screen reports itself connected`, ok, await line());
  check(`${label}: the QR code is live`, !(await deadQr()) && !(await notConnected()));

  // Then hold it, the way a projector does. A screen that only fails after a
  // while is the one nobody catches in testing.
  let flapped = null;
  for (let t = 0; t < 24; t++) {
    await sleep(500);
    if (await notConnected()) { flapped = `${(t + 1) * 0.5}s in: ${await line()}`; break; }
  }
  check(`${label}: still connected after 12s of sitting there`, flapped === null, flapped ?? '');
}

await browser.close();

if (failures.length) {
  console.log(`\nrefused requests / console errors (${failures.length}):`);
  for (const f of [...new Set(failures)].slice(0, 12)) console.log(`  ${f}`);
} else {
  console.log('\nno refused requests, no console errors');
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
