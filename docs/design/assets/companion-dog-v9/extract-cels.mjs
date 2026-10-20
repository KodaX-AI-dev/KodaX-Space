import { createCanvas, loadImage } from '@napi-rs/canvas';

export async function extractCels(path, columns = 8, rows = 8) {
  const image = await loadImage(path),
    canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const data = canvas.getContext('2d').getImageData(0, 0, image.width, image.height);
  const cuts = [];
  if (columns === 4)
    for (let column = 1; column < columns; column++) {
      let best = 0,
        minimum = Infinity;
      for (
        let x = Math.round((column * image.width) / columns) - 28;
        x <= Math.round((column * image.width) / columns) + 28;
        x++
      ) {
        let count = 0;
        for (let y = 0; y < image.height; y++)
          if (data.data[(y * image.width + x) * 4 + 3] >= 180) count++;
        if (count < minimum) {
          minimum = count;
          best = x;
        }
      }
      cuts.push(best);
    }
  const labels = new Int32Array(image.width * image.height),
    parts = [];
  for (let pixel = 0; pixel < labels.length; pixel++) {
    if (labels[pixel] || data.data[pixel * 4 + 3] < 180) continue;
    const id = parts.length + 1,
      queue = [pixel];
    labels[pixel] = id;
    let left = image.width,
      top = image.height,
      right = 0,
      bottom = 0;
    for (let at = 0; at < queue.length; at++) {
      const point = queue[at],
        x = point % image.width,
        y = Math.floor(point / image.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      for (const neighbor of [
        x > 0 ? point - 1 : -1,
        x + 1 < image.width ? point + 1 : -1,
        point - image.width,
        point + image.width,
      ]) {
        if (
          neighbor < 0 ||
          neighbor >= labels.length ||
          labels[neighbor] ||
          data.data[neighbor * 4 + 3] < 180
        )
          continue;
        const neighborX = neighbor % image.width;
        if (cuts.some((cut) => (x < cut && neighborX >= cut) || (neighborX < cut && x >= cut)))
          continue;
        labels[neighbor] = id;
        queue.push(neighbor);
      }
    }
    parts.push({ id, left, top, right, bottom, pixels: queue.length, cy: (top + bottom) / 2 });
  }
  const minimum = ((image.width * image.height) / (columns * rows)) * 0.16;
  const dogs = parts.filter((part) => part.pixels > minimum).sort((a, b) => a.cy - b.cy);
  if (dogs.length !== columns * rows)
    throw new Error('Expected ' + columns * rows + ' complete characters, found ' + dogs.length);
  const ordered = Array.from({ length: rows }, (_, row) =>
    dogs.slice(row * columns, row * columns + columns).sort((a, b) => a.left - b.left),
  ).flat();
  return ordered.map((dog) => {
    const unit = 8 / columns;
    const props = parts.filter(
      (part) =>
        part.pixels > 45 &&
        part.pixels < minimum &&
        part.left >= dog.right - 45 * unit &&
        part.left < dog.right + 38 * unit &&
        Math.abs(part.bottom - dog.bottom) < 20 * unit,
    );
    const keep = new Set([dog.id, ...props.map((part) => part.id)]);
    const box = {
      left: dog.left - 2,
      top: dog.top - 2,
      right: Math.max(dog.right, ...props.map((p) => p.right)) + 2,
      bottom: Math.max(dog.bottom, ...props.map((p) => p.bottom)) + 2,
    };
    const cel = createCanvas(box.right - box.left + 1, box.bottom - box.top + 1),
      context = cel.getContext('2d'),
      result = context.createImageData(cel.width, cel.height),
      bodyPixels = context.createImageData(cel.width, cel.height);
    for (let y = 0; y < cel.height; y++)
      for (let x = 0; x < cel.width; x++) {
        const sx = box.left + x,
          sy = box.top + y;
        if (sx < 0 || sy < 0 || sx >= image.width || sy >= image.height) continue;
        const source = sy * image.width + sx;
        let included = keep.has(labels[source]);
        if (!included && data.data[source * 4 + 3] > 0) {
          for (let dy = -1; dy <= 1 && !included; dy++)
            for (let dx = -1; dx <= 1; dx++)
              included ||= keep.has(labels[(sy + dy) * image.width + sx + dx]);
        }
        if (included) {
          result.data.set(data.data.subarray(source * 4, source * 4 + 4), (y * cel.width + x) * 4);
          let body = labels[source] === dog.id;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const label = labels[(sy + dy) * image.width + sx + dx];
            body ||= label === dog.id;
          }
          const rgba = data.data.subarray(source * 4, source * 4 + 4), at = (y * cel.width + x) * 4;
          if (body) bodyPixels.data.set(rgba, at);
        }
      }
    context.putImageData(result, 0, 0);
    const body = createCanvas(cel.width, cel.height), prop = createCanvas(cel.width, cel.height);
    body.getContext('2d').putImageData(bodyPixels, 0, 0);
    const propBox = props.length ? {
      x: Math.min(...props.map(p => p.left)) - box.left - 1,
      y: Math.min(...props.map(p => p.top)) - box.top - 1,
      width: Math.max(...props.map(p => p.right)) - Math.min(...props.map(p => p.left)) + 3,
      height: Math.max(...props.map(p => p.bottom)) - Math.min(...props.map(p => p.top)) + 3,
    } : null;
    if (propBox) prop.getContext('2d').drawImage(image,
      propBox.x + box.left, propBox.y + box.top, propBox.width, propBox.height,
      propBox.x, propBox.y, propBox.width, propBox.height);
    return { canvas: cel, body, prop, propBox, dog, box, props: props.map((p) => p.id) };
  });
}

