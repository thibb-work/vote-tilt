/**
 * How long does a tilt take to move a dot on the host screen?
 *
 * Runs a real phone and a real host against the real database, steps the
 * gyroscope between two opposite tilts, and times two things from the instant
 * the sensor event fires:
 *
 *   first move -- when the host dot starts responding at all
 *   settled    -- when it stops moving, having arrived
 *
 * Both pages live in one browser on one machine, so Date.now() is a shared
 * clock and no cross-machine skew can creep into the numbers.
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const BASE = 'http://localhost:3400';
const ROUNDS = Number(process.env.ROUNDS ?? 12);
const ENV = Object.fromEntries(
  fs.readFileSync(new URL('./app.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

/** rAF, not setInterval: a real handset reports at frame rate, and the phone's
    low-pass filter counts samples, so a slower fake would slander the filter. */
const GYRO = () => {
  window.__tilt = { beta: 0, gamma: 0 };
  const fire = () => {
    const e = new Event('deviceorientation');
    for (const [k, v] of [['beta', window.__tilt.beta], ['gamma', window.__tilt.gamma], ['alpha', 0]]) {
      Object.defineProperty(e, k, { value: v, configurable: true });
    }
    window.dispatchEvent(e);
  };
  const loop = () => { fire(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  window.__setTilt = (beta, gamma) => { window.__tilt = { beta, gamma }; fire(); return Date.now(); };
};

/** Watches the rendered position, not the attribute: mid-transition the two
    disagree, and it is the rendered one the room is looking at. */
const WATCH = () => {
  window.__armDot = () => {
    const read = () => {
      const el = document.querySelector('.dot-phone');
      if (!el) return null;
      const s = getComputedStyle(el);
      return { x: parseFloat(s.cx), y: parseFloat(s.cy) };
    };
    const start = read();
    const res = { start, firstMove: null, lastChange: null, settled: null, end: null };
    window.__dot = res;
    let prev = start;
    const loop = () => {
      const p = read();
      if (p && start) {
        const now = Date.now();
        if (res.firstMove === null && Math.hypot(p.x - start.x, p.y - start.y) > 3) res.firstMove = now;
        if (Math.hypot(p.x - prev.x, p.y - prev.y) > 0.25) { prev = p; res.lastChange = now; }
        if (res.firstMove !== null && res.settled === null && res.lastChange && now - res.lastChange > 320) {
          res.settled = res.lastChange;
          res.end = p;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, { timeout = 25000, every = 200 } = {}) {
  const stop = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > stop) return null;
    await sleep(every);
  }
}
const decodeQr = (uri) => {
  const png = PNG.sync.read(Buffer.from(uri.split(',')[1], 'base64'));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
};

const browser = await chromium.launch();

const hostCtx = await browser.newContext();
await hostCtx.addInitScript(WATCH);
const host = await hostCtx.newPage();
await host.goto(`${BASE}/host`, { waitUntil: 'domcontentloaded' });
await host.fill('input.field', ENV.HOST_PASSCODE);
await host.click('button[type=submit]');
await host.waitForSelector('img.qr', { timeout: 25000 });
const room = new URL(decodeQr(await host.getAttribute('img.qr', 'src'))).searchParams.get('r');

const phoneCtx = await browser.newContext();
await phoneCtx.addInitScript(GYRO);
const phone = await phoneCtx.newPage();
await phone.goto(`${BASE}/?r=${room}`, { waitUntil: 'domcontentloaded' });
await phone.click('button.big-button');
await phone.waitForSelector('.status-line', { timeout: 25000 });

if (!(await until(() => host.locator('.dot-phone').count().then((n) => n > 0)))) {
  console.error('the host never drew a dot for the phone');
  process.exit(1);
}

const POSES = [[38, 0], [-38, 0]];
const samples = [];

for (let i = 0; i < ROUNDS; i++) {
  const [beta, gamma] = POSES[i % 2];
  // Let the previous move finish and the low-pass filter come to rest, or the
  // next step is measured from a phone that is still moving.
  await sleep(1400);
  await host.evaluate(() => window.__armDot());
  await sleep(60);
  const t0 = await phone.evaluate(([b, g]) => window.__setTilt(b, g), [beta, gamma]);
  const dot = await until(() => host.evaluate(() => (window.__dot?.settled ? window.__dot : null)), {
    timeout: 6000, every: 60,
  });
  if (!dot) { console.log(`  round ${i + 1}: no movement seen`); continue; }
  // The first step only proves the rig works: the dot starts at the hub and has
  // further to travel than any later one.
  if (i > 0) samples.push({ first: dot.firstMove - t0, settled: dot.settled - t0 });
  console.log(`  round ${i + 1}: first move ${dot.firstMove - t0}ms, settled ${dot.settled - t0}ms${i === 0 ? '  (warm-up, not counted)' : ''}`);
}

await browser.close();

const stat = (key) => {
  const v = samples.map((s) => s[key]).sort((a, b) => a - b);
  return { min: v[0], median: v[Math.floor(v.length / 2)], max: v[v.length - 1] };
};
const f = stat('first'), s = stat('settled');
console.log(`\n${samples.length} timed steps`);
console.log(`  dot starts moving : min ${f.min}ms  median ${f.median}ms  max ${f.max}ms`);
console.log(`  dot has arrived   : min ${s.min}ms  median ${s.median}ms  max ${s.max}ms`);
