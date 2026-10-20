// Keep independently edited cels in the anchor's original framing.
// The generated 4x4 sheet and the two-cel morph were rejected during visual review.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFile } from 'node:fs/promises';
import { loadCels, renderCel } from '../companion-dog-v6/build-idle.mjs';

const names = [
  null,
  'waiting-low-0.png',
  'waiting-low-1.png',
  'waiting-low-2.png',
  'waiting-low-3.png',
  'waiting-low-4.png',
  'waiting-01.png',
  'waiting-02.png',
  'waiting-03.png',
  'waiting-04.png',
  'waiting-05.png',
  'waiting-06.png',
  'waiting-07.png',
  'waiting-pose.png',
  'waiting-pose.png',
  'waiting-pose.png',
];
const base = await loadCels();
const atlas = createCanvas(1024, 1024),
  context = atlas.getContext('2d');
for (const [index, name] of names.entries()) {
  let frame;
  if (!name) frame = renderCel(base, { eye: 'open', tail: 0 });
  else {
    const image = await loadImage(new URL(name, import.meta.url));
    if (image.width !== 1254 || image.height !== 1254)
      throw new Error('Independent cel changed its framing: ' + name);
    frame = createCanvas(256, 256);
    frame.getContext('2d').drawImage(image, 13.8, 25, 229, 229);
  }
  const pixels = frame.getContext('2d').getImageData(0, 0, 256, 256);
  context.putImageData(pixels, (index % 4) * 256, Math.floor(index / 4) * 256);
}
await writeFile(new URL('waiting-registered.png', import.meta.url), atlas.toBuffer('image/png'));
