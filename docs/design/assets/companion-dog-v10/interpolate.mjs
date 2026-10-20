import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PNG } from 'pngjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export async function writeMatteInputs(keys, folder, background) {
  await mkdir(folder, { recursive: true });
  for (const [index, path] of keys.entries()) {
    const canvas = createCanvas(256, 256), context = canvas.getContext('2d');
    context.fillStyle = background;
    context.fillRect(0, 0, 256, 256);
    context.drawImage(await loadImage(path), 0, 0, 256, 256);
    const png = new PNG({ width: 256, height: 256 });
    png.data = Buffer.from(context.getImageData(0, 0, 256, 256).data);
    // The Windows decoder in this release expects RGB, not RGBA input.
    await writeFile(new URL(`${String(index).padStart(3, '0')}.png`, folder),
      PNG.sync.write(png, { colorType: 2 }));
  }
}

export async function interpolate(keys, work, tool) {
  for (const matte of ['black', 'white']) {
    const input = new URL(matte + '-input/', work), output = new URL(matte + '-output/', work);
    await writeMatteInputs(keys, input, matte);
    await mkdir(output, { recursive: true });
    const result = spawnSync(fileURLToPath(new URL('rife-ncnn-vulkan.exe', tool)), [
      '-i', fileURLToPath(input), '-o', fileURLToPath(output), '-n', String(keys.length * 8),
      '-m', fileURLToPath(new URL('rife-v4.6', tool)), '-g', '0', '-j', '2:2:2', '-z',
    ], { encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr);
    await writeFile(new URL(matte + '-inference.txt', work), result.stderr);
  }
}

export async function restoreAlpha(frame, work) {
  const name = `${String(frame + 1).padStart(8, '0')}.png`;
  const black = PNG.sync.read(await readFile(new URL('black-output/' + name, work))).data;
  const white = PNG.sync.read(await readFile(new URL('white-output/' + name, work))).data;
  const large = createCanvas(256, 256), context = large.getContext('2d');
  const image = context.createImageData(256, 256);
  for (let p = 0; p < black.length; p += 4) {
    const alpha = Math.min(1, 1 - ((white[p] - black[p]) + (white[p + 1] - black[p + 1])
      + (white[p + 2] - black[p + 2])) / 765);
    if (alpha < .025) continue;
    image.data[p + 3] = alpha * 255;
    for (let channel = 0; channel < 3; channel++) image.data[p + channel] = black[p + channel] / alpha;
  }
  context.putImageData(image, 0, 0);
  const cel = createCanvas(128, 128);
  cel.getContext('2d').drawImage(large, 0, 0, 128, 128);
  return cel;
}
