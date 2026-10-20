// Offline cel compositor. The preview consumes whole PNG frames only.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SIZE = 256;
const FPS = 24;
const DURATION = 8;
const ORIGINAL = new URL('../companion-dog-v3/character-anchor.png', import.meta.url);
const folder = fileURLToPath(new URL('.', import.meta.url));
const eyeRects = [
  [652, 302, 125, 116],
  [862, 267, 89, 100],
];

function wag(time, start, duration, cycles, strength) {
  const phase = (time - start) / duration;
  if (phase <= 0 || phase >= 1) return 0;
  return Math.sin(phase * Math.PI * 2 * cycles) * Math.sin(phase * Math.PI) ** 2 * strength;
}

function blink(time, start) {
  const elapsed = time - start;
  if (elapsed < 0 || elapsed >= 7 / FPS) return 'open';
  return ['half', 'closed', 'closed', 'half', 'half', 'open', 'open'][Math.floor(elapsed * FPS)];
}

export function idlePose(time) {
  const local = ((time % DURATION) + DURATION) % DURATION;
  const first = blink(local, 3.625);
  return {
    tail: wag(local, 1.125, 2.25, 2, 1) + wag(local, 5.25, 1.25, 1, 0.58),
    eye: first === 'open' ? blink(local, 6.75) : first,
  };
}

function makeTailCels(image) {
  const body = createCanvas(image.width, image.height);
  const context = body.getContext('2d');
  context.drawImage(image, 0, 0);
  const bodyPixels = context.getImageData(0, 0, image.width, image.height);
  const tailPixels = context.createImageData(image.width, image.height);
  for (let y = 590; y < 854; y++) {
    for (let x = 170; x < 410; x++) {
      const at = (y * image.width + x) * 4;
      tailPixels.data.set(bodyPixels.data.subarray(at, at + 4), at);
      bodyPixels.data.fill(0, at, at + 4);
    }
  }
  context.putImageData(bodyPixels, 0, 0);
  return { body, tailPixels: tailPixels.data };
}

function makeEyePatch(image, rect) {
  const [left, top, width, height] = rect;
  const patch = createCanvas(width, height);
  const context = patch.getContext('2d');
  context.drawImage(image, left, top, width, height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const feather = Math.min(1, Math.min(x, y, width - 1 - x, height - 1 - y) / 9);
      pixels.data[(y * width + x) * 4 + 3] *= feather;
    }
  context.putImageData(pixels, 0, 0);
  return patch;
}

export async function loadCels() {
  const originals = await Promise.all([
    loadImage(ORIGINAL),
    loadImage(new URL('blink-half.png', import.meta.url)),
    loadImage(new URL('blink-closed.png', import.meta.url)),
  ]);
  for (const image of originals) {
    if (image.width !== originals[0].width || image.height !== originals[0].height)
      throw new Error('Cel framing must match the master');
  }
  const [open, half, closed] = originals.map((image) => {
    const normalized = createCanvas(1280, 1280);
    normalized.getContext('2d').drawImage(image, 0, 0, 1280, 1280);
    return normalized;
  });
  return {
    open,
    ...makeTailCels(open),
    scratch: createCanvas(1280, 1280),
    eyes: {
      half: eyeRects.map((rect) => makeEyePatch(half, rect)),
      closed: eyeRects.map((rect) => makeEyePatch(closed, rect)),
    },
  };
}

function drawBentTail(context, pixels, amplitude) {
  const target = context.createImageData(340, 264);
  for (let y = 0; y < 264; y++) {
    const bend = Math.max(0, Math.min(1, (260 - y) / 240)) ** 1.6;
    const offset = amplitude * 68 * bend;
    for (let x = 0; x < 340; x++) {
      const sourceX = x + 130 - offset;
      const fraction = sourceX - Math.floor(sourceX);
      const left = ((y + 590) * 1280 + Math.floor(sourceX)) * 4;
      const out = (y * 340 + x) * 4;
      const alphaA = pixels[left + 3] * (1 - fraction);
      const alphaB = pixels[left + 7] * fraction;
      const alpha = alphaA + alphaB;
      if (!alpha) continue;
      for (let channel = 0; channel < 3; channel++) {
        target.data[out + channel] =
          (pixels[left + channel] * alphaA + pixels[left + 4 + channel] * alphaB) / alpha;
      }
      target.data[out + 3] = alpha;
    }
  }
  context.putImageData(target, 130, 590);
}

export function renderCel(cels, pose) {
  const full = cels.scratch;
  const context = full.getContext('2d');
  context.clearRect(0, 0, 1280, 1280);
  drawBentTail(context, cels.tailPixels, pose.tail);
  context.drawImage(cels.body, 0, 0);
  if (pose.eye !== 'open')
    cels.eyes[pose.eye].forEach((patch, index) => {
      context.drawImage(patch, eyeRects[index][0], eyeRects[index][1]);
    });
  const frame = createCanvas(SIZE, SIZE);
  frame.getContext('2d').drawImage(full, 13.8, 25, 229, 229);
  return frame;
}

async function build() {
  const cels = await loadCels();
  const frames = [],
    sequence = [],
    hashes = new Map();
  const reviewFolder = new URL('../../../../artifacts/companion-idle-v6/', import.meta.url);
  await mkdir(reviewFolder, { recursive: true });
  for (let index = 0; index < FPS * DURATION; index++) {
    const pose = idlePose(index / FPS);
    if (index && pose.tail === 0 && pose.eye === 'open') {
      sequence.push(0);
      continue;
    }
    const frame = renderCel(cels, pose);
    const pixels = frame.getContext('2d').getImageData(0, 0, SIZE, SIZE);
    const hash = createHash('sha256').update(pixels.data).digest('hex');
    if (!hashes.has(hash)) {
      hashes.set(hash, frames.length);
      frames.push(pixels);
    }
    sequence.push(hashes.get(hash));
  }
  const atlas = createCanvas(8 * SIZE, Math.ceil(frames.length / 8) * SIZE);
  const context = atlas.getContext('2d');
  frames.forEach((pixels, index) =>
    context.putImageData(pixels, (index % 8) * SIZE, Math.floor(index / 8) * SIZE),
  );
  await writeFile(`${folder}/idle-atlas.png`, atlas.toBuffer('image/png'));
  const bitmapFrames = frames.map((_, index) => ({
    source: [(index % 8) * SIZE, Math.floor(index / 8) * SIZE, SIZE, SIZE],
    target: [0, 0, SIZE, SIZE],
  }));
  const manifest = {
    clips: {
      reference: {
        label: '原造型参考 · 静态',
        description: '同一张造型底稿。正式产品宠物未替换。',
        src: '../companion-dog-v3/character-anchor.png',
        fps: 0,
        frames: [{ source: [0, 0, 1254, 1254], target: [13.8, 25, 229, 229] }],
      },
      idle: {
        label: '待机 · 完整帧动画',
        description:
          '固定原造型，局部眼睑原画与尾巴柔弯离线合成完整帧；短摇尾、眨眼后自然停顿，8 秒闭环。仅预览。',
        src: 'idle-atlas.png',
        fps: FPS,
        frames: bitmapFrames,
        sequence,
      },
    },
  };
  await writeFile(`${folder}/frames.json`, JSON.stringify(manifest, null, 2));
  for (const [label, time] of [
    ['neutral', 0],
    ['tail-left', 2],
    ['tail-right', 2.5],
    ['blink', 3.7],
    ['seam', 8 - 1 / FPS],
  ]) {
    await writeFile(
      new URL(`${label}.png`, reviewFolder),
      renderCel(cels, idlePose(time)).toBuffer('image/png'),
    );
  }
  await writeFile(
    new URL('report.json', reviewFolder),
    JSON.stringify(
      {
        duration: DURATION,
        fps: FPS,
        uniqueBitmaps: frames.length,
        playbackSteps: sequence.length,
        artworkSources: ['original anchor', 'half-closed eye cel', 'closed eye cel'],
        loop: 'forward; neutral holds at both sides; no ping-pong',
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    JSON.stringify({
      uniqueBitmaps: frames.length,
      steps: sequence.length,
      atlas: [atlas.width, atlas.height],
    }) + '\n',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
