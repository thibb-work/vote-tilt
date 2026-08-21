import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dotFor, dotsFor, hubScatter, FULL_LEAN_DEG } from '../lib/dots.ts';

const CX = 200, CY = 200, RI = 70, RO = 190;
const at = (heading: number | null, magnitude: number, id = 'p1') =>
  dotFor({ id, heading, magnitude }, CX, CY, RI, RO);

const dist = (d: { x: number; y: number }) => Math.hypot(d.x - CX, d.y - CY);

test('a flat phone parks in the hub rather than disappearing', () => {
  const d = at(null, 0);
  assert.equal(d.flat, true);
  assert.ok(dist(d) < RI, 'flat dot should sit inside the hub');
});

test('a phone inside the dead zone counts as flat even with a heading', () => {
  assert.equal(at(90, 5).flat, true);
});

test('a firm lean reaches the outer edge and stops there', () => {
  const full = at(0, FULL_LEAN_DEG);
  const beyond = at(0, FULL_LEAN_DEG * 3);
  assert.ok(Math.abs(dist(full) - RO) < 0.001);
  assert.ok(Math.abs(dist(beyond) - RO) < 0.001, 'must clamp, not fly off the dial');
});

test('dot radius grows with lean', () => {
  const steps = [16, 25, 35, 45].map((m) => dist(at(0, m)));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] > steps[i - 1]);
});

test('heading 0 points straight up, 90 points right', () => {
  const up = at(0, FULL_LEAN_DEG);
  const right = at(90, FULL_LEAN_DEG);
  assert.ok(up.y < CY && Math.abs(up.x - CX) < 0.001);
  assert.ok(right.x > CX && Math.abs(right.y - CY) < 0.001);
});

test('hub scatter is stable for an id, so dots do not jitter', () => {
  assert.deepEqual(hubScatter('phone-07', 40), hubScatter('phone-07', 40));
  assert.notDeepEqual(hubScatter('phone-07', 40), hubScatter('phone-08', 40));
});

test('scatter stays within its spread', () => {
  for (const id of ['a', 'bb', 'ccc', 'phone-29', 'zzzz']) {
    const s = hubScatter(id, 40);
    assert.ok(Math.hypot(s.x, s.y) <= 40.0001, `${id} escaped the hub`);
  }
});

test('thirty phones produce thirty dots, one per id', () => {
  const readings = Array.from({ length: 30 }, (_, i) => ({
    id: `p${i}`, heading: i % 2 ? (i * 12) % 360 : null, magnitude: i % 2 ? 30 : 2,
  }));
  const dots = dotsFor(readings, CX, CY, RI, RO);
  assert.equal(dots.length, 30);
  assert.equal(new Set(dots.map((d) => d.id)).size, 30);
});
