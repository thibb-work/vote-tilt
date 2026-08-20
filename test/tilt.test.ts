import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTiltTracker,
  headingToWedge,
  angleDelta,
  WEDGE_COUNT,
} from '../lib/tilt.ts';

/** Feed a steady tilt until the smoothing filter has converged. */
function settle(t: ReturnType<typeof createTiltTracker>, heading: number, magnitude: number) {
  const rad = (heading * Math.PI) / 180;
  let last = t.update({ beta: 0, gamma: 0 });
  for (let i = 0; i < 120; i++) {
    last = t.update({
      beta: -magnitude * Math.cos(rad),
      gamma: magnitude * Math.sin(rad),
    });
  }
  return last;
}

test('a flat phone is not a vote', () => {
  const t = createTiltTracker();
  const r = settle(t, 0, 0);
  assert.equal(r.wedge, null);
  assert.equal(r.heading, null);
});

test('each wedge centre selects its own wedge', () => {
  for (let w = 0; w < WEDGE_COUNT; w++) {
    const t = createTiltTracker();
    const r = settle(t, w * 60, 45);
    assert.equal(r.wedge, w, `heading ${w * 60} should be wedge ${w}`);
  }
});

test('headingToWedge wraps cleanly across 360', () => {
  assert.equal(headingToWedge(0), 0);
  assert.equal(headingToWedge(359), 0);
  assert.equal(headingToWedge(29.9), 0);
  assert.equal(headingToWedge(30.1), 1);
  assert.equal(headingToWedge(-30.1), 5);
});

test('angleDelta takes the short way round', () => {
  assert.equal(angleDelta(350, 10), -20);
  assert.equal(angleDelta(10, 350), 20);
});

test('hysteresis holds the wedge just past the boundary', () => {
  const t = createTiltTracker();
  settle(t, 0, 45);
  // Boundary is 30 deg; hysteresis carries it to 38.
  assert.equal(settle(t, 35, 45).wedge, 0, 'inside hysteresis band, must not switch');
  assert.equal(settle(t, 45, 45).wedge, 1, 'past the band, must switch');
});

test('a vote survives a wobble but not a flattening', () => {
  const t = createTiltTracker();
  settle(t, 120, 45);
  assert.equal(settle(t, 120, 12).wedge, 2, 'still tilted enough to hold the vote');
  assert.equal(settle(t, 120, 4).wedge, null, 'flat again means abstaining');
});

test('a border-parked phone does not oscillate', () => {
  const t = createTiltTracker();
  settle(t, 0, 45);
  const seen = new Set<number | null>();
  for (let i = 0; i < 200; i++) {
    // Jitter of +/-4 deg straddling the 30 deg boundary.
    const h = 30 + (Math.random() * 8 - 4);
    const rad = (h * Math.PI) / 180;
    seen.add(t.update({ beta: -45 * Math.cos(rad), gamma: 45 * Math.sin(rad) }).wedge);
  }
  assert.deepEqual([...seen], [0], `wedge flickered: ${[...seen].join(',')}`);
});
