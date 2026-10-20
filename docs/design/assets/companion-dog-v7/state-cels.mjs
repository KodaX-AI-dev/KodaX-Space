import { createCanvas, loadImage } from '@napi-rs/canvas';
import { loadCels, renderCel } from '../companion-dog-v6/build-idle.mjs';

export const FPS = 24;
const EYES = [
  [652, 302, 125, 116],
  [862, 267, 89, 100],
];
export const smooth = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

function patch(image, rect) {
  const [x, y, width, height] = rect;
  const canvas = createCanvas(width, height),
    context = canvas.getContext('2d');
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      pixels.data[(y * width + x) * 4 + 3] *= Math.min(
        1,
        Math.min(x, y, width - 1 - x, height - 1 - y) / 8,
      );
    }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

async function normalized(name) {
  const image = await loadImage(new URL(name, import.meta.url));
  const canvas = createCanvas(1280, 1280);
  canvas.getContext('2d').drawImage(image, 0, 0, 1280, 1280);
  return canvas;
}

export async function loadStateCels() {
  const base = await loadCels();
  const [thinking, working, happy, halfHappy] = await Promise.all([
    normalized('thinking-eyes.png'),
    normalized('working-eyes.png'),
    normalized('complete-mouth.png'),
    normalized('complete-half.png'),
  ]);
  base.eyes.thinking = EYES.map((rect) => patch(thinking, rect));
  base.eyes.working = EYES.map((rect) => patch(working, rect));
  const mouthRect = [744, 440, 224, 112];
  return {
    base,
    mouthRect,
    mouths: [null, patch(halfHappy, mouthRect), patch(happy, mouthRect)],
    waiting: await loadWaitingCels(),
  };
}

async function loadWaitingCels() {
  const image = await loadImage(new URL('waiting-registered.png', import.meta.url));
  const canvas = createCanvas(image.width, image.height),
    context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return Array.from({ length: 16 }, (_, index) =>
    context.getImageData((index % 4) * 256, Math.floor(index / 4) * 256, 256, 256),
  );
}

function replaceWaiting(frame, cel) {
  const context = frame.getContext('2d'),
    pixels = context.getImageData(0, 0, 256, 256);
  for (let y = 143; y < 244; y++)
    for (let x = 108; x < 179; x++) {
      if (y < 148 || (y < 157 && x >= 153 && x < 170)) continue;
      const at = (y * 256 + x) * 4;
      pixels.data.set(cel.data.subarray(at, at + 4), at);
    }
  context.putImageData(pixels, 0, 0);
}

function sample(source, x, y, target, at) {
  if (x < 0 || y < 0 || x >= 255 || y >= 255) {
    target.fill(0, at, at + 4);
    return;
  }
  const left = Math.floor(x),
    top = Math.floor(y),
    u = x - left,
    v = y - top;
  const weights = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
  const offsets = [
    (top * 256 + left) * 4,
    (top * 256 + left + 1) * 4,
    ((top + 1) * 256 + left) * 4,
    ((top + 1) * 256 + left + 1) * 4,
  ];
  let alpha = 0;
  const rgb = [0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const weight = weights[i] * source[offsets[i] + 3];
    alpha += weight;
    for (let c = 0; c < 3; c++) rgb[c] += source[offsets[i] + c] * weight;
  }
  for (let c = 0; c < 3; c++) target[at + c] = alpha ? rgb[c] / alpha : 0;
  target[at + 3] = alpha;
}

function warpFrame(frame, pose) {
  if (!pose.tilt && !pose.headY && !pose.near && !pose.far) return frame;
  const context = frame.getContext('2d'),
    source = context.getImageData(0, 0, 256, 256);
  const target = context.getImageData(0, 0, 256, 256);
  for (let y = 32; y < 243; y++)
    for (let x = 72; x < 223; x++) {
      let sx = x,
        sy = y;
      const head = smooth((136 - y) / 18) * smooth((x - 72) / 9);
      if (head && (pose.tilt || pose.headY)) {
        const angle = -pose.tilt * head,
          dx = x - 154,
          dy = y - 128 - pose.headY * head;
        sx = 154 + Math.cos(angle) * dx - Math.sin(angle) * dy;
        sy = 128 + Math.sin(angle) * dx + Math.cos(angle) * dy;
      }
      const foot = smooth((y - 184) / 25);
      const near = smooth(1 - Math.abs(x - 149) / 18),
        far = smooth(1 - Math.abs(x - 179) / 14);
      sy += foot * (near * pose.near + far * pose.far);
      if (sx !== x || sy !== y) sample(source.data, sx, sy, target.data, (y * 256 + x) * 4);
    }
  context.putImageData(target, 0, 0);
  return frame;
}

export function renderStateCel(cels, pose) {
  const frame = renderCel(cels.base, { eye: pose.eye ?? 'open', tail: pose.tail ?? 0 });
  if (pose.mouth) {
    const [x, y, w, h] = cels.mouthRect;
    frame
      .getContext('2d')
      .drawImage(
        cels.mouths[pose.mouth],
        13.8 + (x * 229) / 1280,
        25 + (y * 229) / 1280,
        (w * 229) / 1280,
        (h * 229) / 1280,
      );
  }
  if (pose.paw > 0) replaceWaiting(frame, cels.waiting[pose.paw]);
  return warpFrame(frame, { tilt: 0, headY: 0, near: 0, far: 0, ...pose });
}
