import { useEffect, useRef, type JSX as ReactJSX } from 'react';
import { drawRunMark } from './runMarkGeometry.js';

// One rAF loop shared by every visible mark, so all marks move in step and an idle app runs none.
// rAF itself stops while the window is hidden; offscreen marks unregister via IntersectionObserver.
const frames = new Set<(t: number) => void>();
let handle = 0;
let lastDrawAt = 0;
/** Cap high-refresh displays near 60fps; a 60Hz display still draws every frame. */
const MIN_FRAME_MS = 15;

function tick(now: number): void {
  handle = frames.size > 0 ? requestAnimationFrame(tick) : 0;
  if (now - lastDrawAt < MIN_FRAME_MS) return;
  lastDrawAt = now;
  for (const draw of frames) draw(now / 1000);
}

function startFrames(draw: (t: number) => void): void {
  frames.add(draw);
  if (handle === 0) handle = requestAnimationFrame(tick);
}

function stopFrames(draw: (t: number) => void): void {
  frames.delete(draw);
  if (frames.size === 0 && handle !== 0) {
    cancelAnimationFrame(handle);
    handle = 0;
  }
}

/**
 * KodaX Run mark (theme warn color): a dot voxel block tumbling into a pixel K. Reduced motion and
 * the minimal visual-quality tier get the still K.
 */
export function RunMark({ size }: { readonly size: number }): ReactJSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(size * dpr);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let color = '';
    let onScreen = false;
    const draw = (t: number): void => drawRunMark(ctx, size, dpr, color, t, false);
    // Theme and quality tier are both classes on <html>; re-read them only when they change.
    const sync = (): void => {
      color = getComputedStyle(canvas).color;
      const still =
        reducedMotion.matches || document.documentElement.classList.contains('q-minimal');
      if (still || !onScreen) {
        stopFrames(draw);
        if (still) drawRunMark(ctx, size, dpr, color, 0, true);
        return;
      }
      draw(performance.now() / 1000);
      startFrames(draw);
    };
    const visibility = new IntersectionObserver((entries) => {
      onScreen = entries.at(-1)?.isIntersecting ?? onScreen;
      sync();
    });
    const htmlClass = new MutationObserver(sync);
    visibility.observe(canvas);
    htmlClass.observe(document.documentElement, { attributeFilter: ['class'] });
    reducedMotion.addEventListener('change', sync);
    sync();
    return () => {
      stopFrames(draw);
      visibility.disconnect();
      htmlClass.disconnect();
      reducedMotion.removeEventListener('change', sync);
    };
  }, [size]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      data-testid="run-mark"
      className="shrink-0 text-warn"
      style={{ width: size, height: size }}
    />
  );
}
