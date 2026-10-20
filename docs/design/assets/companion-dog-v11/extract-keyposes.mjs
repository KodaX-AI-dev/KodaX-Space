import { createCanvas, loadImage } from '@napi-rs/canvas';

function components(pixels, width, height) {
  const labels = new Int32Array(width * height), parts = [];
  for (let seed = 0; seed < labels.length; seed++) {
    if (labels[seed] || pixels[seed * 4 + 3] < 180) continue;
    const id = parts.length + 1, queue = [seed];
    let left = width, top = height, right = 0, bottom = 0;
    labels[seed] = id;
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i], x = at % width, y = Math.floor(at / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const next of [x ? at - 1 : -1, x + 1 < width ? at + 1 : -1, at - width, at + width]) {
        if (next < 0 || next >= labels.length || labels[next] || pixels[next * 4 + 3] < 180) continue;
        labels[next] = id; queue.push(next);
      }
    }
    parts.push({ id, left, top, right, bottom, area: queue.length });
  }
  return { labels, parts };
}

function isolate(data, labels, width, part) {
  const canvas = createCanvas(part.right - part.left + 5, part.bottom - part.top + 5);
  const context = canvas.getContext('2d'), output = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const sx = part.left + x - 2, sy = part.top + y - 2, index = sy * width + sx;
    let included = labels[index] === part.id;
    for (let dy = -1; dy <= 1 && !included; dy++) for (let dx = -1; dx <= 1; dx++)
      included ||= labels[(sy + dy) * width + sx + dx] === part.id;
    if (included) output.data.set(data.subarray(index * 4, index * 4 + 4), (y * canvas.width + x) * 4);
  }
  context.putImageData(output, 0, 0);
  let weight = 0, sum = 0;
  for (let y = canvas.height - 7; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const alpha = output.data[(y * canvas.width + x) * 4 + 3];
    weight += alpha; sum += x * alpha;
  }
  return { canvas, part, footX: sum / weight, floor: part.bottom - part.top + 2 };
}

export async function extractKeyposes(path, columns = 4, rows = 2) {
  const image = await loadImage(path), canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const pixels = canvas.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  const { labels, parts } = components(pixels, image.width, image.height);
  const bodies = parts.filter(part => part.area > image.width * image.height / (columns * rows) * .15)
    .sort((a, b) => (a.top + a.bottom) - (b.top + b.bottom));
  if (bodies.length !== columns * rows) throw new Error('Unexpected complete key pose count: ' + bodies.length);
  return Array.from({ length: rows }, (_, row) => bodies.slice(row * columns, (row + 1) * columns))
    .flatMap(row => row.sort((a, b) => a.left - b.left))
    .map(part => isolate(pixels, labels, image.width, part));
}
