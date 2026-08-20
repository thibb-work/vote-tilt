import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePresence, type PresenceMap } from '../lib/presence.ts';

/**
 * Mirrors scripts/check-presence.mjs, which cannot run behind a proxy that
 * severs WebSocket upgrades. Supabase owns delivering the presence map; what is
 * ours to get right is folding it into six counts, and that is pure.
 */

/** A phone that has called track() with the wedge it is pointing at. */
const phone = (wedge: number | null): [string, PresenceMap[string]] => [
  `phone-${Math.random().toString(36).slice(2)}`,
  [{ wedge }],
];

const room = (...phones: [string, PresenceMap[string]][]): PresenceMap =>
  Object.fromEntries(phones);

test('empty room tallies to zero, not NaN', () => {
  const { counts, total } = aggregatePresence({});
  assert.deepEqual(counts, [0, 0, 0, 0, 0, 0]);
  assert.equal(total, 0);
});

test('a host that never tracks is absent from the map and uncounted', () => {
  // The host subscribes but never calls track(), so Supabase never lists it.
  const { counts, total } = aggregatePresence(room(phone(1), phone(1), phone(4)));
  assert.equal(total, 3, 'only the three phones are present');
  assert.deepEqual(counts, [0, 2, 0, 0, 1, 0]);
});

test('an abstainer counts as present but casts no vote', () => {
  const { counts, total } = aggregatePresence(room(phone(1), phone(1), phone(4), phone(null)));
  assert.equal(total, 4, 'the flat phone is in the room');
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    3,
    'but it is not in the vote total',
  );
});

test('re-tilting moves a vote rather than adding one', () => {
  const key = 'phone-c';
  const before: PresenceMap = { 'phone-a': [{ wedge: 1 }], 'phone-b': [{ wedge: 1 }], [key]: [{ wedge: 4 }] };
  const after: PresenceMap = { ...before, [key]: [{ wedge: 1 }] };

  const a = aggregatePresence(before);
  const b = aggregatePresence(after);

  assert.deepEqual(a.counts, [0, 2, 0, 0, 1, 0]);
  assert.deepEqual(b.counts, [0, 3, 0, 0, 0, 0]);
  assert.equal(b.total, a.total, 'the room did not grow');
});

test('a phone leaving decrements both its wedge and the total', () => {
  const full: PresenceMap = { a: [{ wedge: 1 }], b: [{ wedge: 1 }], c: [{ wedge: 4 }] };
  const { b: _gone, ...rest } = full;
  void _gone;

  const after = aggregatePresence(rest);
  assert.equal(after.total, 2);
  assert.deepEqual(after.counts, [0, 1, 0, 0, 1, 0]);
});

test('every observer folding the same map gets the same numbers', () => {
  // Host and phones aggregate identical state, so agreement is structural.
  const state = room(phone(0), phone(2), phone(2), phone(null), phone(5));
  const host = aggregatePresence(state);
  const voter = aggregatePresence(state);
  assert.deepEqual(voter, host);
});

test('garbage from a client cannot corrupt the tally', () => {
  const state = {
    ok: [{ wedge: 3 }],
    high: [{ wedge: 6 }], // one past the last wedge
    negative: [{ wedge: -1 }],
    fractional: [{ wedge: 2.5 }],
    stringy: [{ wedge: '3' as unknown as number }],
    missing: [{}],
    empty: [] as PresenceMap[string],
  } satisfies PresenceMap;

  const { counts, total } = aggregatePresence(state);
  assert.deepEqual(counts, [0, 0, 0, 1, 0, 0], 'only the valid wedge counted');
  assert.equal(total, 6, 'present-but-invalid phones still count as bodies in the room');
});

test('only the first entry per presence key counts', () => {
  // A reconnecting phone can briefly have two entries under one key; it is still
  // one person and must not vote twice.
  const { counts, total } = aggregatePresence({ a: [{ wedge: 1 }, { wedge: 4 }] });
  assert.deepEqual(counts, [0, 1, 0, 0, 0, 0]);
  assert.equal(total, 1);
});

test('a full room tallies to the number of voters', () => {
  const phones = Array.from({ length: 50 }, (_, i) => phone(i % 7 === 0 ? null : i % 6));
  const { counts, total } = aggregatePresence(room(...phones));
  const abstainers = phones.filter(([, e]) => e[0].wedge === null).length;

  assert.equal(total, 50);
  assert.equal(
    counts.reduce((a, b) => a + b, 0),
    50 - abstainers,
  );
});
