import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polar, sectorPath, wrapLabel, MAX_LABEL_LINES } from '../lib/geometry.ts';
import { FALLBACK_OPTIONS } from '../lib/constants.ts';

/** What Dial.tsx passes. */
const WEDGE_CHARS = 12;

test('polar puts 0 degrees straight up and runs clockwise', () => {
  const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  assert.deepEqual(round(polar(200, 200, 100, 0)), { x: 200, y: 100 }, 'up');
  assert.deepEqual(round(polar(200, 200, 100, 90)), { x: 300, y: 200 }, 'right');
  assert.deepEqual(round(polar(200, 200, 100, 180)), { x: 200, y: 300 }, 'down');
  assert.deepEqual(round(polar(200, 200, 100, 270)), { x: 100, y: 200 }, 'left');
});

test('every sector path is closed and free of NaN', () => {
  for (let w = 0; w < 6; w++) {
    const d = sectorPath(200, 200, 70, 190, w * 60 - 30, w * 60 + 30);
    assert.ok(!d.includes('NaN'), `wedge ${w} has NaN`);
    assert.ok(d.startsWith('M '), `wedge ${w} does not start with a move`);
    assert.ok(d.endsWith('Z'), `wedge ${w} is not closed`);
  }
});

test('the six shipped labels fit the wedge without truncation', () => {
  for (const label of FALLBACK_OPTIONS) {
    const lines = wrapLabel(label, WEDGE_CHARS);
    assert.ok(lines.length <= MAX_LABEL_LINES, `"${label}" needs ${lines.length} lines`);
    assert.equal(lines.join(' '), label, `"${label}" lost text`);
    for (const line of lines) {
      assert.ok(line.length <= WEDGE_CHARS, `"${line}" is wider than the wedge`);
    }
  }
});

test('no wrapped line ever exceeds the wedge width', () => {
  const nasty = [
    'Antidisestablishmentarianism',
    'a b c d e f g h i j k l m n o p',
    'Supercalifragilistic expialidocious',
    '',
    '   ',
    'One',
  ];
  for (const label of nasty) {
    for (const line of wrapLabel(label, WEDGE_CHARS)) {
      assert.ok(line.length <= WEDGE_CHARS, `"${line}" (${line.length}) overflows`);
    }
  }
});

test('an over-long word is broken rather than left to spill', () => {
  const lines = wrapLabel('Antidisestablishmentarianism', WEDGE_CHARS);
  assert.ok(lines.length > 1, 'the word was not broken');
  assert.ok(lines[0].endsWith('-'), 'a break should be marked with a hyphen');
});

test('overflow is ellipsised, never silently dropped', () => {
  const lines = wrapLabel('one two three four five six seven eight nine', WEDGE_CHARS);
  assert.equal(lines.length, MAX_LABEL_LINES);
  assert.ok(lines[MAX_LABEL_LINES - 1].endsWith('…'), 'truncation is invisible to the host');
});

test('an empty label yields no lines rather than one blank', () => {
  assert.deepEqual(wrapLabel('', WEDGE_CHARS), []);
  assert.deepEqual(wrapLabel('   ', WEDGE_CHARS), []);
});
