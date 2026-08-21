import test from 'node:test';
import assert from 'node:assert/strict';
import { isRoomId, newRoomId, ROOM_ID_LENGTH } from '../lib/room.ts';

test('a minted room id passes its own validator', () => {
  for (let i = 0; i < 50; i++) assert.ok(isRoomId(newRoomId()));
});

test('room ids are the advertised length', () => {
  assert.equal(newRoomId().length, ROOM_ID_LENGTH);
});

test('room ids do not repeat', () => {
  const seen = new Set(Array.from({ length: 500 }, newRoomId));
  assert.equal(seen.size, 500);
});

test('the alphabet excludes glyphs that are misread', () => {
  const id = Array.from({ length: 200 }, newRoomId).join('');
  for (const ch of 'aeiou01l') {
    assert.ok(!id.includes(ch), `alphabet should not contain ${ch}`);
  }
});

test('junk and near-misses are rejected', () => {
  assert.equal(isRoomId(null), false);
  assert.equal(isRoomId(undefined), false);
  assert.equal(isRoomId(''), false);
  assert.equal(isRoomId('main'), false);
  assert.equal(isRoomId('../../rooms'), false);
  assert.equal(isRoomId(newRoomId().slice(1)), false, 'too short');
  assert.equal(isRoomId(newRoomId() + 'b'), false, 'too long');
  assert.equal(isRoomId(newRoomId().slice(1) + 'A'), false, 'wrong alphabet');
});
