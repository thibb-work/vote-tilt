import { test } from 'node:test';
import assert from 'node:assert/strict';
import { talliesToCounts, countsToTallies, leaders, countsFrom } from '../lib/tally.ts';

test('a frozen tally survives the round trip through jsonb', () => {
  const counts = [3, 11, 0, 1, 0, 2];
  assert.deepEqual(talliesToCounts(countsToTallies(counts)), counts);
});

test('jsonb keys arrive as strings and still land on the right wedge', () => {
  assert.deepEqual(talliesToCounts({ '0': 3, '1': 11, '4': 2 }), [3, 11, 0, 0, 2, 0]);
});

test('a missing or null tally reads as six zeros, not a crash', () => {
  assert.deepEqual(talliesToCounts(null), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(talliesToCounts(undefined), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(talliesToCounts({}), [0, 0, 0, 0, 0, 0]);
});

test('leaders names the single winner', () => {
  assert.deepEqual(leaders([3, 11, 0, 1, 0, 2]), [1]);
});

test('a tie returns every wedge that shares the top', () => {
  assert.deepEqual(leaders([4, 4, 0, 1, 0, 4]), [0, 1, 5]);
});

test('nobody voting means no winner, not wedge zero', () => {
  // Declaring "Cool data collection" the winner of an empty room would be a lie
  // on a projector in front of the room.
  assert.deepEqual(leaders([0, 0, 0, 0, 0, 0]), []);
});

test('a flat phone is present but lands in no wedge', () => {
  const counts = countsFrom([
    { id: 'a', heading: null, magnitude: 2 },
    { id: 'b', heading: 0, magnitude: 40 },
  ]);
  assert.deepEqual(counts, [1, 0, 0, 0, 0, 0]);
});

test('phones aiming at the same bearing stack in one wedge', () => {
  const counts = countsFrom([
    { id: 'a', heading: 180, magnitude: 40 },
    { id: 'b', heading: 182, magnitude: 55 },
    { id: 'c', heading: 178, magnitude: 30 },
  ]);
  assert.deepEqual(counts, [0, 0, 0, 3, 0, 0]);
});

test('an empty room tallies to zeros, not NaN', () => {
  assert.deepEqual(countsFrom([]), [0, 0, 0, 0, 0, 0]);
});
