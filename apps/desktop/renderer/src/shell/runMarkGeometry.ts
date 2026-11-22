// Run mark geometry: a 5×7×3 voxel block tumbles in 3D, then flattens into an LED-style pixel K
// with a glint before releasing again. Pure math, so it is testable without a canvas.

type Vec3 = readonly [number, number, number];

interface Voxel {
  readonly base: Vec3;
  readonly k: Vec3;
  /** Front-layer cell of the K itself. */
  readonly lit: boolean;
  /** Front-layer cell outside the K: a dim LED, dropped at icon sizes. */
  readonly dim: boolean;
}

export interface RunMarkDot {
  readonly x: number;
  readonly y: number;
  /** Projected depth; dots are returned back (low) to front (high). */
  readonly z: number;
  readonly r: number;
  readonly alpha: number;
}

const K_ROWS = ['X...X', 'X..X.', 'X.X..', 'XX...', 'X.X..', 'X..X.', 'X...X'];
const GRID = 0.28;
const FOCAL = 3.4;
const DOT_RADIUS = 0.058;
const DIM_ALPHA = 0.13;
/** The tumbling block is drawn slightly smaller than the K so its corners stay inside the canvas. */
const BLOCK_SCALE = 0.88;
/** A full revolution of tumbling (~4.2s) reads as motion even at 14–18px, then ~2.9s of K. */
export const RUN_MARK_PERIOD = 7.1;
/** Spin around Y, radians per second. */
export const RUN_MARK_SPIN = 1.55;

const VOXELS: readonly Voxel[] = (() => {
  const voxels: Voxel[] = [];
  for (let z = -1; z <= 1; z++)
    for (let y = -3; y <= 3; y++)
      for (let x = -2; x <= 2; x++) {
        const inK = K_ROWS[y + 3]![x + 2] === 'X';
        voxels.push({
          base: [x * GRID * BLOCK_SCALE, y * GRID * BLOCK_SCALE, z * GRID * BLOCK_SCALE],
          k: [x * GRID, y * GRID, 0],
          lit: z === 1 && inK,
          dim: z === 1 && !inK,
        });
      }
  return voxels;
})();

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 0 = tumbling block, 1 = flat K. */
export function runMarkMorph(t: number): number {
  const u = t % RUN_MARK_PERIOD;
  if (u < 4) return 0;
  if (u < 4.75) return ease((u - 4) / 0.75);
  if (u < 6.15) return 1;
  if (u < 6.9) return 1 - ease((u - 6.15) / 0.75);
  return 0;
}

/** Glint position across the held K (model x), or null outside the glint window. */
export function runMarkGlint(t: number): number | null {
  const u = t % RUN_MARK_PERIOD;
  return u >= 4.85 && u <= 5.85 ? -1.3 + (u - 4.85) * 2.6 : null;
}

/** The block's tumble at time t: spin around Y, a breathing tilt around X, a slight Z lean. */
function tumble(t: number): (p: Vec3) => Vec3 {
  const [sy, cy] = [Math.sin(t * RUN_MARK_SPIN), Math.cos(t * RUN_MARK_SPIN)];
  const tilt = 0.42 + Math.sin(t * 0.55) * 0.3;
  const [sx, cx] = [Math.sin(tilt), Math.cos(tilt)];
  const [sz, cz] = [Math.sin(0.12), Math.cos(0.12)];
  return ([x0, y0, z0]) => {
    const x1 = x0 * cy + z0 * sy;
    const z1 = -x0 * sy + z0 * cy;
    const y2 = y0 * cx - z1 * sx;
    const z2 = y0 * sx + z1 * cx;
    return [x1 * cz - y2 * sz, x1 * sz + y2 * cz, z2];
  };
}

/** Dots to draw for a `px`-sized mark at time `t` (seconds); `still` holds the K without motion. */
export function runMarkDots(px: number, t: number, still: boolean): RunMarkDot[] {
  const morph = still ? 1 : runMarkMorph(t);
  const glint = still ? null : runMarkGlint(t);
  const home = tumble(t);
  const half = px / 2;
  const small = px <= 24;
  const boost = small ? 1.45 : 1;
  const dots: RunMarkDot[] = [];
  for (const voxel of VOXELS) {
    const h = morph === 1 ? voxel.k : home(voxel.base);
    const p = h.map((v, i) => v + (voxel.k[i]! - v) * morph);
    const depth = (p[2]! + 1) / 2;
    const kAlpha = voxel.lit ? 1 : voxel.dim && !small ? DIM_ALPHA : 0;
    let alpha = (0.22 + 0.78 * depth) * (1 - morph) + kAlpha * morph;
    let size = (0.72 + 0.5 * depth) * (1 - morph) + morph;
    if (glint !== null && voxel.lit) {
      const g = Math.max(0, 1 - Math.abs(p[0]! - glint) * 2.6);
      size *= 1 + 0.45 * g;
      alpha = Math.min(1, alpha * (0.78 + 0.6 * g));
    }
    if (alpha < 0.02) continue;
    const s = FOCAL / (FOCAL - p[2]!);
    dots.push({
      x: half + p[0]! * half * 0.92 * s,
      y: half + p[1]! * half * 0.92 * s,
      z: p[2]!,
      r: Math.max(0.55, DOT_RADIUS * half * size * boost * s),
      alpha,
    });
  }
  return dots.sort((a, b) => a.z - b.z);
}

export function drawRunMark(
  ctx: CanvasRenderingContext2D,
  px: number,
  dpr: number,
  color: string,
  t: number,
  still: boolean,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.fillStyle = color;
  for (const dot of runMarkDots(px, t, still)) {
    ctx.globalAlpha = dot.alpha;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
