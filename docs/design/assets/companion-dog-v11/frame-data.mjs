import { createCanvas } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { interpolate, restoreAlpha, interpolateChroma, restoreChroma } from './interpolate.mjs';

const SIZE = 112;

function addCel(pool, source) {
  const cel = createCanvas(SIZE, SIZE), context = cel.getContext('2d');
  context.drawImage(source, 0, 0, SIZE, SIZE);
  const data = context.getImageData(0, 0, SIZE, SIZE).data;
  const hash = createHash('sha256').update(data).digest('hex');
  if (!pool.ids.has(hash)) { pool.ids.set(hash, pool.cels.length); pool.cels.push(cel); }
  return pool.ids.get(hash);
}

export async function sequenceFromKeys(keys, work, tool, root, pool, eased, spatialTta = false, chroma = false) {
  const paths = keys.map(key => new URL(key.file, root));
  if (chroma) await interpolateChroma(paths, work, tool);
  else await interpolate(paths, work, tool, spatialTta);
  const sequence = [], keyStarts = [], cache = new Map(), phases = [];
  const sample = async index => {
    if (!cache.has(index)) cache.set(index, addCel(pool, await (chroma ? restoreChroma : restoreAlpha)(index, work)));
    return cache.get(index);
  };
  for (const [index, key] of keys.entries()) {
    keyStarts.push(sequence.length);
    const count = index === keys.length - 1 ? 1 : key.frames;
    const start = sequence.length, held = key.file === keys[index + 1]?.file;
    for (let step = 0; step < count; step++) {
      const time = held ? 0 : step / count;
      const progress = eased ? time * time * (3 - 2 * time) : time;
      sequence.push(await sample(index * 24 + Math.round(progress * 24)));
    }
    const last = phases.at(-1);
    if (last?.action === key.action) last.end = sequence.length - 1;
    else phases.push({ action: key.action, pose: key.pose, start, end: sequence.length - 1 });
  }
  return { sequence, keyStarts, phases };
}

function bounds(cel) {
  const data = cel.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
  let left = SIZE, top = SIZE, right = 0, bottom = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (data[(y * SIZE + x) * 4 + 3] < 2) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const x = Math.max(0, left - 1), y = Math.max(0, top - 1);
  return [x, y, Math.min(SIZE - 1, right + 1) - x + 1, Math.min(SIZE - 1, bottom + 1) - y + 1];
}

export async function packAtlas(cels, path) {
  let x = 1, y = 1, rowHeight = 0;
  const frames = Array(cels.length);
  const crops = cels.map((cel, id) => ({ id, crop: bounds(cel) })).sort((a, b) => b.crop[3] - a.crop[3]);
  for (const { id, crop: [left, top, width, height] } of crops) {
    if (x + width + 1 > 1024) { x = 1; y += rowHeight + 1; rowHeight = 0; }
    frames[id] = { source: [x, y, width, height],
      target: [left, top, width, height].map(value => value * 256 / SIZE) };
    x += width + 1; rowHeight = Math.max(rowHeight, height);
  }
  const atlas = createCanvas(1024, y + rowHeight + 1), context = atlas.getContext('2d');
  cels.forEach((cel, i) => {
    const { source: [x, y, width, height], target: [left, top] } = frames[i];
    context.drawImage(cel, Math.round(left * SIZE / 256), Math.round(top * SIZE / 256),
      width, height, x, y, width, height);
  });
  const bytes = atlas.toBuffer('image/webp', 96);
  await writeFile(path, bytes);
  return { frames, bytes: bytes.length, width: atlas.width, height: atlas.height,
    rgbaMiB: atlas.width * atlas.height * 4 / 1048576 };
}

export function nearestAnchorPath(sequence, step, anchor) {
  const anchors = sequence.map((id, index) => id === anchor ? index : -1).filter(index => index >= 0);
  if (!anchors.length) throw new Error('Animation has no settling anchor');
  const target = anchors.reduce((best, index) => Math.abs(index - step) < Math.abs(best - step) ? index : best);
  const path = [sequence[step]], direction = Math.sign(target - step);
  for (let index = step; index !== target;) { index += direction; path.push(sequence[index]); }
  return path.filter((id, index) => !index || id !== path[index - 1]);
}
