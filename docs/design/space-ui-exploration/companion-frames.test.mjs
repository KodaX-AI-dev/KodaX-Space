import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanionMotion } from './companion-frames.js';

test('playback crosses the loop seam and holds pause without redrawing a repeated cel', () => {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousDocument = globalThis.document;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.document = { hidden: false };
  try {
    const player = Object.assign(Object.create(CompanionMotion.prototype), {
      time: 7.99,
      lastTimestamp: 0,
      speed: 1,
      paused: false,
      reduced: false,
      lastIndex: 0,
      lastStep: 191,
      lastState: 'idle',
      dirty: false,
      frames: 0,
      meanRenderMs: 0,
      clips: { idle: { image: {}, fps: 24, sequence: Array(192).fill(0), frames: [{}] } },
      state: 'idle',
      onTick: () => {},
      render: () => assert.fail('repeated held frame must not redraw'),
      schedule: () => {},
      wake: () => {},
    });
    player.frame(100);
    assert.ok(Math.abs(player.time - 0.09) < 0.00001, 'clock should wrap at eight seconds');
    player.setPaused(true);
    player.render = () => {};
    player.frame(200);
    assert.ok(Math.abs(player.time - 0.09) < 0.00001, 'pause must preserve the current phase');
  } finally {
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.document = previousDocument;
  }
});
