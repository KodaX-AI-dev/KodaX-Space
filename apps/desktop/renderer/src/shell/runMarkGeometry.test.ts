import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RUN_MARK_PERIOD,
  RUN_MARK_SPIN,
  runMarkDots,
  runMarkGlint,
  runMarkMorph,
} from './runMarkGeometry.js';

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
  assert.equal(runMarkMorph(5.5), 1);
  assert.equal(runMarkMorph(5.5 + RUN_MARK_PERIOD), 1);
  assert.ok(runMarkMorph(4.4) > 0 && runMarkMorph(4.4) < 1);
  assert.equal(runMarkGlint(1), null);
  assert.equal(runMarkGlint(6), null);
  assert.equal(typeof runMarkGlint(5.3), 'number');
});

test('the block turns a full revolution before it becomes the K', () => {
  let tumbling = 0;
  for (let t = 0; t < RUN_MARK_PERIOD; t += 0.01) if (runMarkMorph(t) === 0) tumbling += 0.01;
  assert.ok(tumbling >= 4, `tumbles ${tumbling.toFixed(2)}s`);
  assert.ok(tumbling * RUN_MARK_SPIN >= 2 * Math.PI, 'a full turn, not half of one');
});
