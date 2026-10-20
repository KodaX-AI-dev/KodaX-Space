import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ACTIONS, PARTS, drawDog } from './companion-rig.js';

const output = fileURLToPath(
  new URL('../../../artifacts/companion-motion-v4/frames/', import.meta.url),
);
await mkdir(output, { recursive: true });
const source = await loadImage(
  new URL('../assets/companion-dog-v4/rig-atlas.png', import.meta.url),
);
const collarSource = await loadImage(
  new URL('../assets/companion-dog-v4/collar.png', import.meta.url),
);
function crop(image, [x0, y0, x1, y1]) {
  const canvas = createCanvas(x1 - x0, y1 - y0);
  canvas.getContext('2d').drawImage(image, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  return canvas;
}
const parts = Object.fromEntries(
  Object.entries(PARTS).map(([key, box]) => [key, crop(source, box)]),
);
const collar = crop(collarSource, [140, 196, 1337, 971]);
const torsoSource = await loadImage(
  new URL('../assets/companion-dog-v4/torso.png', import.meta.url),
);
parts.body = crop(torsoSource, [198, 134, 1148, 1035]);
const dog = createCanvas(256, 256);
const stage = createCanvas(384, 400);
const context = stage.getContext('2d');
const clips = [
  ['thinking', 4.8, '思考：侧头 · 抬爪 · 放回'],
  ['walking', 1.9, '小步走：完整四足步态'],
  ['complete', 2.4, '完成：蓄力 · 小跃 · 缓冲'],
];
for (const [state, duration, title] of clips) {
  for (let frame = 0; frame < Math.ceil(duration * 30); frame++) {
    drawDog(dog.getContext('2d'), parts, ACTIONS[state](frame / 30, frame / 30), collar);
    context.fillStyle = '#181916';
    context.fillRect(0, 0, 384, 400);
    context.drawImage(dog, 0, 0, 384, 384);
    context.font = '15px Microsoft YaHei';
    context.fillStyle = '#d7d9ce';
    context.textAlign = 'center';
    context.fillText(title, 192, 387);
    await writeFile(
      `${output}/${state}-${String(frame).padStart(3, '0')}.png`,
      stage.toBuffer('image/png'),
    );
  }
}
for (const state of Object.keys(ACTIONS)) {
  drawDog(dog.getContext('2d'), parts, ACTIONS[state](1.6, 1.6), collar);
  await writeFile(`${output}/qa-${state}.png`, dog.toBuffer('image/png'));
}
process.stdout.write(
  `Rendered clips and ${Object.keys(ACTIONS).length} pose checks to ${output}\n`,
);
