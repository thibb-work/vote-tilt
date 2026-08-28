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

/**
 * A deterministic stand-in for sensor noise. Real jitter is random; a fixed
 * pseudo-random sequence keeps the test from failing once a fortnight while
 * still being the zero-mean wobble the adaptive filter has to ignore.
 */
function noise(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s / 0x100000000) * 2 - 1;
  };
}

test('a held phone stays put through three degrees of sensor noise', () => {
  const t = createTiltTracker();
  settle(t, 0, 45);
  const rnd = noise(7);
  const headings: number[] = [];
  for (let i = 0; i < 300; i++) {
    const r = t.update({ beta: -45 + rnd() * 3, gamma: 0 + rnd() * 3 });
    if (r.heading !== null) headings.push(r.heading);
  }
  // The dot must not visibly crawl. Relaxing the filter on noise alone would
  // show up here as several degrees of swing at the tip of the needle. Measured
  // as signed offsets from the first reading, because a phone held at heading 0
  // straddles the wrap and raw min/max would call that a 360 degree wander.
  const offsets = headings.map((h) => angleDelta(h, headings[0]));
  const spread = Math.max(...offsets) - Math.min(...offsets);
  // The bar is the filter this one replaced: on this exact input a flat 0.2
  // weight also wandered 4.8 deg, and no filter at all wandered 8.0. Relaxing on
  // speed is only allowed to buy tracking, never to sell steadiness back.
  assert.ok(spread < 5, `held phone wandered ${spread.toFixed(1)} deg`);
});

test('a swung phone catches up faster than a held one is allowed to', () => {
  // A deliberate sweep: 60 degrees of heading over ten samples, a sixth of a
  // second on a 60Hz handset.
  const sweep = (t: ReturnType<typeof createTiltTracker>) => {
    for (let i = 1; i <= 10; i++) {
      const h = (60 * i) / 10;
      const rad = (h * Math.PI) / 180;
      t.update({ beta: -45 * Math.cos(rad), gamma: 45 * Math.sin(rad) });
    }
    return t.update({ beta: -45 * Math.cos(Math.PI / 3), gamma: 45 * Math.sin(Math.PI / 3) });
  };

  const t = createTiltTracker();
  settle(t, 0, 45);
  const after = sweep(t);

  // Fixed 0.2 smoothing reaches about 70% of a step in eleven samples, which on
  // a 60 degree sweep leaves the dot some 18 degrees behind the hand.
  assert.ok(after.heading !== null);
  const behind = Math.abs(angleDelta(after.heading, 60));
  assert.ok(behind < 8, `dot lagged the sweep by ${behind.toFixed(1)} deg`);
});
