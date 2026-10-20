import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extractKeyposes } from './extract-keyposes.mjs';
import { loadCels, renderCel } from '../companion-dog-v6/build-idle.mjs';

const root = new URL('.', import.meta.url);
const folder = new URL('keyframes/', root);
const idleCels = await loadCels();
const master = renderCel(idleCels, { tail: 0, eye: 'open' });
await mkdir(folder, { recursive: true });

async function save(name, source) {
  const canvas = createCanvas(256, 256);
  canvas.getContext('2d').drawImage(source, 0, 0, 256, 256);
  await writeFile(new URL(name + '.png', folder), canvas.toBuffer('image/png'));
}

function register(cel, scale, targetX = 151, footX = cel.footX) {
  const canvas = createCanvas(256, 256);
  canvas.getContext('2d').drawImage(cel.canvas, targetX - footX * scale,
    238 - cel.floor * scale, cel.canvas.width * scale, cel.canvas.height * scale);
  return canvas;
}

function supportingForepaw(cel) {
  const { width, height } = cel.canvas;
  const data = cel.canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const columns = Array(width).fill(0);
  for (let y = Math.floor(height * .84); y < height; y++)
    for (let x = Math.floor(width * .44); x < width; x++) {
      const at = (y * width + x) * 4;
      if (data[at + 3] > 180 && data[at] > 210 && data[at + 1] > 180 && data[at + 2] > 130)
        columns[x]++;
    }
  const groups = [];
  for (let x = 0; x < width; x++) {
    if (!columns[x]) continue;
    const last = groups.at(-1);
    if (last && x - last.right < 5) {
      last.right = x; last.weight += columns[x]; last.sum += x * columns[x];
    } else groups.push({ right: x, weight: columns[x], sum: x * columns[x] });
  }
  const maximum = Math.max(...groups.map(group => group.weight));
  const paw = groups.find(group => group.weight > maximum * .35);
  if (!paw) throw new Error('Cannot locate the planted cream forepaw');
  return paw.sum / paw.weight;
}

async function prepareTaskPoses() {
  const poses = await extractKeyposes(new URL('thinking-waiting-keyposes.png', root));
  const scale = 196 / (poses[0].part.bottom - poses[0].part.top);
  for (let i = 0; i < poses.length; i++)
    await save('task-' + i, register(poses[i], scale, 151, supportingForepaw(poses[i])));
  const happy = await extractKeyposes(new URL('complete-keyposes.png', root));
  const happyScale = 190 / (happy[0].part.bottom - happy[0].part.top);
  // Hind paws spread backward as the dog stands and bows; forepaws reach forward.
  const rearX = [176, 535, 974, 1428, 86, 576, 1060, 1495];
  const targetX = [105, 75, 55, 55, 40, 55, 100, 105];
  for (let i = 0; i < happy.length; i++)
    await save('happy-' + i, register(happy[i], happyScale, targetX[i], rearX[i] - happy[i].part.left + 2));
  const rising = await extractKeyposes(new URL('complete-rise-keyposes.png', root), 4, 1);
  const riseScale = 190 / (rising[3].part.bottom - rising[3].part.top);
  const plantedX = [166, 160, 155, 151];
  for (let i = 0; i < rising.length; i++)
    await save('rise-' + i, register(rising[i], riseScale, plantedX[i], supportingForepaw(rising[i])));
}

async function prepareIdle() {
  for (const [name, tail, eye] of [
    ['tail-a', .45, 'open'], ['tail-b', -.8, 'open'], ['tail-c', .8, 'open'],
    ['tail-d', -.45, 'open'], ['blink-half', 0, 'half'], ['blink-closed', 0, 'closed'],
  ]) await save(name, renderCel(idleCels, { tail, eye }));
}

async function prepareWorking() {
  const keys = JSON.parse(await readFile(new URL('../companion-dog-v10/keyposes.json', root)));
  for (const id of new Set(keys.map(key => key.sourceCel).filter(id => id !== 0))) {
    const path = new URL(`../companion-dog-v10/keyframes/pose-${id}.png`, root);
    await save('work-' + id, await loadImage(path));
  }
}

await save('neutral', master);
await prepareIdle();
await prepareTaskPoses();
await prepareWorking();
