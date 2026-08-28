/**
 * End-to-end proof for the orphaned-room warning.
 *
 * Runs the real host screen and a real phone against the real Firebase
 * database, and reproduces the reported failure -- a phone in a room the host
 * has retired -- to show the phone now says so.
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const BASE = 'http://localhost:3400';
const ENV = Object.fromEntries(
  fs
    .readFileSync(new URL('./app.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -- ${detail}` : ''}`);
};

/** A laptop has no gyroscope, and ActivateGate refuses without one real sample. */
const FAKE_GYRO = () => {
  setInterval(() => {
    const e = new Event('deviceorientation');
    Object.defineProperty(e, 'beta', { value: 22, configurable: true });
    Object.defineProperty(e, 'gamma', { value: 14, configurable: true });
    Object.defineProperty(e, 'alpha', { value: 0, configurable: true });
    window.dispatchEvent(e);
  }, 80);
};

function decodeQr(dataUri) {
  const png = PNG.sync.read(Buffer.from(dataUri.split(',')[1], 'base64'));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll a predicate rather than sleep a fixed time, so a slow socket is not a failure. */
async function until(fn, { timeout = 20000, every = 400 } = {}) {
  const stop = Date.now() + timeout;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > stop) return false;
    await sleep(every);
  }
}

// innerText would come back shouting: the status line is text-transform: uppercase.
const hostLine = (page) => page.locator('.tally-head .status-line').textContent();
const phoneLine = (page) => page.locator('.status-line').textContent();
const phoneWarned = async (page) => (await page.locator('.status-hint.is-warn').count()) > 0;

async function hostRoomId(page) {
  await page.waitForSelector('img.qr', { timeout: 20000 });
  const link = decodeQr(await page.getAttribute('img.qr', 'src'));
  return new URL(link).searchParams.get('r');
}

const browser = await chromium.launch();

// ---- the host screen -------------------------------------------------------
const hostCtx = await browser.newContext();
const host = await hostCtx.newPage();
await host.goto(`${BASE}/host`, { waitUntil: 'domcontentloaded' });
await host.fill('input.field', ENV.HOST_PASSCODE);
await host.click('button[type=submit]');
await host.waitForSelector('.tally-head', { timeout: 20000 });

const room1 = await hostRoomId(host);
check('host mints a room and shows a code for it', Boolean(room1), room1 ?? '');

check(
  'an empty room reads as waiting for a phone, not as a dead socket',
  await until(async () => (await hostLine(host)).includes('Waiting for the first phone')),
  await hostLine(host),
);

// ---- a phone that scanned that code ----------------------------------------
const phoneCtx = await browser.newContext();
await phoneCtx.addInitScript(FAKE_GYRO);
const phone = await phoneCtx.newPage();
await phone.goto(`${BASE}/?r=${room1}`, { waitUntil: 'domcontentloaded' });
await phone.click('button.big-button');
await phone.waitForSelector('.status-line', { timeout: 20000 });

check(
  'the host sees the phone arrive',
  await until(async () => (await hostLine(host)).includes('1 phone')),
  await hostLine(host),
);

// Well past ORPHAN_GRACE_MS: a watched room must never raise the warning.
await sleep(8000);
check('a watched room raises no warning', !(await phoneWarned(phone)), await phoneLine(phone));
check(
  'and the phone reports its aim as usual',
  !(await phoneLine(phone)).includes('Waiting for the host screen'),
  await phoneLine(phone),
);

// ---- a dropped socket is a different failure -------------------------------
const offlineCtx = await browser.newContext();
await offlineCtx.addInitScript(FAKE_GYRO);
const dropped = await offlineCtx.newPage();
await dropped.goto(`${BASE}/?r=${room1}`, { waitUntil: 'domcontentloaded' });
await dropped.click('button.big-button');
await dropped.waitForSelector('.status-line', { timeout: 20000 });
// Demand a genuinely healthy socket before cutting it, or the offline case
// below proves nothing: an unconnected phone shows Reconnecting either way.
check(
  'a second phone joins the same room cleanly',
  await until(async () => {
    const line = await phoneLine(dropped);
    return !line.includes('Reconnecting') && !(await phoneWarned(dropped));
  }),
  await phoneLine(dropped),
);
await sleep(6000);
check(
  'and is demonstrably watched before the socket is cut',
  !(await phoneWarned(dropped)) && !(await phoneLine(dropped)).includes('Reconnecting'),
  await phoneLine(dropped),
);

await offlineCtx.setOffline(true);
check(
  'an offline phone says Reconnecting',
  await until(async () => (await phoneLine(dropped)).includes('Reconnecting')),
  await phoneLine(dropped),
);
// Well past the grace window: a dead socket must never be reported as an
// orphaned room, or the room chases the wrong fix.
await sleep(9000);
check(
  'and never blames the room for its own socket',
  !(await phoneWarned(dropped)),
  await phoneLine(dropped),
);
await offlineCtx.close();

// ---- New QR asks twice ------------------------------------------------------
const newQr = host.locator('.controls button', { hasText: /New QR|Confirm/ });
await newQr.click();
check(
  'one click on New QR only arms it',
  (await newQr.textContent()).includes('Confirm'),
  await newQr.textContent(),
);
check('and does not retire the room', (await hostRoomId(host)) === room1);
check('the phone is untouched by the arming click', !(await phoneWarned(phone)));

await sleep(5000);
check(
  'an unconfirmed click disarms itself',
  (await newQr.textContent()).trim() === 'New QR',
  await newQr.textContent(),
);
check('the room survived the misclick', (await hostRoomId(host)) === room1);

// ---- the reported bug -------------------------------------------------------
await newQr.click();
await newQr.click();
const room2 = await until(async () => (await hostRoomId(host)) !== room1);
check('two clicks do retire the room', room2);

check(
  'THE BUG: a phone left in the retired room now says so',
  await until(async () => (await phoneWarned(phone)) && (await phoneLine(phone)).includes('Waiting for the host screen')),
  await phoneLine(phone),
);
check(
  'and the host is back to waiting for a phone',
  await until(async () => (await hostLine(host)).includes('Waiting for the first phone')),
  await hostLine(host),
);

// ---- a code no host ever watched -------------------------------------------
const stranger = await phoneCtx.newPage();
await stranger.goto(`${BASE}/?r=bcdfghjkmnpqrs`, { waitUntil: 'domcontentloaded' });
await stranger.click('button.big-button');
await stranger.waitForSelector('.status-line', { timeout: 20000 });
check(
  'a room that never had a host is reported too',
  await until(async () => (await phoneWarned(stranger)) && (await phoneLine(stranger)).includes('Waiting for the host screen')),
  await phoneLine(stranger),
);

// ---- recovery: rescanning fixes it ------------------------------------------
await phone.goto(`${BASE}/?r=${await hostRoomId(host)}`, { waitUntil: 'domcontentloaded' });
await phone.click('button.big-button');
await phone.waitForSelector('.status-line', { timeout: 20000 });
check(
  'scanning the new code clears the warning',
  await until(async () => !(await phoneWarned(phone)) && (await hostLine(host)).includes('1 phone')),
  `${await phoneLine(phone)} | ${await hostLine(host)}`,
);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
