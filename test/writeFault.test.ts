import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFault } from '../lib/writeFault.ts';

test('a refused identity is named as one, not as a network problem', () => {
  // The shape RTDB actually throws: an Error whose message carries the code.
  const e = new Error("PERMISSION_DENIED: Permission denied");
  assert.match(writeFault(e), /refused this screen/);
  assert.match(writeFault(e), /blocker/);
});

test('the code is recognised however it is cased or spaced', () => {
  for (const m of ['permission_denied', 'Permission Denied', 'set at /rooms/x failed: permission_denied']) {
    assert.match(writeFault(new Error(m)), /refused this screen/, m);
  }
});

test('anything else is reported as not reaching the database', () => {
  assert.equal(writeFault(new Error('network error')), 'Cannot reach the database');
  assert.equal(writeFault(undefined), 'Cannot reach the database');
  assert.equal(writeFault('disconnected'), 'Cannot reach the database');
});
