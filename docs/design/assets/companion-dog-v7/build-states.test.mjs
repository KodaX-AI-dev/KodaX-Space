import assert from 'node:assert/strict';
import test from 'node:test';
import { stateTimelines } from './state-timelines.mjs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { loadStateCels, renderStateCel } from './state-cels.mjs';

test('four task actions have distinct poses and return to the approved neutral', () => {
  const timelines = stateTimelines();
  assert.deepEqual(Object.keys(timelines), ['thinking', 'working', 'waiting', 'complete']);
  for (const timeline of Object.values(timelines)) {
    assert.deepEqual(timeline.poses[0], timeline.neutral);
    for (const [step, exit] of timeline.exits.entries()) {
      assert.equal(exit[0], step, 'exit must start on the currently visible cel');
      assert.deepEqual(timeline.poses[exit.at(-1)], timeline.neutral);
      assert.ok(exit.length <= 48, 'settling must take less than two seconds');
    }
  }
  assert.ok(timelines.thinking.poses.some((pose) => pose.tilt < -0.1));
  assert.ok(timelines.working.poses.some((pose) => pose.headY >= 7 && pose.near > 2));
  assert.ok(
    timelines.waiting.poses.slice(timelines.waiting.loopStart).every((pose) => pose.paw === 15),
  );
  assert.equal(timelines.complete.once, true);
  assert.deepEqual(timelines.complete.poses.at(-1), timelines.complete.neutral);
});

test('packed task cels match the render, share neutral frames and close held loops', async () => {
  const manifest = JSON.parse(await readFile(new URL('frames.json', import.meta.url), 'utf8'));
  const cels = await loadStateCels(),
    timelines = stateTimelines();
  for (const [state, timeline] of Object.entries(timelines)) {
    const clip = manifest.clips[state],
      image = await loadImage(new URL(clip.src, import.meta.url));
    const atlas = createCanvas(image.width, image.height),
      context = atlas.getContext('2d');
    context.drawImage(image, 0, 0);
    for (const [step, index] of clip.sequence.entries()) {
      const expected = renderStateCel(cels, timeline.poses[step])
        .getContext('2d')
        .getImageData(0, 0, 256, 256).data;
      const actual = context.getImageData(...clip.frames[index].source).data;
      assert.ok(
        Buffer.from(actual).equals(Buffer.from(expected)),
        state + ' packed cel mismatch at ' + step,
      );
      assert.equal(
        clip.exitPaths[step][0],
        index,
        'settling must begin on the visible whole frame',
      );
      assert.equal(
        clip.exitPaths[step].at(-1),
        clip.sequence[0],
        'settling must end on the common neutral',
      );
    }
    if (!clip.once)
      assert.equal(clip.sequence.at(-1), clip.sequence[clip.loopStart], state + ' loop seam');
  }
});

test('collar and brass tag stay identical through all four task actions', async () => {
  const cels = await loadStateCels(),
    timelines = stateTimelines();
  const fixed = renderStateCel(cels, timelines.thinking.neutral)
    .getContext('2d')
    .getImageData(153, 137, 17, 19).data;
  for (const [state, timeline] of Object.entries(timelines))
    for (const [step, pose] of timeline.poses.entries()) {
      const region = renderStateCel(cels, pose)
        .getContext('2d')
        .getImageData(153, 137, 17, 19).data;
      assert.ok(
        Buffer.from(region).equals(Buffer.from(fixed)),
        state + ' collar changed at ' + step,
      );
    }
});
