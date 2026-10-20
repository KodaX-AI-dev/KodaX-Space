import { smooth } from './state-cels.mjs';

const neutral = { eye: 'open', tail: 0, tilt: 0, headY: 0, near: 0, far: 0, paw: 0, mouth: 0 };
const pose = (changes = {}) => ({ ...neutral, ...changes });
const blink = (step, start, otherwise) =>
  ['half', 'closed', 'closed', 'half', 'half', otherwise, otherwise][step - start] ?? otherwise;

function gazeIntro(state, amount) {
  return Array.from({ length: 16 }, (_, step) => {
    if (!step) return pose();
    const progress = smooth(step / 15);
    const eye = step < 2 ? 'open' : step < 7 ? blink(step, 2, state) : state;
    return pose(
      state === 'thinking'
        ? { eye, tilt: -0.12 * progress }
        : { eye, headY: amount * progress, tilt: 0.045 * progress },
    );
  });
}

function thinking() {
  const intro = gazeIntro('thinking');
  const loop = Array.from({ length: 72 }, (_, step) => {
    const amount = step < 48 ? Math.sin((Math.PI * step) / 48) ** 2 : 0;
    return pose({ eye: blink(step, 55, 'thinking'), tilt: -0.12 - 0.035 * amount });
  });
  return timeline(
    [...intro, ...loop],
    intro.length,
    loop.map((p, i) => (p.eye === 'thinking' && p.tilt === -0.12 ? i : -1)).filter((i) => i >= 0),
  );
}

function working() {
  const intro = gazeIntro('working', 7.5);
  const loop = Array.from({ length: 48 }, (_, step) => {
    const local = step % 24;
    const tap = local < 16 ? Math.sin((Math.PI * local) / 16) ** 2 : 0;
    return pose({
      eye: blink(step, 40, 'working'),
      tilt: 0.045,
      headY: 7.5 + 1.2 * tap,
      near: step < 24 ? 3.2 * tap : 0,
      far: step >= 24 ? 2.6 * tap : 0,
    });
  });
  return timeline(
    [...intro, ...loop],
    intro.length,
    loop.map((p, i) => (p.eye === 'working' && !p.near && !p.far ? i : -1)).filter((i) => i >= 0),
  );
}

function waiting() {
  const intro = [0, 0, 0, 0, 1, 2, 3, 4, 6, 5, 7, 8, 15, 15, 15, 15].map((paw) => pose({ paw }));
  const loop = Array.from({ length: 72 }, (_, step) =>
    pose({ paw: 15, eye: blink(step, 34, 'open') }),
  );
  return timeline(
    [...intro, ...loop],
    intro.length,
    loop.map((p, i) => (p.eye === 'open' ? i : -1)).filter((i) => i >= 0),
  );
}

function complete() {
  const poses = Array.from({ length: 84 }, (_, step) => {
    const t = step / 24;
    const wag = (t - 0.3) / 2;
    const nod = Math.max(0, Math.min(1, (t - 0.15) / 1.15));
    const mouth = t < 0.167 || t >= 2.5 ? 0 : t < 0.292 || t > 2.292 ? 1 : 2;
    return pose({
      mouth,
      eye: blink(step, 14, blink(step, 39, 'open')),
      tail:
        wag > 0 && wag < 1 ? 1.25 * Math.sin(wag * 6 * Math.PI) * Math.sin(wag * Math.PI) ** 2 : 0,
      tilt: nod > 0 && nod < 1 ? 0.07 * Math.sin(nod * 2 * Math.PI) * Math.sin(nod * Math.PI) : 0,
      headY: nod > 0 && nod < 1 ? 2.6 * Math.sin(nod * Math.PI) ** 2 : 0,
    });
  });
  const anchors = poses
    .map((p, i) => (JSON.stringify(p) === JSON.stringify(neutral) ? i : -1))
    .filter((i) => i >= 0);
  const exits = poses.map((_, step) => route(step, anchors, poses.length));
  return { poses, exits, neutral, once: true, loopStart: 0, reducedStep: 26 };
}

function route(step, anchors, length) {
  let target = anchors[0],
    distance = Infinity;
  for (const anchor of anchors)
    if (Math.abs(anchor - step) < distance) {
      target = anchor;
      distance = Math.abs(anchor - step);
    }
  const direction = Math.sign(target - step),
    result = [step];
  for (let i = step; i !== target; ) {
    i += direction * Math.min(2, Math.abs(target - i));
    result.push(Math.min(length - 1, i));
  }
  return result;
}

function timeline(poses, loopStart, anchors) {
  const backToNeutral = Array.from({ length: loopStart }, (_, i) => loopStart - 1 - i);
  const exits = poses.map((_, step) =>
    step < loopStart
      ? Array.from({ length: step + 1 }, (_, i) => step - i)
      : [
          ...route(step - loopStart, anchors, poses.length - loopStart).map((i) => i + loopStart),
          ...backToNeutral,
        ],
  );
  return { poses, exits, neutral, loopStart, once: false, reducedStep: loopStart };
}

export function stateTimelines() {
  return { thinking: thinking(), working: working(), waiting: waiting(), complete: complete() };
}
