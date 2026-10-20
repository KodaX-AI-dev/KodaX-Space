import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanionMotion } from './companion-frames.js';

const clip = (sequence, extra = {}) => ({
  fps: 24,
  image: {},
  frames: [{}, {}, {}],
  sequence,
  ...extra,
});
function player(clips, state = 'a') {
  return Object.assign(Object.create(CompanionMotion.prototype), {
    clips,
    state,
    time: 0,
    elapsed: 0,
    speed: 1,
    paused: false,
    reduced: false,
    frames: 0,
    meanRenderMs: 0,
    lastIndex: -1,
    lastStep: -1,
    lastState: '',
    dirty: true,
    requestSerial: 0,
    pendingState: null,
    pendingReady: false,
    transition: null,
    observers: new Set(),
    onTick: () => {},
    render: () => {},
    wake: () => {},
  });
}

test('held waiting loop never repeats its paw-raising entry', () => {
  const motion = player({ a: clip([0, 1, 2, 2], { loopStart: 2 }) });
  motion.advance(4 / 24);
  assert.equal(motion.sample().index, 2);
  motion.advance(4 / 24);
  assert.equal(motion.sample().index, 2);
});

test('image cache releases the previous atlas after settling into a new action', () => {
  const motion = player({ a: clip([0]), b: clip([0]), c: clip([0]) });
  motion.previousState = 'b';
  motion.pendingState = 'c';
  motion.trimImages();
  assert.ok(motion.clips.a.image && motion.clips.c.image);
  assert.equal(motion.clips.b.image, undefined);
});

test('paused, reduced, completed and hidden animation schedules no recurring timer', () => {
  const priorDocument = globalThis.document;
  const priorTimeout = globalThis.setTimeout;
  const delays = [];
  globalThis.document = { hidden: false };
  globalThis.setTimeout = (_, delay) => {
    delays.push(delay);
    return 1;
  };
  try {
    const motion = player({ a: clip([0, 1], { fps: 12 }) });
    motion.schedule();
    assert.equal(delays.length, 1);
    assert.ok(Math.abs(delays[0] - 1000 / 12) < 0.01);
    motion.paused = true;
    motion.schedule();
    motion.paused = false;
    motion.reduced = true;
    motion.schedule();
    motion.reduced = false;
    motion.clips.a.once = true;
    motion.time = 1 / 12;
    motion.schedule();
    motion.clips.a.once = false;
    globalThis.document.hidden = true;
    motion.schedule();
    assert.equal(delays.length, 1);
  } finally {
    globalThis.document = priorDocument;
    globalThis.setTimeout = priorTimeout;
  }
});

test('completion plays once and holds its final neutral cel', () => {
  const motion = player({ a: clip([0, 1, 2, 0], { once: true }) });
  motion.advance(2);
  assert.equal(motion.sample().index, 0);
  assert.equal(motion.sample().ended, true);
  motion.advance(2);
  assert.equal(motion.time, 3 / 24);
});

test('a full-body working exit can settle at its authored exit rate', () => {
  const motion = player({ a: clip([0, 1], { fps: 16, exitFps: 24 }) });
  motion.transition = { path: [1, 2, 0], time: 1 / 24 };
  assert.equal(motion.sample().index, 2);
  assert.equal(motion.frameDuration, 1 / 24);
});

test('a held cel uses one wakeup for the hold instead of waking at every frame', () => {
  const priorDocument = globalThis.document,
    priorTimeout = globalThis.setTimeout;
  const delays = [];
  globalThis.document = { hidden: false };
  globalThis.setTimeout = (_, delay) => {
    delays.push(delay);
    return 1;
  };
  try {
    const motion = player({ a: clip([0, 0, 0, 1], { fps: 12 }) });
    motion.schedule();
    assert.equal(delays[0], 250);
  } finally {
    globalThis.document = priorDocument;
    globalThis.setTimeout = priorTimeout;
  }
});

test('state requests show the current cel, settle to neutral, then enter the next action', async () => {
  const motion = player({
    a: clip([0, 1], { exitPaths: [[0], [1, 0]] }),
    b: clip([0, 2], { exitPaths: [[0], [2, 0]] }),
  });
  motion.time = 1 / 24;
  await motion.setState('b');
  assert.equal(motion.sample().index, 1);
  assert.equal(motion.state, 'a');
  motion.advance(1 / 24);
  assert.equal(motion.sample().index, 0);
  motion.advance(1 / 24);
  assert.equal(motion.state, 'b');
  assert.equal(motion.sample().index, 0);
  motion.advance(1 / 24);
  assert.equal(motion.sample().index, 2);
});

test('reduced motion uses the meaningful held pose for the state', () => {
  const motion = player({ a: clip([0, 1, 2], { reducedStep: 2 }) });
  motion.setReduced(true);
  assert.equal(motion.sample().index, 2);
  assert.equal(motion.time, 2 / 24);
});

test('rapid requests keep the last target and release an unused decoded action', async () => {
  const motion = player({
    a: clip([0, 1], { exitPaths: [[0], [1, 0]] }),
    b: clip([0, 2]),
    c: clip([0, 2]),
  });
  motion.time = 1 / 24;
  await Promise.all([motion.setState('b'), motion.setState('c')]);
  motion.advance(2 / 24);
  assert.equal(motion.state, 'c');
  assert.equal(motion.clips.b.image, undefined);
  assert.ok(motion.clips.c.image);
  assert.equal(motion.clips.a.image, undefined);
});
