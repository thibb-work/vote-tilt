import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimRoom,
  pointerToReading,
  stepSimRoom,
  toReadings,
  SIM_PHONE_COUNT,
} from '../lib/demoRoom.ts';
import { DEAD_ZONE_DEG, WEDGE_COUNT, angleDelta, headingToWedge, wedgeCentre } from '../lib/tilt.ts';

/** Seeded so a drifting room can be asserted on without waiting for real time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inRange = (phones: ReturnType<typeof createSimRoom>) => {
  for (const p of phones) {
    assert.ok(p.heading >= 0 && p.heading < 360, `heading out of range: ${p.heading}`);
    assert.ok(p.magnitude >= 0 && p.magnitude <= 90, `magnitude out of range: ${p.magnitude}`);
    assert.ok(p.target >= 0 && p.target < WEDGE_COUNT, `target out of range: ${p.target}`);
  }
};

test('a room opens with the requested number of phones, all in range', () => {
  const phones = createSimRoom(SIM_PHONE_COUNT, 1000, seeded(1));
  assert.equal(phones.length, SIM_PHONE_COUNT);
  assert.equal(new Set(phones.map((p) => p.id)).size, SIM_PHONE_COUNT, 'ids are distinct');
  inRange(phones);
});

test('stepping never drives a phone out of range, however long it runs', () => {
  const random = seeded(7);
  let phones = createSimRoom(SIM_PHONE_COUNT, 0, random);
  for (let i = 1; i <= 2000; i++) {
    phones = stepSimRoom(phones, i * 120, random);
    assert.equal(phones.length, SIM_PHONE_COUNT, 'the room neither grows nor shrinks');
  }
  inRange(phones);
});

test('a phone eases toward the wedge it is aiming for', () => {
  const random = seeded(3);
  const phones = createSimRoom(1, 0, random);
  // Hold the target still by stepping well before any phone reconsiders.
  const target = phones[0].target;
  const before = Math.abs(angleDelta(wedgeCentre(target), phones[0].heading));

  let moved = phones;
  for (let i = 1; i <= 20; i++) moved = stepSimRoom(moved, i * 50, random);

  assert.equal(moved[0].target, target, 'the target did not change during the run');
  const after = Math.abs(angleDelta(wedgeCentre(target), moved[0].heading));
  assert.ok(after < before, `expected to close on the wedge: ${before} -> ${after}`);
});

test('the room does not sit still -- phones move between wedges over time', () => {
  const random = seeded(11);
  let phones = createSimRoom(SIM_PHONE_COUNT, 0, random);
  const first = phones.map((p) => p.target);

  for (let i = 1; i <= 400; i++) phones = stepSimRoom(phones, i * 120, random);

  const changed = phones.filter((p, i) => p.target !== first[i]).length;
  assert.ok(changed > 0, 'no phone ever picked a new wedge');
});

test('a flat phone reports no heading, so it lands in the hub rather than a wedge', () => {
  const phones = createSimRoom(SIM_PHONE_COUNT, 0, seeded(5));
  for (const reading of toReadings(phones)) {
    const source = phones.find((p) => p.id === reading.id);
    assert.ok(source);
    if (source.magnitude < DEAD_ZONE_DEG) {
      assert.equal(reading.heading, null, 'a flat phone must not land in a wedge');
    } else {
      assert.equal(typeof reading.heading, 'number');
    }
    assert.equal(reading.magnitude, source.magnitude);
  }
});

// --- pointer input ------------------------------------------------------------
//
// A visitor on a laptop drives the needle with a pointer, and the reading it
// produces has to be indistinguishable from a gyroscope's or the demo would
// teach the wrong thing.

test('a pointer reads the same compass a tilt does', () => {
  // Screen coordinates: y grows downward, so "up" is a negative dy.
  assert.equal(Math.round(pointerToReading(0, -100, 100).heading), 0, 'up');
  assert.equal(Math.round(pointerToReading(100, 0, 100).heading), 90, 'right');
  assert.equal(Math.round(pointerToReading(0, 100, 100).heading), 180, 'down');
  assert.equal(Math.round(pointerToReading(-100, 0, 100).heading), 270, 'left');
});

test('a pointer heading lands in the wedge it points at', () => {
  for (let w = 0; w < WEDGE_COUNT; w++) {
    const deg = (wedgeCentre(w) * Math.PI) / 180;
    const { heading } = pointerToReading(Math.sin(deg) * 80, -Math.cos(deg) * 80, 100);
    assert.equal(headingToWedge(heading), w, `wedge ${w}`);
  }
});

test('lean grows with distance from the hub and clamps at the limit', () => {
  assert.equal(pointerToReading(0, 0, 100).magnitude, 0, 'the hub is flat');
  // A quarter of the way out lands exactly on the dead-zone edge, and the rule is
  // strictly "less than", so pick a point genuinely inside the hub.
  assert.ok(pointerToReading(0, -18, 100).magnitude < DEAD_ZONE_DEG, 'near the hub abstains');
  assert.equal(pointerToReading(0, -25, 100).magnitude, DEAD_ZONE_DEG, 'the edge is the edge');
  assert.ok(pointerToReading(0, -90, 100).magnitude > DEAD_ZONE_DEG, 'out at the rim commits');
  assert.equal(pointerToReading(0, -1000, 100).magnitude, 90, 'clamped at the limit');
});

test('a zero-radius dial cannot divide by zero', () => {
  const reading = pointerToReading(10, 10, 0);
  assert.equal(reading.magnitude, 0);
  assert.ok(Number.isFinite(reading.heading));
});
