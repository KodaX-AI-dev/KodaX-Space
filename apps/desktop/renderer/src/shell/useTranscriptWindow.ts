// Mounts only the transcript rows near the viewport (F144 ticket 4, behind
// `KODAX_SPACE_TRANSCRIPT_WINDOWING=1`). The window follows the reader by row identity: the
// first row crossing the viewport top plus the distance into it, or "the bottom" when the reader
// is within BOTTOM_SLACK_PX of the end. The hook never writes scrollTop. Spacers opt out of native
// scroll anchoring, so the browser keeps the row being read in place while spacers and newly
// mounted rows change height.

import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { computeTranscriptWindow, type WindowPart, type WindowRow } from './transcriptWindow.js';

const BOTTOM_SLACK_PX = 32;
const NOTHING_PINNED: ReadonlySet<string> = new Set();

interface View {
  readonly anchor?: { readonly id: string; readonly offset: number };
  /** `Infinity` is the bottom. */
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly direction: 'up' | 'down' | null;
}

interface WindowState {
  layoutKey: string | null;
  view: View;
  measured: Map<string, number>;
  gap: number;
  lastScrollTop: number;
}

const bottomView = (viewportHeight: number): View => ({
  scrollTop: Number.POSITIVE_INFINITY,
  viewportHeight,
  direction: null,
});

function freshState(layoutKey: string | null): WindowState {
  return {
    layoutKey,
    view: bottomView(window.innerHeight),
    measured: new Map(),
    gap: 0,
    lastScrollTop: 0,
  };
}

function windowParts(state: WindowState, rows: readonly WindowRow[]): WindowPart[] {
  const { view } = state;
  return computeTranscriptWindow({
    rows,
    measured: state.measured,
    gap: state.gap,
    scrollTop: view.scrollTop,
    ...(view.anchor ? { anchor: view.anchor } : {}),
    viewportHeight: view.viewportHeight,
    overscanBefore: view.viewportHeight * (view.direction === 'up' ? 2 : 1),
    overscanAfter: view.viewportHeight * (view.direction === 'down' ? 2 : 1),
    pinned: NOTHING_PINNED,
  });
}

function sameParts(left: readonly WindowPart[], right: readonly WindowPart[]): boolean {
  return (
    left.length === right.length &&
    left.every((part, index) => {
      const other = right[index];
      if (part.kind !== other.kind || part.start !== other.start || part.end !== other.end)
        return false;
      return part.kind === 'spacer' && other.kind === 'spacer'
        ? Math.abs(part.height - other.height) < 1
        : true;
    })
  );
}

/** Where the reader is, read from the mounted rows and spacers. */
function readView(
  scroller: HTMLElement,
  container: HTMLElement,
  direction: View['direction'],
): View {
  const viewportHeight = scroller.clientHeight;
  if (scroller.scrollHeight - scroller.scrollTop - viewportHeight <= BOTTOM_SLACK_PX)
    // No direction bias at the bottom: auto-follow's own scrolls must not reshape the window.
    return bottomView(viewportHeight);
  const top = scroller.getBoundingClientRect().top;
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    const id = child.dataset.windowRow ?? child.dataset.windowSpacer;
    if (id === undefined) continue;
    const rect = child.getBoundingClientRect();
    if (rect.bottom <= top) continue;
    return { anchor: { id, offset: top - rect.top }, scrollTop: 0, viewportHeight, direction };
  }
  return { scrollTop: 0, viewportHeight, direction };
}

/** Records changed row heights; true when any changed. */
function recordHeights(state: WindowState, entries: readonly ResizeObserverEntry[]): boolean {
  let changed = false;
  for (const entry of entries) {
    const target = entry.target as HTMLElement;
    const id = target.dataset.windowRow;
    if (id === undefined || !target.isConnected) continue;
    const height = entry.borderBoxSize[0]?.blockSize ?? target.offsetHeight;
    if (Math.abs((state.measured.get(id) ?? -1) - height) <= 0.5) continue;
    state.measured.set(id, height);
    changed = true;
  }
  return changed;
}

interface Binding {
  readonly scroller: HTMLElement;
  readonly observer: ResizeObserver;
  readonly observed: Set<Element>;
  readonly dispose: () => void;
}

function observeRows(binding: Binding, container: HTMLElement): void {
  for (const row of binding.observed) {
    if (row.isConnected) continue;
    binding.observer.unobserve(row);
    binding.observed.delete(row);
  }
  for (const row of container.querySelectorAll(':scope > [data-window-row]')) {
    if (binding.observed.has(row)) continue;
    binding.observer.observe(row);
    binding.observed.add(row);
  }
}

/** The container gap is the margin above any row that follows a sibling. */
function readGap(container: HTMLElement): number | null {
  const row = container.querySelector<HTMLElement>(':scope > * + [data-window-row]');
  return row ? Number.parseFloat(getComputedStyle(row).marginTop) || 0 : null;
}

export function useTranscriptWindow({
  enabled,
  scrollRef,
  windowRef,
  rows,
  layoutKey,
}: {
  readonly enabled: boolean;
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly windowRef: RefObject<HTMLElement | null>;
  readonly rows: readonly WindowRow[];
  readonly layoutKey: string | null;
}): readonly WindowPart[] | null {
  const stateRef = useRef<WindowState | null>(null);
  const rowsRef = useRef(rows);
  const partsRef = useRef<readonly WindowPart[] | null>(null);
  const bindingRef = useRef<Binding | null>(null);
  const [version, setVersion] = useState(0);
  rowsRef.current = rows;

  const parts = useMemo(() => {
    if (!enabled) return null;
    if (stateRef.current?.layoutKey !== layoutKey) stateRef.current = freshState(layoutKey);
    return windowParts(stateRef.current, rows);
    // `version` re-reads the view and measurements kept in stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rows, layoutKey, version]);
  partsRef.current = parts;

  function bind(scroller: HTMLElement): Binding {
    let frame: number | null = null;
    const update = (): void => {
      frame = null;
      const state = stateRef.current;
      const container = windowRef.current;
      if (!state || !container) return;
      const scrollTop = scroller.scrollTop;
      const direction =
        scrollTop === state.lastScrollTop
          ? state.view.direction
          : scrollTop < state.lastScrollTop
            ? 'up'
            : 'down';
      state.lastScrollTop = scrollTop;
      state.view = readView(scroller, container, direction);
      state.gap = readGap(container) ?? state.gap;
      const previous = partsRef.current;
      if (!previous || !sameParts(previous, windowParts(state, rowsRef.current)))
        setVersion((value) => value + 1);
    };
    const schedule = (): void => {
      frame ??= requestAnimationFrame(update);
    };
    const observer = new ResizeObserver((entries) => {
      const state = stateRef.current;
      const measuredChange = state !== null && recordHeights(state, entries);
      if (measuredChange || entries.some((entry) => entry.target === scroller)) schedule();
    });
    observer.observe(scroller);
    scroller.addEventListener('scroll', schedule, { passive: true });
    return {
      scroller,
      observer,
      observed: new Set(),
      dispose: () => {
        scroller.removeEventListener('scroll', schedule);
        observer.disconnect();
        if (frame !== null) cancelAnimationFrame(frame);
      },
    };
  }

  // Every commit: follow the scroller element (it mounts after the welcome screen), observe the
  // rows the commit mounted and stop observing the ones it unmounted.
  useLayoutEffect(() => {
    const scroller = enabled ? scrollRef.current : null;
    if (bindingRef.current?.scroller !== scroller) {
      bindingRef.current?.dispose();
      bindingRef.current = scroller ? bind(scroller) : null;
    }
    const container = windowRef.current;
    if (bindingRef.current && container) observeRows(bindingRef.current, container);
  });

  useLayoutEffect(
    () => () => {
      bindingRef.current?.dispose();
      bindingRef.current = null;
    },
    [],
  );

  return parts;
}
