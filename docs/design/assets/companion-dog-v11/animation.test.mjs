import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const manifest = new URL(process.env.COMPANION_MANIFEST ?? 'frames.json', import.meta.url);
const { clips } = JSON.parse(await readFile(manifest, 'utf8'));
const canvas = createCanvas(128, 128), context = canvas.getContext('2d');
const states = ['idle', 'thinking', 'working', 'waiting', 'complete'];
const images = {};
for (const state of states) {
  const clip = clips[state], image = await loadImage(new URL(clip.src, manifest));
  const frames = clip.frames.map(frame => {
    context.clearRect(0, 0, 128, 128);
    context.drawImage(image, ...frame.source, ...frame.target.map(value => value / 2));
    return context.getImageData(0, 0, 128, 128).data;
  });
  images[state] = { clip, image, frames };
}

function difference(a, b, silhouette = false) {
  let sum = 0;
  for (let p = 0; p < a.length; p += 4) {
    sum += Math.abs(a[p + 3] - b[p + 3]);
    if (!silhouette) for (let channel = 0; channel < 3; channel++)
      sum += Math.abs(a[p + channel] * a[p + 3] - b[p + channel] * b[p + 3]) / 255;
  }
  return sum / (silhouette ? a.length / 4 * 255 : a.length);
}

test('completion changes the body silhouette rather than only blinking or changing the mouth', () => {
  const { clip, frames } = images.complete, neutral = frames[clip.sequence[0]];
  const change = Math.max(...frames.map(frame => difference(frame, neutral, true)));
  assert.ok(change > .08, `largest body silhouette change: ${change.toFixed(3)}`);
});

test('warm fur stays opaque through standing-to-seated occlusion changes', () => {
  for (const [id, pixels] of images.complete.frames.entries()) {
    let warm = 0, translucent = 0;
    for (let p = 0; p < pixels.length; p += 4) {
      if (pixels[p + 3] <= 40 || pixels[p] <= 130 || pixels[p + 1] <= 70 || pixels[p + 2] <= 30
        || pixels[p] - pixels[p + 1] <= 25 || pixels[p + 1] - pixels[p + 2] <= 25) continue;
      warm++;
      if (pixels[p + 3] < 230) translucent++;
    }
    assert.ok(translucent / warm < .03, `cel ${id} translucent warm fur: ${(translucent / warm).toFixed(3)}`);
  }
});

test('all five states share a neutral entry and settle to that same pose', () => {
  const neutral = images.idle.frames[images.idle.clip.sequence[0]];
  for (const [state, { clip, frames }] of Object.entries(images)) {
    assert.ok(difference(neutral, frames[clip.sequence[0]]) < 2.5, state + ' entry');
    for (const [step, path] of clip.exitPaths.entries()) {
      assert.equal(path[0], clip.sequence[step], state + ' exit starts at current cel');
      assert.ok(difference(neutral, frames[path.at(-1)]) < 2.5, state + ' exit closes');
    }
  }
});

test('playback and exit paths have no large adjacent pixel jump', () => {
  for (const [state, { clip, frames }] of Object.entries(images)) {
    const checked = new Set();
    const paths = [clip.sequence, ...clip.exitPaths];
    if (!clip.once) paths.push([clip.sequence.at(-1), clip.sequence[clip.loopStart ?? 0]]);
    for (const path of paths) for (let i = 1; i < path.length; i++) {
      const pair = [path[i - 1], path[i]].sort((a, b) => a - b).join(':');
      if (checked.has(pair)) continue;
      checked.add(pair);
      // A full body play bow moves more pixels than quiet seated gestures.
      const limit = state === 'complete' ? 12 : 9;
      assert.ok(difference(frames[path[i - 1]], frames[path[i]]) < limit,
        `${state} ${path[i - 1]}→${path[i]}`);
    }
  }
});

test('waiting holds its raised-paw loop and completion celebrates only once', () => {
  const waiting = clips.waiting;
  assert.ok(waiting.loopStart > 0);
  assert.ok(!waiting.once);
  assert.ok(!waiting.sequence.slice(waiting.loopStart).includes(waiting.sequence[0]));
  assert.equal(clips.complete.once, true);
  const rest = clips.complete.sequence.slice(-24);
  assert.ok(rest.every(id => id === rest[0]));
});

test('each decoded atlas stays within six MiB and tight crops retain stage positions', () => {
  for (const [state, { clip, image }] of Object.entries(images)) {
    assert.ok(image.width * image.height * 4 <= 6 * 1048576, state + ' budget');
    for (const { source: [x, y, width, height], target } of clip.frames) {
      assert.ok(x >= 0 && y >= 0 && x + width <= image.width && y + height <= image.height);
      assert.ok(target[0] >= 0 && target[1] >= 0);
      assert.ok(target[0] + target[2] <= 256.01 && target[1] + target[3] <= 256.01);
    }
  }
});
