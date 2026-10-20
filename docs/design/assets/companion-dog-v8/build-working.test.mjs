import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadImage } from '@napi-rs/canvas';

test('working contains a complete full-body action with a closed resting seam', async () => {
  const manifest = JSON.parse(await readFile(new URL('frames.json', import.meta.url), 'utf8'));
  const clip = manifest.clips.working;
  assert.deepEqual(
    clip.phases.map((phase) => phase.action),
    ['prepare', 'fetch', 'carry', 'inspect', 'respond', 'settle', 'rest'],
  );
  assert.equal(clip.sequence[0], clip.sequence.at(-1));
  assert.ok(clip.frames.length >= 48, 'the working action needs real whole-character in-betweens');
  assert.ok(clip.phases.find((phase) => phase.action === 'carry').pose === 'standing');
  assert.ok(clip.phases.find((phase) => phase.action === 'inspect').pose === 'lying');
  for (const [step, path] of clip.exitPaths.entries()) {
    assert.equal(path[0], clip.sequence[step]);
    assert.equal(path.at(-1), clip.sequence[0]);
  }
});

test('runtime atlases use compact display-sized cels and no oversized source artwork', async () => {
  const manifest = JSON.parse(await readFile(new URL('frames.json', import.meta.url), 'utf8'));
  for (const clip of Object.values(manifest.clips)) {
    const image = await loadImage(new URL(clip.src, import.meta.url));
    assert.ok(
      image.width * image.height * 4 <= 6 * 1024 * 1024,
      clip.src + ' decoded atlas budget',
    );
    for (const frame of clip.frames) {
      assert.ok(frame.source[2] <= 128 && frame.source[3] <= 128);
      assert.ok(frame.source[0] + frame.source[2] <= image.width);
      assert.ok(frame.source[1] + frame.source[3] <= image.height);
    }
    for (const index of clip.sequence) assert.ok(clip.frames[index]);
  }
});
