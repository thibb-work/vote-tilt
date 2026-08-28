/**
 * A screen whose clock is wrong.
 *
 * The rules refuse any position or tally stamped more than five seconds ahead
 * of server time. That is the right rule -- it stops a phone backdating or
 * post-dating its way around a frozen round -- but it means a laptop ten
 * minutes fast had every single write refused, showed a perfect QR code, and
 * said nothing about why. Writes now carry server time, which the database
 * reports on .info/serverTimeOffset, so the local clock stops mattering.
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const BASE = 'http://localhost:3400';
const SKEW_MS = 10 * 60 * 1000;
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
  for (;;) { if (await fn()) return true; if (Date.now() > stop) return false; await sleep(every); }
}
const decodeQr = (uri) => {
  const png = PNG.sync.read(Buffer.from(uri.split(',')[1], 'base64'));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
};

/** Every clock the page can read, pushed ten minutes into the future. */
const FAST_CLOCK = () => {
  const skew = 10 * 60 * 1000;
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + skew;
  const RealDate = Date;
  // eslint-disable-next-line no-global-assign
  window.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [realNow() + skew])); }
    static now() { return realNow() + skew; }
  };
};
const GYRO = () => {
  let a = 0;
  const loop = () => {
    a += 0.04;
    const e = new Event('deviceorientation');
    for (const [k, v] of [['beta', 40 * Math.cos(a)], ['gamma', 40 * Math.sin(a)], ['alpha', 0]]) {
      Object.defineProperty(e, k, { value: v, configurable: true });
    }
    window.dispatchEvent(e);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

const browser = await chromium.launch();

const hostCtx = await browser.newContext();
await hostCtx.addInitScript(FAST_CLOCK);
const host = await hostCtx.newPage();
await host.goto(`${BASE}/host`, { waitUntil: 'domcontentloaded' });
await host.fill('input.field', ENV.HOST_PASSCODE);
await host.click('button[type=submit]');
await host.waitForSelector('img.qr', { timeout: 25000 });
const room = new URL(decodeQr(await host.getAttribute('img.qr', 'src'))).searchParams.get('r');

const line = () => host.locator('.tally-head .status-line').textContent();

check(
  `a host ${SKEW_MS / 60000} minutes fast still serves the room`,
  await until(async () => (await line()).includes('Waiting for the first phone')),
  await line(),
);
check('and its QR code is not marked dead', (await host.locator('img.qr.is-dead').count()) === 0);

// Well past ORPHAN_GRACE_MS: if the writes were being refused this is where it
// would show, because tallyAt only advances on an accepted write.
await sleep(8000);
check('and is still serving eight seconds later', !(await line()).includes('refused') && !(await line()).includes('Not reaching'), await line());

// A phone whose clock is fine, joining a host whose clock is not.
const phoneCtx = await browser.newContext();
await phoneCtx.addInitScript(GYRO);
const phone = await phoneCtx.newPage();
await phone.goto(`${BASE}/?r=${room}`, { waitUntil: 'domcontentloaded' });
await phone.click('button.big-button');
await phone.waitForSelector('.status-line', { timeout: 25000 });
check(
  'a phone joining it is counted, and its tilt reaches the screen',
  await until(async () => (await line()).includes('1 phone') && (await line()).includes('1 aiming')),
  await line(),
);
check(
  'and the phone is not warned about a room nobody is reading',
  (await phone.locator('.status-hint.is-warn').count()) === 0,
  await phone.locator('.status-line').textContent(),
);

// Now the other way round: a phone with the bad clock, a host with a good one.
const fastPhoneCtx = await browser.newContext();
await fastPhoneCtx.addInitScript(FAST_CLOCK);
await fastPhoneCtx.addInitScript(GYRO);
const fastPhone = await fastPhoneCtx.newPage();
await fastPhone.goto(`${BASE}/?r=${room}`, { waitUntil: 'domcontentloaded' });
await fastPhone.click('button.big-button');
await fastPhone.waitForSelector('.status-line', { timeout: 25000 });
check(
  'a phone ten minutes fast is counted too',
  await until(async () => (await line()).includes('2 phones')),
  await line(),
);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
