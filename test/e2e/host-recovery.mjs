/**
 * The failure the room actually hit: a host screen whose anonymous sign-in was
 * refused once at load. It kept a QR code on the projector and never connected
 * again, so every phone that scanned wrote into a room nobody was reading.
 *
 * Runs the real host screen and a real phone against the real database.
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const BASE = 'http://localhost:3400';
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

const FAKE_GYRO = () => {
  setInterval(() => {
    const e = new Event('deviceorientation');
    Object.defineProperty(e, 'beta', { value: 22, configurable: true });
    Object.defineProperty(e, 'gamma', { value: 14, configurable: true });
    Object.defineProperty(e, 'alpha', { value: 0, configurable: true });
    window.dispatchEvent(e);
  }, 80);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, { timeout = 25000, every = 400 } = {}) {
  const stop = Date.now() + timeout;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > stop) return false;
    await sleep(every);
  }
}

// textContent, not innerText: these elements are text-transform: uppercase and
// innerText comes back shouting, so every comparison would fail on a good screen.
const hostLine = (p) => p.locator('.tally-head .status-line').textContent();
const phoneLine = (p) => p.locator('.status-line').textContent();
const phoneWarned = async (p) => (await p.locator('.status-hint.is-warn').count()) > 0;
const qrDead = async (p) => (await p.locator('img.qr.is-dead').count()) > 0;
const qrShown = async (p) => (await p.locator('img.qr').count()) > 0;

async function hostRoomId(page) {
  await page.waitForSelector('img.qr', { timeout: 20000 });
  const png = PNG.sync.read(Buffer.from((await page.getAttribute('img.qr', 'src')).split(',')[1], 'base64'));
  return new URL(jsQR(new Uint8ClampedArray(png.data), png.width, png.height).data)
    .searchParams.get('r');
}

const browser = await chromium.launch();

// ---- a host whose sign-in is refused at load --------------------------------
const hostCtx = await browser.newContext();
// Exactly the request that fails when a laptop is still waking or a wifi
// handover is mid-flight. Everything else on the page works.
await hostCtx.route('**://identitytoolkit.googleapis.com/**', (r) => r.abort());

const host = await hostCtx.newPage();
await host.goto(`${BASE}/host`, { waitUntil: 'domcontentloaded' });
await host.fill('input.field', ENV.HOST_PASSCODE);
await host.click('button[type=submit]');
await host.waitForSelector('.tally-head', { timeout: 20000 });

// Polled, not sampled: the code is encoded asynchronously, so it appears a
// beat after .tally-head does and a bare check here is a coin toss.
check('the host screen still renders with no identity', await until(() => qrShown(host)));
check(
  'THE BUG: it says it cannot sign in, instead of "Connecting" forever',
  await until(async () => (await hostLine(host)).includes('Cannot sign in')),
  (await hostLine(host)).trim(),
);
check(
  'and the QR code is marked unscannable rather than looking healthy',
  await until(() => qrDead(host)),
);

const room = await hostRoomId(host);

// ---- a phone that scans that code anyway ------------------------------------
const phoneCtx = await browser.newContext();
await phoneCtx.addInitScript(FAKE_GYRO);
const phone = await phoneCtx.newPage();
await phone.goto(`${BASE}/?r=${room}`, { waitUntil: 'domcontentloaded' });
await phone.click('button.big-button');
await phone.waitForSelector('.status-line', { timeout: 20000 });

check(
  'the phone reports the room nobody is reading',
  await until(async () => (await phoneWarned(phone)) && (await phoneLine(phone)).includes('Waiting for the host screen')),
  (await phoneLine(phone)).trim(),
);

// ---- the network comes back. Nobody reloads anything. -----------------------
await hostCtx.unroute('**://identitytoolkit.googleapis.com/**');

check(
  'THE FIX: the host signs in on its own, with no reload',
  await until(async () => (await hostLine(host)).includes('phone') || (await hostLine(host)).includes('Waiting for the first phone')),
  (await hostLine(host)).trim(),
);
check('the QR code goes live again', await until(async () => !(await qrDead(host))));
check(
  'the host now sees the phone that was already waiting',
  await until(async () => (await hostLine(host)).includes('1 phone')),
  (await hostLine(host)).trim(),
);
check(
  'and the phone stops warning, without being touched',
  await until(async () => !(await phoneWarned(phone))),
  (await phoneLine(phone)).trim(),
);
check(
  'the phone is reported as aiming, so tilt reaches the host screen',
  await until(async () => (await hostLine(host)).includes('1 aiming')),
  (await hostLine(host)).trim(),
);

// ---- a host that loses the room mid-round says so ---------------------------
await hostCtx.setOffline(true);
check(
  'a host cut off mid-round stops claiming to serve the room',
  await until(async () => {
    const l = await hostLine(host);
    return l.includes('Connecting') || l.includes('Not reaching the room') || l.includes('Cannot sign in');
  }),
  (await hostLine(host)).trim(),
);
check('and its QR code is marked unscannable', await until(() => qrDead(host)));
await hostCtx.close();

// A healthy host must never be marked dead: hold one and watch it stay live.
const wellCtx = await browser.newContext();
const well = await wellCtx.newPage();
await well.goto(`${BASE}/host`, { waitUntil: 'domcontentloaded' });
await well.fill('input.field', ENV.HOST_PASSCODE);
await well.click('button[type=submit]');
await well.waitForSelector('img.qr', { timeout: 20000 });
await sleep(9000);
check(
  'a healthy host never flashes the warning',
  !(await qrDead(well)) && !(await hostLine(well)).includes('Not reaching'),
  (await hostLine(well)).trim(),
);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
