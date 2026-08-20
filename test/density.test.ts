import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillFor, needsLightText, MIN_FILL, MAX_FILL, FLIP_TEXT_ABOVE } from '../lib/density.ts';

test('an empty wedge keeps the faint base tint, never nothing', () => {
  assert.equal(fillFor(0, 9), MIN_FILL);
});

test('the leading wedge reaches full fill', () => {
  assert.equal(fillFor(9, 9), MAX_FILL);
});

test('darkness rises with the count', () => {
  const steps = [0, 1, 2, 5, 9].map((c) => fillFor(c, 9));
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] > steps[i - 1], `fill should climb at step ${i}`);
  }
});

test('a wedge never out-darkens the leader even if counts race ahead', () => {
  assert.equal(fillFor(12, 9), MAX_FILL);
});

test('an empty room does not divide by zero', () => {
  assert.equal(fillFor(0, 0), MIN_FILL);
  assert.ok(Number.isFinite(fillFor(1, 0)));
});

test('a lone voter is the leader and gets full fill', () => {
  assert.equal(fillFor(1, 1), MAX_FILL);
});

test('labels flip to off-white only once the tile is genuinely dark', () => {
  assert.equal(needsLightText(MIN_FILL), false);
  assert.equal(needsLightText(MAX_FILL), true);
  assert.equal(needsLightText(FLIP_TEXT_ABOVE), false);
});

test('a tied room darkens every tied wedge equally', () => {
  assert.equal(fillFor(4, 4), fillFor(4, 4));
  assert.equal(fillFor(4, 4), MAX_FILL);
});
