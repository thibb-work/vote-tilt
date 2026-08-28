import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORPHAN_GRACE_MS, roomWatchState } from '../lib/roomWatch.ts';

const GRACE = ORPHAN_GRACE_MS;

test('a tally that just arrived means a host is watching', () => {
  assert.equal(
    roomWatchState({ live: true, msSinceTally: 250, msSinceSettled: 60_000 }),
    'watched',
  );
});

test('a tally that has gone quiet means nobody is reading this room', () => {
  assert.equal(
    roomWatchState({ live: true, msSinceTally: GRACE + 1, msSinceSettled: 60_000 }),
    'orphaned',
  );
});

test('a room that has never sent a tally is orphaned once the grace window passes', () => {
  // The commonest shape of the bug: the phone scanned a code the host retired,
  // so that room has no host and never had one.
  assert.equal(
    roomWatchState({ live: true, msSinceTally: null, msSinceSettled: GRACE + 1 }),
    'orphaned',
  );
});

test('silence inside the grace window is not yet an accusation', () => {
  assert.equal(
    roomWatchState({ live: true, msSinceTally: null, msSinceSettled: GRACE - 1 }),
    'checking',
  );
});

test('a dropped socket is never reported as an orphaned room', () => {
  // It has its own message. Two explanations for one broken connection would
  // send the room chasing the wrong fix.
  for (const msSinceTally of [null, 0, 60_000]) {
    assert.equal(
      roomWatchState({ live: false, msSinceTally, msSinceSettled: 60_000 }),
      'checking',
    );
  }
});

test('evidence outranks the grace window', () => {
  // A phone that reconnected a moment ago and has already heard a tally is
  // demonstrably watched, whatever the clock says.
  assert.equal(roomWatchState({ live: true, msSinceTally: 10, msSinceSettled: 10 }), 'watched');
});

test('a phone waking from a pocket does not flash the warning', () => {
  // visibilitychange restarts the grace clock, so a tally it has not caught up
  // on yet reads as checking rather than orphaned.
  assert.equal(
    roomWatchState({ live: true, msSinceTally: 30_000, msSinceSettled: 0 }),
    'checking',
  );
});

test('the boundary is exclusive on the way in and inclusive on the way out', () => {
  assert.equal(
    roomWatchState({ live: true, msSinceTally: GRACE - 1, msSinceSettled: 60_000 }),
    'watched',
  );
  assert.equal(
    roomWatchState({ live: true, msSinceTally: GRACE, msSinceSettled: 60_000 }),
    'orphaned',
  );
});

test('a clock that jumped backwards is read as fresh, not as an orphan', () => {
  assert.equal(
    roomWatchState({ live: true, msSinceTally: -1000, msSinceSettled: -1000 }),
    'watched',
  );
});

test('the grace window is caller-tunable so a test need not sleep five seconds', () => {
  assert.equal(
    roomWatchState({ live: true, msSinceTally: 200, msSinceSettled: 5000, graceMs: 100 }),
    'orphaned',
  );
});
