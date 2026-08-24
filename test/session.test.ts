import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { toSessionRow } from '../lib/session.ts';

const OPTIONS = ['a', 'b', 'c', 'd', 'e', 'f'];

test('a full row survives the trip unchanged', () => {
  const row = toSessionRow({
    slug: 'main',
    options: OPTIONS,
    frozen: true,
    frozen_tallies: { '0': 3, '1': 1 },
    frozen_at: '2026-08-24T09:00:00.000Z',
    round_started: '2026-08-24T08:00:00.000Z',
    updated_at: '2026-08-24T09:00:00.000Z',
  });
  assert.deepEqual(row?.options, OPTIONS);
  assert.equal(row?.frozen, true);
  assert.deepEqual(row?.frozen_tallies, { '0': 3, '1': 1 });
});

test('keys RTDB dropped come back as null, not undefined', () => {
  // A reset round: Postgres stored explicit nulls, RTDB stores nothing at all.
  const row = toSessionRow({ slug: 'main', options: OPTIONS, frozen: false });
  assert.equal(row?.frozen_tallies, null);
  assert.equal(row?.frozen_at, null);
});

test('a missing node is no session', () => {
  assert.equal(toSessionRow(null), null);
  assert.equal(toSessionRow(undefined), null);
});

test('a node without options is no session', () => {
  // Half-written or hand-edited: better to fall back than render an empty dial.
  assert.equal(toSessionRow({ slug: 'main', frozen: false }), null);
});

test('options must all be strings', () => {
  assert.equal(toSessionRow({ options: ['a', 2, 'c'] }), null);
});

test('an array is not a session row', () => {
  assert.equal(toSessionRow([1, 2, 3]), null);
});

test('a scalar is not a session row', () => {
  assert.equal(toSessionRow('main'), null);
  assert.equal(toSessionRow(42), null);
});

test('only a literal true freezes a round', () => {
  // A truthy leftover must not lock a round nobody froze.
  for (const value of ['true', 1, {}, []]) {
    assert.equal(toSessionRow({ options: OPTIONS, frozen: value })?.frozen, false);
  }
  assert.equal(toSessionRow({ options: OPTIONS, frozen: true })?.frozen, true);
});

test('a row with no slug falls back to the known session', () => {
  assert.equal(toSessionRow({ options: OPTIONS })?.slug, 'main');
});

test('missing timestamps read as empty rather than undefined', () => {
  const row = toSessionRow({ options: OPTIONS });
  assert.equal(row?.round_started, '');
  assert.equal(row?.updated_at, '');
});
