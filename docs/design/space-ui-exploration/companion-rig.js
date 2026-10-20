// Isolated preview: a layered character with articulated limbs, not a warped pose image.
const STAGE = 256;
const TAU = Math.PI * 2;
const PARTS = {
  head: [62, 29, 411, 355],
  brows: [488, 161, 706, 215],
  eyes: [488, 216, 706, 292],
  nearEar: [771, 48, 1013, 367],
  farEar: [1216, 64, 1392, 359],
  tail: [501, 399, 729, 707],
  frontUpper: [851, 398, 1030, 699],
  frontShin: [1207, 407, 1355, 620],
  frontPaw: [1215, 588, 1407, 700],
  hindUpper: [63, 752, 342, 1031],
  hindShin: [499, 768, 656, 951],
  hindPaw: [507, 920, 706, 1030],
  tongue: [874, 869, 995, 974],
};
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (x) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const bump = (t, start, end) =>
  t > start && t < end ? Math.sin((Math.PI * (t - start)) / (end - start)) ** 2 : 0;
const reach = (t, start, end) => ease((t - start) / (end - start));

function blinkAt(time) {
  const t = time % 5.2;
  return 1 - bump(t, 3.8, 4.04) * 0.98 - bump(t, 4.18, 4.36) * 0.65;
}

function bodyPoint(pose, u, v) {
  const x = (u - 0.5) * pose.bodyWidth;
  const y = (v - 0.5) * 94;
  return [
    pose.bodyX + x * Math.cos(pose.bodyAngle) - y * Math.sin(pose.bodyAngle),
    pose.bodyY + x * Math.sin(pose.bodyAngle) + y * Math.cos(pose.bodyAngle),
  ];
}

function basePose(stance, time) {
  const stand = stance === 'stand' ? 1 : 0;
  const breath = Math.sin((TAU * time) / 3.2);
  const pose = {
    bodyX: mix(130, 122, stand),
    bodyY: mix(183, 177, stand) - breath * 0.8,
    bodyWidth: mix(80, 59, stand),
    bodyAngle: stand * 1.06,
    stand,
    headX: 0,
    headY: 0,
    headAngle: 0,
    headWidth: 112,
    nearEar: 0,
    farEar: 0,
    tailAngle: 0,
    eyeOpen: 1,
    tongue: 0,
    foreNearX: mix(158, 179, stand),
    foreNearY: 235,
    foreFarX: mix(180, 196, stand),
    foreFarY: 232,
    hindNearX: mix(107, 96, stand),
    hindNearY: 235,
    hindFarX: mix(129, 119, stand),
    hindFarY: 232,
    shadow: 1,
  };
  const neck = bodyPoint(pose, 0.58, 0.1);
  pose.headX = neck[0] + mix(10, 14, stand);
  pose.headY = neck[1] - mix(50, 43, stand);
  return pose;
}

function idlePose(time, globalTime) {
  const p = basePose('sit', time);
  const phase = time % 6;
  const look = Math.sin((TAU * time) / 6);
  p.headAngle = look * 0.1;
  p.headX += look * 3;
  p.headY -= bump(phase, 1, 3.4) * 3;
  p.nearEar = Math.sin((TAU * time) / 6 - 0.55) * 0.09;
  p.farEar = -p.nearEar * 0.6;
  p.tailAngle = Math.sin(TAU * time * 1.25) * 0.38 * bump(phase, 0.2, 4.6);
  p.eyeOpen = blinkAt(globalTime);
  return p;
}

function thinkingPose(time, globalTime) {
  const p = basePose('sit', (time * 3.2) / 4.8);
  const phase = time % 4.8;
  const paw = reach(phase, 0.45, 1.25) * (1 - reach(phase, 3.0, 3.85));
  p.headAngle = Math.sin((TAU * time) / 4.8) * 0.21;
  p.headX += Math.sin((TAU * time) / 4.8) * 3;
  p.headY -= Math.sin((TAU * time) / 4.8) * 4;
  p.foreNearX = mix(p.foreNearX, p.headX + 20, paw);
  p.foreNearY = mix(p.foreNearY, p.headY + 45, paw);
  p.nearEar = Math.sin((TAU * time) / 4.8 - 0.7) * 0.16;
  p.farEar = Math.sin((TAU * time) / 4.8 - 0.9) * -0.09;
  p.tailAngle = Math.sin(TAU * time * 1.25) * 0.14 * bump(phase, 0.2, 4.6);
  p.eyeOpen = blinkAt(globalTime);
  return p;
}

function workingPose(time, globalTime) {
  const p = basePose('stand', time);
  const cycle = (TAU * time) / 2;
  const left = Math.max(0, Math.sin(cycle));
  const right = Math.max(0, Math.sin(cycle + Math.PI));
  p.bodyX += Math.sin(cycle) * 2;
  p.headX += Math.sin(cycle) * 4;
  p.headY += (1 - Math.cos(cycle)) * 3;
  p.headAngle = 0.1 + Math.sin(cycle) * 0.08;
  p.foreNearY -= left * 9;
  p.foreNearX += left * 5;
  p.foreFarY -= right * 7;
  p.foreFarX -= right * 4;
  p.nearEar = Math.sin(cycle - 0.7) * 0.14;
  p.farEar = Math.sin(cycle - 1) * -0.1;
  p.tailAngle = Math.sin(TAU * time * 1.7) * 0.26;
  p.eyeOpen = blinkAt(globalTime);
  return p;
}

function waitingPose(time, globalTime) {
  const p = idlePose(time, globalTime);
  const paw = reach(time, 0.1, 0.85);
  p.foreNearX = mix(p.foreNearX, 183, paw);
  p.foreNearY = mix(p.foreNearY, 183, paw);
  p.headAngle = -0.12 + Math.sin((TAU * time) / 5) * 0.05;
  p.headX += 3;
  p.nearEar = -0.1 + Math.sin((TAU * time) / 4.5) * 0.07;
  p.tailAngle = Math.sin((TAU * time) / 2.1) * 0.12;
  return p;
}

function completePose(time, globalTime) {
  if (time >= 2.4) return idlePose(time, globalTime);
  const p = idlePose(time, globalTime);
  const crouch = bump(time, 0, 0.5) * 6 + bump(time, 1.05, 1.55) * 5;
  const lift = bump(time, 0.35, 1.22) * 19;
  const flight = bump(time, 0.52, 1.13) * 21;
  const settle = 1 - reach(time, 1.8, 2.4);
  p.bodyY += crouch - lift;
  p.headY += crouch * 0.7 - lift * 1.08;
  p.headAngle -= bump(time, 0.25, 1.5) * 0.13;
  p.bodyWidth += crouch * 0.65;
  p.foreNearY -= flight + bump(time, 0.45, 1.2) * 12;
  p.foreFarY -= flight + bump(time, 0.5, 1.22) * 10;
  p.hindNearY -= flight;
  p.hindFarY -= flight;
  const ears = Math.sin(TAU * (time - 0.17) * 2.0) * 0.28 * settle;
  p.nearEar += ears;
  p.farEar -= ears * 0.7;
  p.tailAngle += Math.sin(TAU * time * 3) * 0.62 * bump(time, 0, 2.4);
  p.eyeOpen *= 1 - bump(time, 1.13, 1.38) * 0.95;
  p.tongue = bump(time, 0.2, 2.2);
  p.shadow = 1 - flight / 30;
  return p;
}

function acknowledgePose(time, globalTime) {
  const p = idlePose(time, globalTime);
  const amount = 1 - reach(time, 0.75, 1.2);
  p.headAngle += Math.sin(TAU * time * 1.8) * 0.14 * amount;
  p.headY += bump(time, 0.1, 0.5) * 5;
  p.tailAngle += Math.sin(TAU * time * 2.7) * 0.52 * amount;
  p.nearEar += Math.sin(TAU * time * 1.8 - 0.6) * 0.18 * amount;
  return p;
}

function checkingPose(time, globalTime) {
  const p = idlePose(time, globalTime);
  const phase = time % 4;
  const down = bump(phase, 0.15, 3.8);
  p.headX += down * 7;
  p.headY += down * 10;
  p.headAngle = down * 0.21;
  p.nearEar = down * 0.14;
  p.tailAngle *= 0.2;
  return p;
}

function stride(time, phase, centerX, groundY) {
  const t = (time / 0.95 + phase) % 1;
  if (t < 0.6) return [centerX + 13 - (t / 0.6) * 26, groundY];
  const swing = (t - 0.6) / 0.4;
  return [centerX - 13 + ease(swing) * 26, groundY - Math.sin(Math.PI * swing) * 14];
}

function walkingPose(time, globalTime) {
  const p = basePose('stand', (time * 3.2) / 0.95);
  const bob = Math.cos((TAU * time) / 0.475) * 2.1;
  p.bodyY += bob;
  p.headY += bob * 0.65;
  [p.foreNearX, p.foreNearY] = stride(time, 0, 179, 235);
  [p.foreFarX, p.foreFarY] = stride(time, 0.5, 196, 232);
  [p.hindNearX, p.hindNearY] = stride(time, 0.62, 96, 235);
  [p.hindFarX, p.hindFarY] = stride(time, 0.12, 119, 232);
  p.headAngle = Math.sin((TAU * time) / 0.95) * 0.04;
  p.nearEar = Math.sin((TAU * time) / 0.95 - 0.6) * 0.23;
  p.farEar = Math.sin((TAU * time) / 0.95 - 1) * -0.16;
  p.tailAngle = Math.sin((TAU * time) / 0.95) * 0.28;
  p.eyeOpen = blinkAt(globalTime);
  return p;
}

function restingPose(time) {
  const p = basePose('sit', time);
  p.bodyX = 122;
  p.bodyY = 214;
  p.bodyWidth = 53;
  p.bodyAngle = 1.25;
  p.stand = 1;
  p.headX = 174;
  p.headY = 184 - Math.sin((TAU * time) / 4.2) * 1.2;
  p.headWidth = 96;
  p.headAngle = 0.18;
  p.foreNearX = 183;
  p.foreNearY = 236;
  p.foreFarX = 197;
  p.foreFarY = 233;
  p.hindNearX = 105;
  p.hindNearY = 236;
  p.hindFarX = 125;
  p.hindFarY = 233;
  p.eyeOpen = 0.025;
  p.tailAngle = -1.05;
  return p;
}

function readingPose(time, globalTime) {
  const p = idlePose(time, globalTime);
  p.headX += Math.sin((TAU * time) / 4.8) * 8;
  p.headY += 12;
  p.headAngle = 0.13 + Math.sin((TAU * time) / 4.8) * 0.11;
  p.tailAngle *= 0.2;
  p.eyeOpen *= 0.88;
  return p;
}

function searchingPose(time, globalTime) {
  const p = workingPose(time, globalTime);
  const scan = Math.sin((TAU * time) / 2.8);
  p.headX += 8 + scan * 5;
  p.headY += 19 + Math.cos((TAU * time) / 1.4) * 3;
  p.headAngle += 0.16;
  p.nearEar += Math.sin((TAU * time) / 1.4 - 0.4) * 0.12;
  p.tailAngle *= 0.5;
  return p;
}

function blockedPose(time, globalTime) {
  const p = idlePose(time, globalTime);
  const paw = reach(time, 0.3, 0.9) * (1 - reach(time, 1.8, 2.5));
  p.foreNearX = mix(p.foreNearX, p.headX - 2, paw);
  p.foreNearY = mix(p.foreNearY, p.headY + 32 + Math.sin(TAU * time * 3) * 3, paw);
  p.headAngle = -0.15 + Math.sin((TAU * time) / 5) * 0.06;
  p.tailAngle *= 0.15;
  p.nearEar += paw * 0.14;
  return p;
}

function stretchingPose(time, globalTime) {
  const p = basePose('stand', time);
  const bow = reach(time, 0.1, 1.1) * (1 - reach(time, 2.3, 3.3));
  p.bodyAngle += bow * 0.22;
  p.bodyY += bow * 5;
  p.headY += bow * 24;
  p.headX += bow * 5;
  p.headAngle = bow * 0.18;
  p.foreNearX += bow * 15;
  p.foreFarX += bow * 12;
  p.nearEar = Math.sin((TAU * time) / 3.4 - 0.4) * 0.13 * bow;
  p.eyeOpen = blinkAt(globalTime) * (1 - bow * 0.65);
  p.tailAngle = bow * 0.35;
  return p;
}

const ACTIONS = {
  idle: idlePose,
  thinking: thinkingPose,
  working: workingPose,
  waiting: waitingPose,
  complete: completePose,
  acknowledge: acknowledgePose,
  checking: checkingPose,
  walking: walkingPose,
  resting: restingPose,
  reading: readingPose,
  searching: searchingPose,
  blocked: blockedPose,
  stretching: stretchingPose,
};

function blendPose(a, b, progress) {
  return Object.fromEntries(
    Object.entries(b).map(([key, value]) => [key, mix(a[key], value, progress)]),
  );
}

function sprite(
  ctx,
  texture,
  x,
  y,
  width,
  height,
  angle = 0,
  pivotX = 0.5,
  pivotY = 0.5,
  cropTop = 0,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const skip = texture.height * cropTop;
  ctx.drawImage(
    texture,
    0,
    skip,
    texture.width,
    texture.height - skip,
    -width * pivotX,
    -height * pivotY + height * cropTop,
    width,
    height * (1 - cropTop),
  );
  ctx.restore();
}

function inverseKnee(root, foot, upper, lower, bend) {
  const dx = foot[0] - root[0];
  const dy = foot[1] - root[1];
  const distance = Math.max(0.1, Math.hypot(dx, dy));
  const stretch = Math.max(1, distance / (upper + lower - 0.01));
  const a = upper * stretch;
  const b = lower * stretch;
  const along = clamp((a * a + distance * distance - b * b) / (2 * distance), -a, a);
  const across = Math.sqrt(Math.max(0, a * a - along * along)) * bend;
  return [
    root[0] + (dx / distance) * along + (dy / distance) * across,
    root[1] + (dy / distance) * along - (dx / distance) * across,
  ];
}

function bone(ctx, texture, root, end, width, lower = false) {
  const length = Math.hypot(end[0] - root[0], end[1] - root[1]);
  const height = length / (lower ? 0.88 : 0.8);
  const angle = Math.atan2(end[1] - root[1], end[0] - root[0]) - Math.PI / 2;
  sprite(ctx, texture, root[0], root[1], width, height, angle, 0.5, 0.1);
}

function leg(ctx, parts, pose, fore, near, section = 'all') {
  const stand = pose.stand;
  const u = fore ? mix(near ? 0.65 : 0.84, near ? 0.7 : 0.76, stand) : near ? 0.25 : 0.41;
  const v = fore ? mix(0.4, near ? 0.25 : 0.28, stand) : 0.67;
  const root = bodyPoint(pose, u, v);
  const name = `${fore ? 'fore' : 'hind'}${near ? 'Near' : 'Far'}`;
  const foot = [pose[`${name}X`], pose[`${name}Y`]];
  const ankle = [foot[0] - 3, foot[1] - 11];
  const knee = inverseKnee(
    root,
    ankle,
    fore ? 29 : mix(24, 30, stand),
    fore ? 34 : mix(25, 31, stand),
    fore ? -1 : 1,
  );
  const upper = fore ? parts.frontUpper : parts.hindUpper;
  const lower = fore ? parts.frontShin : parts.hindShin;
  if (section !== 'lower') bone(ctx, upper, root, knee, fore ? 18 : 36);
  if (section !== 'upper') {
    bone(ctx, lower, knee, ankle, fore ? 16 : 20, true);
    const angle = fore && near ? -ease((232 - foot[1] - 8) / 45) * 0.5 : 0;
    sprite(
      ctx,
      fore ? parts.frontPaw : parts.hindPaw,
      foot[0],
      foot[1],
      fore ? 25 : 27,
      15,
      angle,
      0.5,
      0.99,
    );
  }
}

function face(ctx, parts, pose) {
  const width = pose.headWidth;
  const height = (width * 326) / 349;
  ctx.save();
  ctx.translate(pose.headX, pose.headY);
  ctx.rotate(pose.headAngle);
  sprite(ctx, parts.farEar, width * 0.36, -height * 0.27, 33, 65, pose.farEar - 0.1, 0.12, 0.05);
  sprite(ctx, parts.head, 0, 0, width, height);
  sprite(ctx, parts.brows, width * 0.11, -height * 0.2, width * 0.59, width * 0.146, -0.13);
  sprite(
    ctx,
    parts.eyes,
    width * 0.12,
    -height * 0.025,
    width * 0.59,
    Math.max(0.7, width * 0.206 * pose.eyeOpen),
    -0.13,
  );
  sprite(ctx, parts.nearEar, -width * 0.3, -height * 0.28, 51, 73, pose.nearEar - 0.1, 0.94, 0.05);
  if (pose.tongue > 0.02)
    sprite(ctx, parts.tongue, width * 0.29, height * 0.34, 9, 9 * pose.tongue, -0.12, 0.5, 0);
  ctx.restore();
}

function drawDog(ctx, parts, pose, collar) {
  ctx.clearRect(0, 0, STAGE, STAGE);
  ctx.fillStyle = `rgba(70, 57, 37, ${0.13 * pose.shadow})`;
  ctx.beginPath();
  ctx.ellipse(139, 239, 66 * (1.1 - pose.shadow * 0.1), 3, 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.filter = 'brightness(0.88)';
  leg(ctx, parts, pose, false, false);
  leg(ctx, parts, pose, true, false);
  ctx.restore();
  const tailRoot = bodyPoint(pose, 0.22, 0.65);
  sprite(ctx, parts.tail, tailRoot[0], tailRoot[1], 43, 63, pose.tailAngle, 0.89, 0.9);
  leg(ctx, parts, pose, true, true, 'upper');
  sprite(ctx, parts.body, pose.bodyX, pose.bodyY, pose.bodyWidth, 94, pose.bodyAngle, 0.5, 0.5, 0);
  leg(ctx, parts, pose, false, true, pose.stand < 0.15 ? 'lower' : 'all');
  if (collar)
    sprite(
      ctx,
      collar,
      pose.headX - 1,
      pose.headY + pose.headWidth * 0.44,
      49,
      37,
      pose.headAngle * 0.3,
      0.5,
      0.33,
    );
  face(ctx, parts, pose);
  leg(ctx, parts, pose, true, true, 'lower');
}

async function imageAt(path) {
  const image = new Image();
  image.src = new URL(path, import.meta.url).href;
  await image.decode();
  return image;
}

function cropPart(image, box) {
  const canvas = document.createElement('canvas');
  canvas.width = box[2] - box[0];
  canvas.height = box[3] - box[1];
  canvas
    .getContext('2d')
    .drawImage(
      image,
      box[0],
      box[1],
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  return canvas;
}

export class CompanionMotion {
  constructor(canvas, onTick = () => {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.buffer = document.createElement('canvas');
    this.buffer.width = this.buffer.height = STAGE;
    this.contextBuffer = this.buffer.getContext('2d');
    canvas.width = canvas.height = STAGE;
    this.onTick = onTick;
    this.state = 'idle';
    this.time = 0;
    this.globalTime = 0;
    this.transitionFrom = null;
    this.transition = 1;
    this.speed = 1;
    this.paused = false;
    this.reduced = false;
    this.frames = 0;
    this.meanRenderMs = 0;
    this.dirty = true;
    this.observers = new Set();
    this.lastTimestamp = performance.now();
    this.lastDraw = this.lastTimestamp;
    this.ready = this.load();
    this.frame = this.frame.bind(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  async load() {
    const [image, torso, collar] = await Promise.all([
      imageAt('../assets/companion-dog-v4/rig-atlas.png'),
      imageAt('../assets/companion-dog-v4/torso.png'),
      imageAt('../assets/companion-dog-v4/collar.png'),
    ]);
    this.parts = Object.fromEntries(
      Object.entries(PARTS).map(([name, box]) => [name, cropPart(image, box)]),
    );
    this.parts.body = cropPart(torso, [198, 134, 1148, 1035]);
    this.collar = cropPart(collar, [140, 196, 1337, 971]);
    this.dirty = true;
  }

  pose() {
    const time = this.reduced ? (this.state === 'complete' ? 2.5 : 1) : this.time;
    const target = ACTIONS[this.state](time, this.reduced ? 0 : this.globalTime);
    return this.transitionFrom && this.transition < 1
      ? blendPose(this.transitionFrom, target, ease(this.transition))
      : target;
  }
  setState(state, instant = false) {
    if (!ACTIONS[state]) return;
    this.transitionFrom = instant || this.paused || this.reduced ? null : this.pose();
    this.state = state;
    this.time = 0;
    this.transition = this.transitionFrom ? 0 : 1;
    this.dirty = true;
  }
  setPaused(value) {
    this.paused = value;
    this.dirty = true;
  }
  setReduced(value) {
    if (this.reduced !== value) {
      this.reduced = value;
      this.dirty = true;
    }
  }
  setSpeed(value) {
    this.speed = value;
  }
  seek(time) {
    this.time = Math.max(0, time);
    this.globalTime = this.time;
    this.transitionFrom = null;
    this.transition = 1;
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
    if (!this.parts || !this.collar || document.hidden) return;
    const moving = !this.paused && !this.reduced;
    if (moving) {
      this.time += elapsed * this.speed;
      this.globalTime += elapsed * this.speed;
      this.transition = Math.min(1, this.transition + (elapsed * this.speed) / 0.48);
      if (this.transition === 1) this.transitionFrom = null;
    }
    if ((!moving && !this.dirty) || timestamp - this.lastDraw < 1000 / 60 - 0.5) return;
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
    drawDog(this.contextBuffer, this.parts, this.pose(), this.collar);
    this.context.clearRect(0, 0, STAGE, STAGE);
    this.context.drawImage(this.buffer, 0, 0);
    for (const canvas of this.observers) {
      if (!canvas.isConnected || !canvas.getClientRects().length) continue;
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, STAGE, STAGE);
      context.drawImage(this.buffer, 0, 0);
    }
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    this.observers.clear();
  }
}

// The offline preview renderer uses the exact same poses and drawing path.
export { ACTIONS, PARTS, drawDog };
