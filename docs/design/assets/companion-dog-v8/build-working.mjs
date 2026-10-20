import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { extractCels } from './extract-cels.mjs';

const CELL = 112;
const root = new URL('.', import.meta.url);
const review = new URL('../../../../artifacts/companion-working-v8/', import.meta.url);

function pixelsBounds(canvas) {
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width,
    top = canvas.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < canvas.height; y++)
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] < 80) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  return { left, top, right, bottom };
}

async function pack(name, cels, clip) {
  const atlas = createCanvas(CELL * 8, CELL * Math.ceil(cels.length / 8));
  cels.forEach((cel, index) =>
    atlas
      .getContext('2d')
      .drawImage(cel, (index % 8) * CELL, Math.floor(index / 8) * CELL, CELL, CELL),
  );
  const src = `${name}-atlas.webp`;
  await writeFile(new URL(src, root), atlas.toBuffer('image/webp', 95));
  return {
    ...clip,
    sequence: clip.sequence ?? cels.map((_, index) => index),
    src,
    frames: cels.map((_, index) => ({
      source: [(index % 8) * CELL, Math.floor(index / 8) * CELL, CELL, CELL],
      target: [0, 0, 256, 256],
    })),
  };
}

async function compactPrevious(clip, name) {
  const image = await loadImage(
    new URL(clip.src, new URL('../companion-dog-v7/frames.json', root)),
  );
  const cels = clip.frames.map((frame) => {
    const stage = createCanvas(256, 256);
    stage.getContext('2d').drawImage(image, ...frame.source, ...frame.target);
    const canvas = createCanvas(CELL, CELL),
      context = canvas.getContext('2d');
    context.drawImage(stage, 0, 0, CELL, CELL);
    return canvas;
  });
  return pack(name, cels, clip);
}

function normalize(source, scale, travel = 0) {
  scale *= 0.9;
  const box = pixelsBounds(source),
    canvas = createCanvas(128, 128);
  canvas
    .getContext('2d')
    .drawImage(
      source,
      64 - ((box.left + box.right) / 2) * scale + travel,
      121 - box.bottom * scale,
      source.width * scale,
      source.height * scale,
    );
  return canvas;
}

async function working(idle) {
  const sources = await extractCels(new URL('working-story-candidate.png', root));
  const prepare = await extractCels(new URL('prepare-inbetweens.png', root), 4, 4);
  const lower = await extractCels(new URL('lower-inbetweens.png', root), 4, 4);
  const rise = await extractCels(new URL('rise-inbetweens.png', root), 4, 4);
  const neutral = createCanvas(128, 128),
    neutralContext = neutral.getContext('2d');
  neutralContext.scale(0.5, 0.5);
  neutralContext.drawImage(
    await loadImage(new URL(idle.src, new URL('../companion-dog-v7/frames.json', root))),
    ...idle.frames[0].source,
    ...idle.frames[0].target,
  );
  const cels = [neutral],
    sequence = [],
    phases = [];
  function add(action, pose, drawings) {
    const start = sequence.length;
    for (const drawing of drawings) {
      if (drawing === null) sequence.push(0);
      else {
        sequence.push(cels.length);
        cels.push(drawing);
      }
    }
    phases.push({ action, pose, start, end: sequence.length - 1 });
  }
  add('prepare', 'seated-to-standing', [
    ...Array(5).fill(null),
    ...prepare.map((cel) => normalize(cel.canvas, 0.41)),
  ]);
  add(
    'fetch',
    'standing',
    sources.slice(9, 16).map((cel) => normalize(cel.canvas, 0.74)),
  );
  add(
    'carry',
    'standing',
    sources.slice(16, 25).map((cel, i) => normalize(cel.canvas, 0.74, (i / 8) * 3)),
  );
  add('inspect', 'lying', [
    ...lower.map((cel) => normalize(cel.canvas, 0.38, 3)),
    ...sources.slice(26, 40).map((cel) => normalize(cel.canvas, 0.74, 3)),
  ]);
  add(
    'respond',
    'lying',
    sources.slice(40, 51).map((cel) => normalize(cel.canvas, 0.74, 3)),
  );
  // Rise cel 3 contains a neighboring scroll fragment; its adjacent cels cover the nose nudge.
  add('settle', 'lying-to-seated', [
    ...rise
      .filter((_, i) => i !== 3)
      .map((cel, i) => normalize(cel.canvas, 0.38, 3 * (1 - i / 14))),
    null,
  ]);
  const actionEnd = sequence.length;
  add('rest', 'seated', Array(32).fill(null));
  const exitPaths = sequence.map((frame, step) =>
    frame === 0 ? [0] : [...sequence.slice(step, actionEnd), 0],
  );
  const sheet = createCanvas(8 * 160, Math.ceil(cels.length / 8) * 176),
    ctx = sheet.getContext('2d');
  ctx.fillStyle = '#eeece5';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  cels.forEach((cel, index) => {
    ctx.drawImage(cel, (index % 8) * 160 + 16, Math.floor(index / 8) * 176 + 4);
    ctx.fillStyle = '#37362f';
    ctx.font = '12px sans-serif';
    ctx.fillText(String(index), (index % 8) * 160 + 16, Math.floor(index / 8) * 176 + 151);
  });
  await writeFile(new URL('working-contact.png', review), sheet.toBuffer('image/png'));
  const joins = createCanvas(4 * 256, 3 * 280),
    joinContext = joins.getContext('2d');
  joinContext.fillStyle = '#eeece5';
  joinContext.fillRect(0, 0, joins.width, joins.height);
  [0, 1, 16, 17, 32, 33, 48, 49, 73, 74, 88, 0].forEach((id, index) => {
    joinContext.drawImage(cels[id], (index % 4) * 256, Math.floor(index / 4) * 280, 256, 256);
    joinContext.fillStyle = '#24241f';
    joinContext.font = '14px sans-serif';
    joinContext.fillText('cel ' + id, (index % 4) * 256 + 10, Math.floor(index / 4) * 280 + 274);
  });
  await writeFile(new URL('joins.png', review), joins.toBuffer('image/png'));
  return pack('working', cels, {
    label: '工作 · 完整身体帧动画试片',
    description: '起身寻找、叼取任务卷、短走两步、趴下检查、抬头回应、坐回休息。仅预览。',
    fps: 16,
    exitFps: 24,
    loopStart: 0,
    once: false,
    reducedStep: phases[3].end - 3,
    sequence,
    exitPaths,
    phases,
  });
}

await mkdir(review, { recursive: true });
const old = JSON.parse(await readFile(new URL('../companion-dog-v7/frames.json', root), 'utf8'));
const clips = {};
for (const [name, clip] of Object.entries(old.clips))
  clips[name] =
    name === 'working' ? await working(old.clips.idle) : await compactPrevious(clip, name);
await writeFile(new URL('frames.json', root), JSON.stringify({ clips }, null, 2));
const report = [];
for (const [state, clip] of Object.entries(clips)) {
  const image = await loadImage(new URL(clip.src, root));
  report.push({
    state,
    width: image.width,
    height: image.height,
    encodedBytes: (await stat(new URL(clip.src, root))).size,
    rgbaMiB: (image.width * image.height * 4) / 1048576,
    frames: clip.frames.length,
    fps: clip.fps,
  });
}
await writeFile(new URL('asset-report.json', review), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report) + '\n');
