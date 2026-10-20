// Preview-only continuous soft rig. Original transparent artwork stays unchanged.
const TAU = Math.PI * 2;
const STAGE = 256;
const GROUND = 236;
const COLS = 18;
const ROWS = 22;

const POSES = {
  idle: {
    box: [74, 44, 385, 425],
    height: 194,
    neck: [0.57, 0.49],
    head: [0.62, 0.27],
    tail: [0.23, 0.77],
    ears: [
      [0.34, 0.27],
      [0.92, 0.24],
    ],
    eyes: [
      [0.58, 0.26],
      [0.79, 0.23],
    ],
  },
  thinking: {
    box: [902, 59, 1186, 422],
    height: 194,
    neck: [0.59, 0.49],
    head: [0.65, 0.27],
    tail: [0.22, 0.77],
    ears: [
      [0.31, 0.29],
      [0.93, 0.22],
    ],
    eyes: [
      [0.61, 0.28],
      [0.83, 0.2],
    ],
  },
  working: {
    box: [35, 507, 441, 797],
    height: 148,
    neck: [0.69, 0.5],
    head: [0.78, 0.28],
    tail: [0.25, 0.43],
    ears: [
      [0.56, 0.32],
      [0.96, 0.25],
    ],
    eyes: [
      [0.77, 0.3],
      [0.91, 0.25],
    ],
  },
  waiting: {
    box: [507, 444, 803, 815],
    height: 194,
    neck: [0.58, 0.48],
    head: [0.64, 0.25],
    tail: [0.22, 0.77],
    ears: [
      [0.32, 0.25],
      [0.92, 0.24],
    ],
    eyes: [
      [0.61, 0.25],
      [0.83, 0.22],
    ],
    paw: [0.89, 0.62],
  },
  complete: {
    box: [75, 829, 377, 1211],
    height: 194,
    neck: [0.58, 0.48],
    head: [0.65, 0.25],
    tail: [0.22, 0.77],
    ears: [
      [0.3, 0.27],
      [0.92, 0.24],
    ],
    eyes: [
      [0.59, 0.25],
      [0.8, 0.22],
    ],
  },
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};
const bell = (x, y, cx, cy, rx, ry) => Math.exp(-(((x - cx) / rx) ** 2) - ((y - cy) / ry) ** 2);
const loop = (time, period) => ((time % period) + period) % period;

function pulse(time, start, duration) {
  const t = (time - start) / duration;
  return t > 0 && t < 1 ? Math.sin(Math.PI * t) ** 2 : 0;
}

function bindPoint(pose, u, v) {
  const height = pose.height;
  const width = (height * (pose.box[2] - pose.box[0])) / (pose.box[3] - pose.box[1]);
  return [128 - width / 2 + width * u, GROUND - height + height * v];
}

function rotationOffset(u, v, pivot, angle) {
  const x = u - pivot[0];
  const y = v - pivot[1];
  return [
    x * (Math.cos(angle) - 1) - y * Math.sin(angle),
    x * Math.sin(angle) + y * (Math.cos(angle) - 1),
  ];
}

function motionAt(state, time, globalTime, reduced) {
  if (reduced) return { breath: 0, head: 0, tail: 0, ear: 0, blink: 0, lift: 0, paw: 0 };
  const breath = Math.sin((TAU * time) / 3.8) * 0.004;
  const blink = pulse(loop(globalTime, 6.7), 4.8, 0.2);
  if (state === 'thinking')
    return {
      breath,
      head: 0.032 * Math.sin((TAU * time) / 5.4),
      tail: 0.035 * Math.sin((TAU * time) / 5.4),
      ear: 0.024 * Math.sin((TAU * time) / 5.4 - 0.65),
      blink,
      lift: 0,
      paw: 0,
    };
  if (state === 'working')
    return {
      breath: breath * 0.8,
      head: 0.019 * Math.sin((TAU * time) / 2.9),
      tail: 0.065 * Math.sin((TAU * time) / 1.5) * pulse(loop(time, 5.5), 0, 1.9),
      ear: 0.02 * Math.sin((TAU * time) / 2.9 - 0.7),
      blink,
      lift: 0,
      paw: 0,
    };
  if (state === 'waiting')
    return {
      breath: breath * 0.55,
      head: 0.012 * Math.sin((TAU * time) / 5.8),
      tail: 0.035 * Math.sin((TAU * time) / 2.2) * Math.exp(-time * 1.2),
      ear: 0.018 * Math.exp(-time * 1.4),
      blink,
      lift: 0,
      paw: 0.012 * Math.sin((TAU * time) / 1.2) * Math.exp(-time * 2),
    };
  if (state === 'complete') {
    const envelope = time < 1.8 ? Math.sin(Math.PI * clamp(time / 1.8)) ** 2 : 0;
    return {
      breath: breath * 0.7,
      head: -0.035 * envelope,
      tail: 0.17 * Math.sin(TAU * time * 2.7) * envelope,
      ear: 0.045 * Math.sin(TAU * time * 2.7 - 0.5) * envelope,
      blink,
      lift: 0.018 * envelope,
      paw: 0,
    };
  }
  return {
    breath,
    head: 0.009 * Math.sin((TAU * time) / 6.4),
    tail: 0.07 * Math.sin((TAU * time) / 1.5) * pulse(loop(time, 8), 5.7, 1.8),
    ear: 0.009 * Math.sin((TAU * time) / 6.4 - 0.5),
    blink,
    lift: 0,
    paw: 0,
  };
}

function deformPoint(pose, u, v, motion) {
  const grounded = 1 - smooth((v - 0.83) / 0.14);
  const headWeight = (1 - smooth((v - 0.38) / 0.19)) * smooth((u - 0.15) / 0.25);
  const head = rotationOffset(u, v, pose.neck, motion.head);
  let x = u + head[0] * headWeight;
  let y = v + head[1] * headWeight;
  y -= (motion.breath + motion.lift) * grounded * bell(u, v, 0.58, 0.59, 0.8, 0.7);
  const tailWeight =
    (1 - smooth((u - 0.12) / 0.2)) *
    smooth((v - 0.08) / 0.1) *
    (1 - smooth((v - pose.tail[1]) / 0.1));
  const tail = rotationOffset(u, v, pose.tail, motion.tail);
  x += tail[0] * tailWeight;
  y += tail[1] * tailWeight;
  pose.ears.forEach(([ex, ey], index) => {
    const ear = rotationOffset(u, v, [ex, ey - 0.12], motion.ear * (index === 0 ? 1 : -0.65));
    const weight = bell(u, v, ex, ey, 0.115, 0.17);
    x += ear[0] * weight;
    y += ear[1] * weight;
  });
  for (const [ex, ey] of pose.eyes)
    y += (ey - v) * motion.blink * 0.88 * bell(u, v, ex, ey, 0.066, 0.058);
  if (pose.paw) y -= motion.paw * bell(u, v, ...pose.paw, 0.12, 0.15);
  return bindPoint(pose, x, y);
}

function triangle(ctx, texture, source, destination) {
  const [a, b, c] = source;
  const [p, q, r] = destination;
  const den = a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]);
  const affine = (axis) => [
    (p[axis] * (b[1] - c[1]) + q[axis] * (c[1] - a[1]) + r[axis] * (a[1] - b[1])) / den,
    (p[axis] * (c[0] - b[0]) + q[axis] * (a[0] - c[0]) + r[axis] * (b[0] - a[0])) / den,
    (p[axis] * (b[0] * c[1] - c[0] * b[1]) +
      q[axis] * (c[0] * a[1] - a[0] * c[1]) +
      r[axis] * (a[0] * b[1] - b[0] * a[1])) /
      den,
  ];
  const ax = affine(0);
  const ay = affine(1);
  const center = [(p[0] + q[0] + r[0]) / 3, (p[1] + q[1] + r[1]) / 3];
  ctx.save();
  ctx.beginPath();
  [p, q, r].forEach((point, index) => {
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const expand = 0.9 / Math.max(1, Math.hypot(dx, dy));
    const coords = [point[0] + dx * expand, point[1] + dy * expand];
    if (index === 0) ctx.moveTo(...coords);
    else ctx.lineTo(...coords);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(ax[0], ay[0], ax[1], ay[1], ax[2], ay[2]);
  ctx.drawImage(texture, 0, 0);
  ctx.restore();
}

function preparePose(image, pose) {
  const [left, top, right, bottom] = pose.box;
  const texture = document.createElement('canvas');
  texture.width = 180;
  texture.height = Math.round((180 * (bottom - top)) / (right - left));
  const ctx = texture.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    image,
    left - 2,
    top - 2,
    right - left + 4,
    bottom - top + 4,
    0,
    0,
    texture.width,
    texture.height,
  );
  const alpha = ctx.getImageData(0, 0, texture.width, texture.height).data;
  const cells = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++) {
      let opaque = false;
      const x0 = Math.floor((col * texture.width) / COLS);
      const y0 = Math.floor((row * texture.height) / ROWS);
      const x1 = Math.ceil(((col + 1) * texture.width) / COLS);
      const y1 = Math.ceil(((row + 1) * texture.height) / ROWS);
      for (let y = Math.max(0, y0 - 1); y <= Math.min(texture.height - 1, y1 + 1) && !opaque; y++)
        for (let x = Math.max(0, x0 - 1); x <= Math.min(texture.width - 1, x1 + 1); x++)
          if (alpha[(y * texture.width + x) * 4 + 3] > 10) {
            opaque = true;
            break;
          }
      if (opaque) cells.push([col, row]);
    }
  return { ...pose, texture, cells };
}

function drawPose(ctx, pose, state, time, globalTime, reduced) {
  const motion = motionAt(state, time, globalTime, reduced);
  const points = [];
  for (let row = 0; row <= ROWS; row++)
    for (let col = 0; col <= COLS; col++) {
      const u = col / COLS;
      const v = row / ROWS;
      points.push({
        source: [u * pose.texture.width, v * pose.texture.height],
        target: deformPoint(pose, u, v, motion),
      });
    }
  const point = (col, row) => points[row * (COLS + 1) + col];
  for (const [col, row] of pose.cells) {
    const a = point(col, row);
    const b = point(col + 1, row);
    const c = point(col + 1, row + 1);
    const d = point(col, row + 1);
    triangle(ctx, pose.texture, [a.source, b.source, c.source], [a.target, b.target, c.target]);
    triangle(ctx, pose.texture, [a.source, c.source, d.source], [a.target, c.target, d.target]);
  }
}

export class CompanionMotion {
  constructor(canvas, onTick = () => {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.buffer = document.createElement('canvas');
    this.buffer.width = this.buffer.height = STAGE;
    this.contextBuffer = this.buffer.getContext('2d');
    this.poseBuffer = document.createElement('canvas');
    this.poseBuffer.width = this.poseBuffer.height = STAGE;
    this.poseContext = this.poseBuffer.getContext('2d');
    this.canvas.width = this.canvas.height = STAGE;
    this.onTick = onTick;
    this.state = 'idle';
    this.previous = null;
    this.time = 0;
    this.globalTime = 0;
    this.transition = 1;
    this.speed = 1;
    this.paused = false;
    this.reduced = false;
    this.frames = 0;
    this.meanRenderMs = 0;
    this.dirty = true;
    this.observers = new Set();
    this.ready = this.load();
    this.lastTimestamp = performance.now();
    this.lastDraw = this.lastTimestamp;
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  async load() {
    const image = new Image();
    image.src = new URL('../assets/companion-dog-v3/key-poses.png', import.meta.url).href;
    await image.decode();
    this.poses = Object.fromEntries(
      Object.entries(POSES).map(([state, pose]) => [state, preparePose(image, pose)]),
    );
    this.dirty = true;
  }

  setState(state, instant = false) {
    if (!POSES[state]) return;
    this.previous =
      instant || this.paused || this.reduced ? null : { state: this.state, time: this.time };
    this.state = state;
    this.time = 0;
    this.transition = this.previous ? 0 : 1;
    this.dirty = true;
  }

  setPaused(paused) {
    this.paused = paused;
    this.dirty = true;
  }
  setReduced(reduced) {
    this.reduced = reduced;
    this.dirty = true;
  }
  setSpeed(speed) {
    this.speed = speed;
  }
  seek(time) {
    this.time = Math.max(0, time);
    this.globalTime = this.time;
    this.transition = 1;
    this.previous = null;
    this.dirty = true;
  }
  addObserver(canvas) {
    canvas.width = canvas.height = STAGE;
    this.observers.add(canvas);
    this.dirty = true;
  }
  removeObserver(canvas) {
    this.observers.delete(canvas);
  }

  frame(timestamp) {
    this.raf = requestAnimationFrame(this.frame);
    const elapsed = Math.min(0.1, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    if (!this.poses || document.hidden || !document.hasFocus()) return;
    if (!this.paused && !this.reduced) {
      this.time += elapsed * this.speed;
      this.globalTime += elapsed * this.speed;
      this.transition = Math.min(1, this.transition + (elapsed * this.speed) / 0.32);
      if (this.transition === 1) this.previous = null;
    }
    const moving = !this.paused && !this.reduced;
    if ((!moving && !this.dirty) || timestamp - this.lastDraw < 1000 / 30) return;
    this.lastDraw = timestamp;
    const start = performance.now();
    this.render();
    this.dirty = false;
    this.frames++;
    this.meanRenderMs = this.meanRenderMs * 0.95 + (performance.now() - start) * 0.05;
    this.onTick({
      state: this.state,
      time: this.time,
      frames: this.frames,
      renderMs: this.meanRenderMs,
      reduced: this.reduced,
      paused: this.paused,
    });
  }

  render() {
    const ctx = this.contextBuffer;
    ctx.clearRect(0, 0, STAGE, STAGE);
    ctx.globalAlpha = 1;
    if (this.previous && !this.reduced) {
      drawPose(
        this.poseContext,
        this.poses[this.previous.state],
        this.previous.state,
        this.previous.time,
        this.globalTime,
        false,
      );
      ctx.globalAlpha = 1 - smooth(this.transition);
      ctx.drawImage(this.poseBuffer, 0, 0);
      this.poseContext.clearRect(0, 0, STAGE, STAGE);
      drawPose(
        this.poseContext,
        this.poses[this.state],
        this.state,
        this.time,
        this.globalTime,
        false,
      );
      ctx.globalAlpha = smooth(this.transition);
      ctx.drawImage(this.poseBuffer, 0, 0);
      this.poseContext.clearRect(0, 0, STAGE, STAGE);
    } else {
      drawPose(ctx, this.poses[this.state], this.state, this.time, this.globalTime, this.reduced);
    }
    ctx.globalAlpha = 1;
    this.context.clearRect(0, 0, STAGE, STAGE);
    this.context.drawImage(this.buffer, 0, 0);
    for (const canvas of this.observers) {
      if (!canvas.isConnected || !canvas.getClientRects().length) continue;
      const observerContext = canvas.getContext('2d');
      observerContext.clearRect(0, 0, STAGE, STAGE);
      observerContext.drawImage(this.buffer, 0, 0);
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observers.clear();
  }
}
