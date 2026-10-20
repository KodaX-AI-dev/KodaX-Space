import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const manifest = new URL(process.env.COMPANION_MANIFEST ?? 'frames.json', import.meta.url);
const { clips: { working } } = JSON.parse(await readFile(manifest, 'utf8'));
const atlas = await loadImage(new URL(working.src, manifest));
const canvas = createCanvas(128, 128), context = canvas.getContext('2d');
const pixels = working.frames.map(frame => {
  context.clearRect(0, 0, 128, 128);
  context.drawImage(atlas, ...frame.source, ...frame.target.map(value => value / 2));
  return context.getImageData(0, 0, 128, 128).data;
});

function difference(a, b) {
  let sum = 0;
  for (let p = 0; p < a.length; p += 4) {
    sum += Math.abs(a[p + 3] - b[p + 3]);
    for (let channel = 0; channel < 3; channel++)
      sum += Math.abs(a[p + channel] * a[p + 3] - b[p + channel] * b[p + 3]) / 255;
  }
  return sum / a.length;
}

test('no adjacent playback frames make a large visual jump, including the loop seam', () => {
  const steps = working.sequence;
  const deltas = steps.map((id, step) => ({ step,
    delta: difference(pixels[id], pixels[steps[(step + 1) % steps.length]]) }));
  const worst = deltas.reduce((a, b) => a.delta > b.delta ? a : b);
  assert.ok(worst.delta < 8, `step ${worst.step}: mean premultiplied pixel jump ${worst.delta.toFixed(2)}`);
});

test('the rest hold reuses the entry cel without flickering or a loop jump', () => {
  const rest = working.phases.find(phase => phase.action === 'rest');
  assert.ok(rest.end - rest.start >= 24);
  assert.ok(working.sequence.slice(rest.start).every(id => id === working.sequence[0]));
});

test('standing, lying and returning poses retain complete exit paths', () => {
  assert.deepEqual(working.phases.map(phase => phase.action),
    ['prepare', 'fetch', 'carry', 'inspect', 'respond', 'settle', 'rest']);
  assert.equal(working.phases.find(phase => phase.action === 'carry').pose, 'standing');
  assert.equal(working.phases.find(phase => phase.action === 'inspect').pose, 'lying');
  for (const [step, path] of working.exitPaths.entries()) {
    assert.equal(path[0], working.sequence[step]);
    assert.equal(path.at(-1), working.sequence[0]);
  }
});

test('tight atlas crops preserve stage positions and a six MiB decoded image budget', () => {
  assert.ok(atlas.width * atlas.height * 4 <= 6 * 1048576);
  for (const { source: [x, y, width, height], target } of working.frames) {
    assert.ok(x >= 0 && y >= 0 && x + width <= atlas.width && y + height <= atlas.height);
    assert.ok(width <= 128 && height <= 128);
    assert.ok(target[0] >= 0 && target[1] >= 0);
    assert.ok(target[0] + target[2] <= 256.001 && target[1] + target[3] <= 256.001);
  }
});
