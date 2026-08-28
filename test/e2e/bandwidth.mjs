/**
 * What one phone actually costs the host, on the wire.
 *
 * The database is on the free plan, whose ceiling is downloaded bytes, so the
 * number that matters is what the HOST receives -- it is the one client reading
 * every phone. Measured off the real websocket frames, not estimated from the
 * shape of the JSON.
 */
import { chromium } from 'playwright';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const BASE = 'http://localhost:3400';
const SECONDS = 30;
const ENV = Object.fromEntries(
  fs.readFileSync(new URL('./app.env', import.meta.url), 'utf8')
    .split('\n').filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const GYRO = () => {
  let a = 0;
  const loop = () => {
    a += 0.05;
    const e = new Event('deviceorientation');
    for (const [k, v] of [['beta', 40 * Math.cos(a)], ['gamma', 40 * Math.sin(a)], ['alpha', 0]]) {
      Object.defineProperty(e, k, { value: v, configurable: true });
    }
    window.dispatchEvent(e);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decodeQr = (uri) => {
  const png = PNG.sync.read(Buffer.from(uri.split(',')[1], 'base64'));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
};

const browser = await chromium.launch();
const host = await (await browser.newContext()).newPage();

let hostIn = 0, hostOut = 0, frames = 0;
host.on('websocket', (ws) => {
  ws.on('framereceived', (f) => { hostIn += f.payload.length; frames++; });
  ws.on('framesent', (f) => { hostOut += f.payload.length; });
});

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
await sleep(3000);

// Only the steady state counts: the sign-in and first sync are one-offs.
hostIn = 0; hostOut = 0; frames = 0;
await sleep(SECONDS * 1000);
await browser.close();

const perPhoneIn = hostIn / SECONDS;
console.log(`host, one phone, steady state over ${SECONDS}s`);
console.log(`  received ${(perPhoneIn).toFixed(0)} B/s over ${(frames / SECONDS).toFixed(1)} frames/s`);
console.log(`  sent     ${(hostOut / SECONDS).toFixed(0)} B/s  (its own tally)`);
console.log('');
for (const n of [10, 30]) {
  // The tally the host sends is one write however big the room is; only the
  // phone traffic multiplies.
  const perHour = perPhoneIn * n * 3600;
  console.log(`  ${n} phones -> host downloads ~${(perHour / 1e6).toFixed(0)} MB/hour`);
  console.log(`             -> ${(10e9 / perHour).toFixed(0)} hours of a full room inside the free 10 GB/month`);
}
