import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extractCels } from './extract-cels.mjs';
import { loadCels, renderCel } from '../companion-dog-v6/build-idle.mjs';

const root = new URL('.', import.meta.url);
const previous = new URL('../companion-dog-v8/', root);
const review = new URL('../../../../artifacts/companion-working-v9/', root);
const CELL = 104;
let floorScroll;

// Register the intact character, excluding disconnected props. Never stretch body parts.
function register(cel, scale, travel = 0, floor = false) {
  const canvas = createCanvas(128, 128);
  const center = (cel.dog.left + cel.dog.right) / 2 - cel.box.left;
  const ground = cel.dog.bottom - cel.box.top;
  scale *= 0.9;
  const context = canvas.getContext('2d');
  if (floor && cel.props.length) {
    context.drawImage(cel.body, 64 - center * scale + travel, 120 - ground * scale,
      cel.canvas.width * scale, cel.canvas.height * scale);
    context.drawImage(floorScroll, 99, 109, 26, 11);
  } else context.drawImage(cel.canvas,
      64 - center * scale + travel, 120 - ground * scale,
      cel.canvas.width * scale, cel.canvas.height * scale);
  return canvas;
}

async function bridge(name, start, startScale, end, endScale, travel = 0, floor = false) {
  const frames = await extractCels(new URL(name + '.png', root), 4, 2);
  const height = cel => cel.dog.bottom - cel.dog.top + 1;
  const from = height(start) * startScale / height(frames[0]);
  const to = height(end) * endScale / height(frames.at(-1));
  // Preserve actual endpoint drawings; use only the six new intermediate drawings.
  return frames.slice(1, -1).map((cel, i) => register(cel, from + (to - from) * (i + 1) / 7, travel, floor));
}

async function makeWorking(old) {
  const sources = await extractCels(new URL('working-story-candidate.png', previous));
  const prepare = await extractCels(new URL('prepare.png', root), 4, 4);
  const lower = await extractCels(new URL('lower-transparent.png', root), 4, 4);
  const respond = await extractCels(new URL('respond.png', root), 4, 4);
  const rise = await extractCels(new URL('settle.png', root), 4, 4);
  const identity = (await extractCels(new URL('../companion-dog-v3/character-anchor.png', root), 1, 1))[0];
  const propBox = prepare[0].propBox;
  floorScroll = createCanvas(propBox.width, propBox.height);
  floorScroll.getContext('2d').drawImage(prepare[0].prop, propBox.x, propBox.y,
    propBox.width, propBox.height, 0, 0, propBox.width, propBox.height);
  const neutral = createCanvas(128, 128);
  neutral.getContext('2d').drawImage(await loadImage(new URL('../companion-dog-v6/idle-atlas.png', root)),
    0, 0, 256, 256, 0, 0, 128, 128);
  const idleCels = await loadCels();
  const tailReturn = Array.from({ length: 12 }, (_, i) => {
    const t = i / 11, ease = t * t * (3 - 2 * t), canvas = createCanvas(128, 128);
    canvas.getContext('2d').drawImage(renderCel(idleCels, {tail: -1.5 * (1 - ease), eye: 'open'}),
      0, 0, 128, 128);
    return canvas;
  });
  const cels = [neutral], sequence = [], phases = [], ids = new Map([[neutral, 0]]);
  function add(action, pose, drawings) {
    const start = sequence.length;
    for (const drawing of drawings) {
      if (drawing === null) sequence.push(0);
      else {
        if (!ids.has(drawing)) { ids.set(drawing, cels.length); cels.push(drawing); }
        sequence.push(ids.get(drawing));
      }
    }
    phases.push({ action, pose, start, end: sequence.length - 1 });
  }
  add('prepare', 'seated-to-standing', [...Array(5).fill(null),
    ...prepare.slice(0, 2).map(c => register(c, .41, 0, true)),
    ...await bridge('gaze-gap', prepare[1], .41, prepare[3], .41, 0, true),
    ...prepare.slice(3, 5).map(c => register(c, .41, 0, true)),
    ...await bridge('stand-gap', prepare[4], .41, prepare[5], .41, 0, true),
    ...prepare.slice(5, 7).map(c => register(c, .41, 0, true))]);
  add('fetch', 'standing', [...sources.slice(9, 12).map(c => register(c, .74)),
    ...await bridge('pickup-gap', sources[11], .74, sources[12], .74),
    ...sources.slice(12, 16).map(c => register(c, .74))]);
  add('carry', 'standing', sources.slice(16, 25).map((c, i) => register(c, .74, i / 8 * 3)));
  const lowering = lower.map(c => register(c, .36, 3));
  add('inspect', 'lying', [...lowering, ...Array(6).fill(lowering.at(-1))]);
  add('respond', 'lying', [...await bridge('inspect-gap', lower[15], .36, respond[0], .34, 3),
    ...respond.map(c => register(c, .34, 3))]);
  add('settle', 'lying-to-seated', [...rise.slice(0, 3).map(c => register(c, .39, 3)),
    ...await bridge('rise-gap', rise[2], .39, rise[4], .39, 3),
    ...rise.slice(4).map((c, i) => register(c, .39 + .02 * i / 11, 3 * (1 - i / 11))),
    ...await bridge('neutral-gap', rise[15], .41, identity, 114.5 / 1254 / .9),
    ...tailReturn, null]);
  const actionEnd = sequence.length;
  add('rest', 'seated', Array(36).fill(null));
  const atlas = createCanvas(CELL * 8, CELL * Math.ceil(cels.length / 8));
  const ctx = atlas.getContext('2d');
  cels.forEach((cel, i) => ctx.drawImage(cel, i % 8 * CELL, Math.floor(i / 8) * CELL, CELL, CELL));
  await writeFile(new URL('working-atlas.webp', root), atlas.toBuffer('image/webp', 95));
  const contact = createCanvas(8 * 160, Math.ceil(cels.length / 8) * 176), s = contact.getContext('2d');
  s.fillStyle = '#eeece5'; s.fillRect(0, 0, contact.width, contact.height);
  for (const [i, cel] of cels.entries()) {
    s.drawImage(cel, i % 8 * 160 + 16, Math.floor(i / 8) * 176 + 4);
    s.fillStyle = '#37362f'; s.font = '12px sans-serif';
    s.fillText(String(i), i % 8 * 160 + 16, Math.floor(i / 8) * 176 + 151);
    await writeFile(new URL(`cel-${i}.png`, review), cel.toBuffer('image/png'));
  }
  await writeFile(new URL('working-contact.png', review), contact.toBuffer('image/png'));
  return { ...old, label: '工作 · 连续原画修订', fps: 18, src: 'working-atlas.webp', sequence, phases,
    frames: cels.map((_, i) => ({ source: [i % 8 * CELL, Math.floor(i / 8) * CELL, CELL, CELL], target: [0, 0, 256, 256] })),
    exitPaths: sequence.map((frame, step) => frame === 0 ? [0] : [...sequence.slice(step, actionEnd), 0]),
    reducedStep: phases[3].end - 3 };
}

await mkdir(review, { recursive: true });
const { clips: old } = JSON.parse(await readFile(new URL('frames.json', previous), 'utf8'));
const clips = Object.fromEntries(Object.entries(old).map(([name, clip]) =>
  [name, { ...clip, src: '../companion-dog-v8/' + clip.src }]));
clips.working = await makeWorking(old.working);
await writeFile(new URL('frames.json', root), JSON.stringify({ clips }, null, 2));
