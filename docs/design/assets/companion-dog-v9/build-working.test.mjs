import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const manifest = new URL(process.env.COMPANION_MANIFEST ?? 'frames.json', import.meta.url);
const { clips } = JSON.parse(await readFile(manifest, 'utf8'));
const clip = clips.working, image = await loadImage(new URL(clip.src, manifest));
function pixels(id) {
  const canvas = createCanvas(112, 112), ctx = canvas.getContext('2d');
  ctx.drawImage(image, ...clip.frames[id].source, 0, 0, 112, 112);
  return ctx.getImageData(0, 0, 112, 112).data;
}
function characterCenter(data) {
  let weight = 0, sum = 0;
  for (let y = 0; y < 112; y++) for (let x = 0; x < 112; x++) {
    // The parked scroll is to the right of the seated paw, outside this character measurement.
    if (x >= 86 && y >= 94) continue;
    const alpha = data[(y * 112 + x) * 4 + 3] / 255;
    weight += alpha; sum += alpha * x;
  }
  return sum / weight;
}

test('the first seated working drawing does not shift the character when its prop appears', () => {
  const first = clip.sequence.find(id => id !== clip.sequence[0]);
  const delta = characterCenter(pixels(first)) - characterCenter(pixels(clip.sequence[0]));
  assert.ok(Math.abs(delta) <= 2, `character entry moved ${delta.toFixed(2)}px`);
});

test('the last settling drawing already matches neutral before the rest hold begins', () => {
  const settle = clip.phases.find(phase => phase.action === 'settle');
  const last = clip.sequence.slice(settle.start, settle.end + 1).findLast(id => id !== 0);
  const a = pixels(last), b = pixels(clip.sequence[0]);
  let delta = 0;
  for (let i = 0; i < a.length; i += 4) {
    delta += Math.abs(a[i + 3] - b[i + 3]);
    for (let c = 0; c < 3; c++) delta += Math.abs(a[i + c] * a[i + 3] - b[i + c] * b[i + 3]) / 255;
  }
  assert.ok(delta / a.length < 2, `closing pose pixel difference ${(delta / a.length).toFixed(2)}`);
});

test('the action retains sitting, fetching, carrying, lying inspection and a seated finish', () => {
  assert.deepEqual(clip.phases.map(p => p.action), ['prepare','fetch','carry','inspect','respond','settle','rest']);
  assert.equal(clip.phases.find(p => p.action === 'carry').pose, 'standing');
  assert.equal(clip.phases.find(p => p.action === 'inspect').pose, 'lying');
  assert.ok(clip.frames.length >= 48);
  for (const [step, path] of clip.exitPaths.entries()) {
    assert.equal(path[0], clip.sequence[step]); assert.equal(path.at(-1), 0);
  }
});

test('the requested atlas stays within the small decoded sprite budget', async () => {
  for (const state of Object.values(clips)) {
    const asset = await loadImage(new URL(state.src, manifest));
    assert.ok(asset.width * asset.height * 4 <= 6 * 1024 * 1024, state.src);
    for (const frame of state.frames) {
      assert.ok(frame.source[2] <= 128 && frame.source[3] <= 128);
      assert.ok(frame.source[0] + frame.source[2] <= asset.width);
      assert.ok(frame.source[1] + frame.source[3] <= asset.height);
    }
  }
});
