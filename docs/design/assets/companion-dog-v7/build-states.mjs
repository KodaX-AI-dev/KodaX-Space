import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { loadStateCels, renderStateCel } from './state-cels.mjs';
import { stateTimelines } from './state-timelines.mjs';

const descriptions = {
  thinking: ['思考', '侧头向上观察，微调头部角度、眨眼与停顿；切换前先回正。仅预览。'],
  working: ['工作', '低头看向前爪，两只前爪交替轻压，留出检查间隔；切换前放稳前爪并回正。仅预览。'],
  waiting: [
    '等待确认',
    '自然抬起一只前爪后保持，偶尔眨眼，不反复招手；确认后放下再进入完成。仅预览。',
  ],
  complete: [
    '完成',
    '一次开心张嘴、点头回应与短摇尾，随后收住；完成状态保留，可手动重播。仅预览。',
  ],
};
const reviewRoot = new URL('../../../../artifacts/companion-states-v7/', import.meta.url);

async function packState(cels, state, timeline) {
  const frames = [],
    sequence = [],
    hashes = new Map();
  for (const pose of timeline.poses) {
    const canvas = renderStateCel(cels, pose),
      pixels = canvas.getContext('2d').getImageData(0, 0, 256, 256);
    const hash = createHash('sha256').update(pixels.data).digest('hex');
    if (!hashes.has(hash)) {
      hashes.set(hash, frames.length);
      frames.push(pixels);
    }
    sequence.push(hashes.get(hash));
  }
  const atlas = createCanvas(8 * 256, Math.ceil(frames.length / 8) * 256),
    context = atlas.getContext('2d');
  frames.forEach((pixels, index) =>
    context.putImageData(pixels, (index % 8) * 256, Math.floor(index / 8) * 256),
  );
  const src = `${state}-atlas.png`;
  await writeFile(new URL(src, import.meta.url), atlas.toBuffer('image/png'));
  return {
    label: `${descriptions[state][0]} · 完整帧动画`,
    description: descriptions[state][1],
    src,
    fps: 24,
    frames: frames.map((_, index) => ({
      source: [(index % 8) * 256, Math.floor(index / 8) * 256, 256, 256],
      target: [0, 0, 256, 256],
    })),
    sequence,
    loopStart: timeline.loopStart,
    once: timeline.once,
    reducedStep: timeline.reducedStep,
    exitPaths: timeline.exits.map((path) => path.map((step) => sequence[step])),
  };
}

function idleExits(clip) {
  const anchors = clip.sequence
    .map((frame, step) => (frame === 0 ? step : -1))
    .filter((step) => step >= 0);
  return clip.sequence.map((_, step) => {
    const target = anchors.reduce(
      (best, at) => (Math.abs(at - step) < Math.abs(best - step) ? at : best),
      0,
    );
    const direction = Math.sign(target - step),
      path = [clip.sequence[step]];
    for (let at = step; at !== target; ) {
      at += direction * Math.min(2, Math.abs(target - at));
      path.push(clip.sequence[at]);
    }
    return path;
  });
}

async function reviewSheet(cels, timelines) {
  const sheet = createCanvas(1024, 4 * 278),
    context = sheet.getContext('2d');
  context.fillStyle = '#181817';
  context.fillRect(0, 0, sheet.width, sheet.height);
  for (const [row, [state, timeline]] of Object.entries(timelines).entries()) {
    const keys =
      state === 'waiting'
        ? [0, 5, 10, 15]
        : [0, 10, timeline.loopStart + 8, timeline.loopStart + 25];
    for (const [column, step] of keys.entries()) {
      const frame = renderStateCel(cels, timeline.poses[step]);
      const pixels = frame.getContext('2d').getImageData(0, 0, 256, 256);
      const isolated = createCanvas(256, 256);
      isolated.getContext('2d').putImageData(pixels, 0, 0);
      context.drawImage(isolated, column * 256, row * 278);
      context.fillStyle = '#ddd9c9';
      context.font = '12px sans-serif';
      context.fillText(`${state} · step ${step}`, column * 256 + 10, row * 278 + 270);
      await writeFile(new URL(`${state}-${step}.png`, reviewRoot), isolated.toBuffer('image/png'));
    }
  }
  await writeFile(new URL('four-states-contact.png', reviewRoot), sheet.toBuffer('image/png'));
}

const cels = await loadStateCels(),
  timelines = stateTimelines();
await mkdir(reviewRoot, { recursive: true });
const previous = JSON.parse(
  await readFile(new URL('../companion-dog-v6/frames.json', import.meta.url), 'utf8'),
);
const clips = {
  reference: previous.clips.reference,
  idle: {
    ...previous.clips.idle,
    src: '../companion-dog-v6/idle-atlas.png',
    loopStart: 0,
    reducedStep: 0,
    once: false,
    exitPaths: idleExits(previous.clips.idle),
  },
};
const report = [];
for (const [state, timeline] of Object.entries(timelines)) {
  clips[state] = await packState(cels, state, timeline);
  const file = await stat(new URL(clips[state].src, import.meta.url));
  report.push({
    state,
    steps: clips[state].sequence.length,
    bitmaps: clips[state].frames.length,
    pngBytes: file.size,
    maxSettleFrames: Math.max(...clips[state].exitPaths.map((path) => path.length)),
  });
}
await writeFile(new URL('frames.json', import.meta.url), JSON.stringify({ clips }, null, 2));
await writeFile(new URL('asset-report.json', reviewRoot), JSON.stringify(report, null, 2));
await reviewSheet(cels, timelines);
process.stdout.write(JSON.stringify(report) + '\n');
