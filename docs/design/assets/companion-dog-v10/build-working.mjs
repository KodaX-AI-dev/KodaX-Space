import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { interpolate, restoreAlpha } from './interpolate.mjs';

const root = new URL('.', import.meta.url);
const review = new URL('../../../../artifacts/companion-working-v10/', root);
const work = new URL('inference/', review);
const tool = new URL('../tools/rife-ncnn-vulkan-20221029-windows/', work);
const keys = JSON.parse(await readFile(new URL('keyposes.json', root)));
const SIZE = 112;

function bounds(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  let left = SIZE, top = SIZE, right = 0, bottom = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (data[(y * SIZE + x) * 4 + 3] < 2) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  return [Math.max(0, left - 1), Math.max(0, top - 1),
    Math.min(SIZE - 1, right + 1) - Math.max(0, left - 1) + 1,
    Math.min(SIZE - 1, bottom + 1) - Math.max(0, top - 1) + 1];
}

async function collectCels() {
  const cels = [], sequence = [], ids = new Map();
  const keyCanvases = await Promise.all(keys.map((_, index) => restoreAlpha(index * 8, work)));
  for (let step = 0; step <= (keys.length - 1) * 8; step++) {
    const key = Math.floor(step / 8), held = keys[key].file === keys[key + 1]?.file;
    const source = step % 8 && !held ? await restoreAlpha(step, work) : keyCanvases[key];
    const canvas = createCanvas(SIZE, SIZE);
    canvas.getContext('2d').drawImage(source, 0, 0, SIZE, SIZE);
    const rgba = canvas.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
    const hash = createHash('sha256').update(rgba).digest('hex');
    if (!ids.has(hash)) { ids.set(hash, cels.length); cels.push(canvas); }
    sequence.push(ids.get(hash));
  }
  sequence.push(...Array(48).fill(sequence[0]));
  return { cels, sequence };
}

async function pack(cels) {
  let x = 1, y = 1, rowHeight = 0;
  const frames = Array(cels.length);
  const crops = cels.map((cel, id) => ({ id, crop: bounds(cel) }));
  // Similar crop heights share rows; changing packing never changes stage coordinates.
  for (const { id, crop: [left, top, width, height] } of crops.sort((a, b) => b.crop[3] - a.crop[3])) {
    if (x + width + 1 > 1024) { x = 1; y += rowHeight + 1; rowHeight = 0; }
    frames[id] = { source: [x, y, width, height],
      target: [left, top, width, height].map(value => value * 256 / SIZE) };
    x += width + 1; rowHeight = Math.max(rowHeight, height);
  }
  const atlas = createCanvas(1024, y + rowHeight + 1), context = atlas.getContext('2d');
  cels.forEach((cel, i) => {
    const { source: [x, y, w, h], target: [left, top] } = frames[i];
    context.drawImage(cel, Math.round(left * SIZE / 256), Math.round(top * SIZE / 256), w, h, x, y, w, h);
  });
  const bytes = atlas.toBuffer('image/webp', 96);
  await writeFile(new URL('working-atlas.webp', root), bytes);
  await writeFile(new URL('asset-report.json', review), JSON.stringify({ bytes: bytes.length,
    width: atlas.width, height: atlas.height, rgbaMiB: atlas.width * atlas.height * 4 / 1048576,
    keyposes: new Set(keys.map(key => key.file)).size, completeFrames: cels.length }, null, 2));
  return frames;
}

function phases() {
  const result = [];
  keys.slice(0, -1).forEach((key, index) => {
    const last = result.at(-1);
    if (last?.action === key.action) last.end = index * 8 + 7;
    else result.push({ action: key.action, pose: key.pose, start: index * 8, end: index * 8 + 7 });
  });
  const start = (keys.length - 1) * 8;
  result.push({ action: 'rest', pose: 'seated', start, end: start + 48 });
  return result;
}

await mkdir(work, { recursive: true });
await interpolate(keys.map(key => new URL(key.file, root)), work, tool);
const { cels, sequence } = await collectCels();
const frames = await pack(cels), actionEnd = (keys.length - 1) * 8;
const { clips } = JSON.parse(await readFile(new URL('../companion-dog-v9/frames.json', root)));
for (const clip of Object.values(clips)) clip.src = '../companion-dog-v9/' + clip.src;
clips.working = { label: '工作 · 关键姿态与离线补帧', src: 'working-atlas.webp', fps: 24,
  description: '起身叼取任务卷，搬运后趴下检查，抬头回应，再坐回休息。工作动作补帧试片，仅预览。',
  exitFps: 30, sequence, frames, phases: phases(),
  reducedStep: keys.findIndex(key => key.sourceCel === 62) * 8,
  exitPaths: sequence.map((frame, step) => frame === 0 ? [0] : [...sequence.slice(step, actionEnd), 0]) };
await writeFile(new URL('frames.json', root), JSON.stringify({ clips }, null, 2));
