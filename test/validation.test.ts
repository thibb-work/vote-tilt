import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTallies, MAX_TALLY_COUNT } from '../lib/tally.ts';
import { rateLimit, resetRateLimit } from '../lib/rateLimit.ts';

/**
 * parseTallies guards the only path where data from a browser is stored. The
 * cookie proves who is asking; these cases cover what they are allowed to say.
 */

test('a well-formed tally is padded to all six wedges', () => {
  assert.deepEqual(parseTallies({ '0': 3, '2': 1 }), {
    '0': 3, '1': 0, '2': 1, '3': 0, '4': 0, '5': 0,
  });
});

test('a wedge index outside the dial is rejected', () => {
  assert.equal(parseTallies({ '6': 1 }), null);
  assert.equal(parseTallies({ '-1': 1 }), null);
});

test('non-numeric and non-integer counts are rejected', () => {
  assert.equal(parseTallies({ '0': 'many' }), null);
  assert.equal(parseTallies({ '0': 1.5 }), null);
  assert.equal(parseTallies({ '0': null }), null);
});

test('NaN and Infinity cannot reach the results screen', () => {
  assert.equal(parseTallies({ '0': Number.NaN }), null);
  assert.equal(parseTallies({ '0': Number.POSITIVE_INFINITY }), null);
});

test('negative counts are rejected', () => {
  assert.equal(parseTallies({ '0': -4 }), null);
});

test('an absurd count is rejected rather than stored', () => {
  assert.equal(parseTallies({ '0': MAX_TALLY_COUNT + 1 }), null);
  assert.equal(parseTallies({ '0': MAX_TALLY_COUNT })?.['0'], MAX_TALLY_COUNT);
});

test('arrays, strings and null are not tallies', () => {
  assert.equal(parseTallies([1, 2, 3]), null);
  assert.equal(parseTallies('0'), null);
  assert.equal(parseTallies(null), null);
  assert.equal(parseTallies(undefined), null);
});

test('a body with more keys than wedges is rejected outright', () => {
  assert.equal(parseTallies({ '0': 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1 }), null);
});

test('a non-numeric key is rejected', () => {
  assert.equal(parseTallies({ constructor: 1 }), null);
  assert.equal(parseTallies({ toString: 2 }), null);
});

test('the passcode limiter blocks a burst and recovers after the window', () => {
  resetRateLimit();
  const t0 = 1_000_000;
  const results = [];
  for (let i = 0; i < 12; i++) results.push(rateLimit('1.2.3.4', t0).allowed);

  assert.equal(results.filter(Boolean).length, 8, 'exactly eight attempts allowed');
  assert.equal(results[8], false, 'the ninth is refused');

  // A different address is unaffected by its neighbour's burst.
  assert.equal(rateLimit('5.6.7.8', t0).allowed, true);

  // Once the window rolls over the original address may try again.
  assert.equal(rateLimit('1.2.3.4', t0 + 60_001).allowed, true);
});

test('a refusal reports how long to wait', () => {
  resetRateLimit();
  const t0 = 2_000_000;
  for (let i = 0; i < 9; i++) rateLimit('9.9.9.9', t0);
  const blocked = rateLimit('9.9.9.9', t0 + 15_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter > 0 && blocked.retryAfter <= 60);
});
