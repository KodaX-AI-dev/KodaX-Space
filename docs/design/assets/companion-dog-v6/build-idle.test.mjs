import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { idlePose, loadCels, renderCel } from './build-idle.mjs';

test('eight-second loop settles before its seam', () => {
  assert.deepEqual(idlePose(0), idlePose(8));
  assert.deepEqual(idlePose(8 - 1 / 24), idlePose(0));
  assert.deepEqual(idlePose(0.5), idlePose(0));
});

test('packed atlas preserves every rendered cel, including the open-eyed neutral frame', async () => {
  const manifest = JSON.parse(await readFile(new URL('frames.json', import.meta.url), 'utf8'));
  const clip = manifest.clips.idle;
  const image = await loadImage(new URL(clip.src, import.meta.url));
  const atlas = createCanvas(image.width, image.height);
  atlas.getContext('2d').drawImage(image, 0, 0);
  const cels = await loadCels();
  for (const [step, index] of clip.sequence.entries()) {
    const expected = renderCel(cels, idlePose(step / clip.fps))
      .getContext('2d')
      .getImageData(0, 0, 256, 256).data;
    const actual = atlas.getContext('2d').getImageData(...clip.frames[index].source).data;
    assert.ok(
      Buffer.from(actual).equals(Buffer.from(expected)),
      `packed frame changed at step ${step}`,
    );
  }
});

test('idle includes a short blink and distinct soft tail gestures', () => {
  const poses = Array.from({ length: 192 }, (_, index) => idlePose(index / 24));
  assert.ok(poses.some((pose) => pose.tail > 0.6));
  assert.ok(poses.some((pose) => pose.tail < -0.6));
  assert.ok(poses.some((pose) => pose.eye === 'closed'));
  assert.ok(poses.filter((pose) => pose.eye !== 'open').length <= 12);
});

test('every changed pixel stays within the eye or tail animation zones', async () => {
  const cels = await loadCels();
  const neutral = renderCel(cels, idlePose(0)).getContext('2d').getImageData(0, 0, 256, 256).data;
  let changedFrames = 0;
  for (const time of Array.from({ length: 192 }, (_, index) => index / 24)) {
    const animated = renderCel(cels, idlePose(time))
      .getContext('2d')
      .getImageData(0, 0, 256, 256).data;
    let changed = 0;
    for (let index = 0; index < neutral.length; index += 4) {
      if (
        neutral
          .slice(index, index + 4)
          .every((value, channel) => value === animated[index + channel])
      )
        continue;
      changed++;
      const x = (index / 4) % 256;
      const y = Math.floor(index / 4 / 256);
      const tail = x < 90 && y > 120 && y < 206;
      const eyes = x > 128 && x < 189 && y > 70 && y < 113;
      assert.ok(tail || eyes, `unexpected anatomy change at ${x},${y}, t=${time}`);
    }
    if (changed) changedFrames++;
  }
  assert.ok(changedFrames > 60, 'the loop must include actual animated frames');
});
