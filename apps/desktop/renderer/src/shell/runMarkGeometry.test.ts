import assert from 'node:assert/strict';
import test from 'node:test';
import { RUN_MARK_PERIOD, runMarkDots, runMarkGlint, runMarkMorph } from './runMarkGeometry.js';

const K_ROWS = ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'];

/** Snap a dot back onto the 5×7 grid it was projected from. */
function gridCell(px: number, x: number, y: number): string {
  const step = (px / 2) * 0.92 * 0.28;
  return `${Math.round((x - px / 2) / step) + 2},${Math.round((y - px / 2) / step) + 3}`;
}

test('the still frame at icon size lights exactly the pixel K', () => {
  const dots = runMarkDots(18, 0, true);
  const lit = new Set<string>();
  K_ROWS.forEach((row, y) => [...row].forEach((cell, x) => cell === 'X' && lit.add(`${x},${y}`)));
  assert.equal(dots.length, lit.size);
  assert.deepEqual(new Set(dots.map((d) => gridCell(18, d.x, d.y))), lit);
  assert.ok(dots.every((d) => d.alpha === 1));
});

test('a larger mark also shows the dim LED cells around the K', () => {
  const dots = runMarkDots(112, 0, true);
  assert.equal(dots.length, 35);
  assert.equal(dots.filter((d) => d.alpha === 1).length, 14);
});

test('while tumbling every voxel is drawn back to front', () => {
  const dots = runMarkDots(18, 1, false);
  assert.equal(dots.length, 5 * 7 * 3);
  for (let i = 1; i < dots.length; i++) assert.ok(dots[i - 1]!.z <= dots[i]!.z);
});

test('the tumbling block never pokes outside the canvas', () => {
  for (let t = 0; t < RUN_MARK_PERIOD * 4; t += 0.05)
    for (const d of runMarkDots(18, t, false))
      assert.ok(d.x - d.r >= 0 && d.x + d.r <= 18 && d.y - d.r >= 0 && d.y + d.r <= 18, `t=${t}`);
});

test('the timeline tumbles, gathers into the K with a glint, then releases', () => {
  assert.equal(runMarkMorph(1), 0);
  assert.equal(runMarkMorph(4), 1);
  assert.equal(runMarkMorph(4 + RUN_MARK_PERIOD), 1);
  assert.ok(runMarkMorph(2.9) > 0 && runMarkMorph(2.9) < 1);
  assert.equal(runMarkGlint(1), null);
  assert.equal(runMarkGlint(4.5), null);
  assert.equal(typeof runMarkGlint(3.8), 'number');
});
