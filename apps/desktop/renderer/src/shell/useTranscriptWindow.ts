// Mounts only the transcript rows near the viewport (F144 ticket 4, behind
// `KODAX_SPACE_TRANSCRIPT_WINDOWING=1`). The window follows the reader by row identity: the
// first row crossing the viewport top plus the distance into it, or "the bottom" when the reader
// is within BOTTOM_SLACK_PX of the end. The hook never writes scrollTop. Spacers opt out of native
// scroll anchoring, so the browser keeps the row being read in place while spacers and newly
// mounted rows change height.
//
// Rows in use stay mounted wherever they are: the caller's pins plus focus, an open popup menu and
// every row a text selection spans, read from the DOM whenever the window is about to move.

import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { computeTranscriptWindow, type WindowPart, type WindowRow } from './transcriptWindow.js';

const BOTTOM_SLACK_PX = 32;
const NOTHING_PINNED: ReadonlySet<string> = new Set();
const OPEN_MENU_ROWS = ':scope > [data-window-row]:has([aria-haspopup][aria-expanded="true"])';

interface View {
  readonly anchor?: { readonly id: string; readonly offset: number };
  /** `Infinity` is the bottom. */
  readonly scrollTop: number;
  readonly viewportHeight: number;
}

interface WindowState {
  layoutKey: string | null;
  view: View;
  measured: Map<string, number>;
  gap: number;
  inUse: ReadonlySet<string>;
}

const bottomView = (viewportHeight: number): View => ({
  scrollTop: Number.POSITIVE_INFINITY,
  viewportHeight,
});

function freshState(layoutKey: string | null): WindowState {
  return {
    layoutKey,
    view: bottomView(window.innerHeight),
    measured: new Map(),
    gap: 0,
    inUse: NOTHING_PINNED,
  };
}

function windowParts(
  state: WindowState,
  rows: readonly WindowRow[],
  pinned: ReadonlySet<string>,
): WindowPart[] {
  const { view } = state;
  return computeTranscriptWindow({
    rows,
    measured: state.measured,
    gap: state.gap,
    scrollTop: view.scrollTop,
    ...(view.anchor ? { anchor: view.anchor } : {}),
    viewportHeight: view.viewportHeight,
    // Symmetric on purpose: a scroll-direction bias lets the browser's own anchoring correction
    // (a few px of scrollTop) flip the direction, reshape the window and oscillate.
    overscanBefore: view.viewportHeight,
    overscanAfter: view.viewportHeight,
    pinned: state.inUse.size === 0 ? pinned : new Set([...pinned, ...state.inUse]),
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
function readView(scroller: HTMLElement, container: HTMLElement): View {
  const viewportHeight = scroller.clientHeight;
  if (scroller.scrollHeight - scroller.scrollTop - viewportHeight <= BOTTOM_SLACK_PX)
    return bottomView(viewportHeight);
  const top = scroller.getBoundingClientRect().top;
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    const id = child.dataset.windowRow ?? child.dataset.windowSpacer;
    if (id === undefined) continue;
    const rect = child.getBoundingClientRect();
    if (rect.bottom <= top) continue;
    return { anchor: { id, offset: top - rect.top }, scrollTop: 0, viewportHeight };
  }
  return { scrollTop: 0, viewportHeight };
}

/** Rows the reader is using in the DOM: focus, an open popup menu, and a text selection's span. */
function rowsInUse(container: HTMLElement, rows: readonly WindowRow[]): ReadonlySet<string> {
  const rowOf = (node: Node | null | undefined): string | undefined => {
    const element = node instanceof Element ? node : node?.parentElement;
    const row = element?.closest<HTMLElement>('[data-window-row]');
    return row?.parentElement === container ? row.dataset.windowRow : undefined;
  };
  const ids = [rowOf(document.activeElement)];
  for (const row of container.querySelectorAll<HTMLElement>(OPEN_MENU_ROWS))
    ids.push(row.dataset.windowRow);
  const selection = document.getSelection();
  if (selection && !selection.isCollapsed) {
    const ends = [rowOf(selection.anchorNode), rowOf(selection.focusNode)]
      .map((id) => rows.findIndex((row) => row.id === id))
      .filter((index) => index >= 0);
    if (ends.length > 0)
      for (let index = Math.min(...ends); index <= Math.max(...ends); index += 1)
        ids.push(rows[index].id);
  }
  const inUse = ids.filter((id): id is string => id !== undefined);
  return inUse.length === 0 ? NOTHING_PINNED : new Set(inUse);
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
  pinned,
}: {
  readonly enabled: boolean;
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly windowRef: RefObject<HTMLElement | null>;
  readonly rows: readonly WindowRow[];
  readonly layoutKey: string | null;
  /** Rows the caller needs mounted, such as the streaming row or a search jump target. */
  readonly pinned: ReadonlySet<string>;
}): readonly WindowPart[] | null {
  const stateRef = useRef<WindowState | null>(null);
  const rowsRef = useRef(rows);
  const pinnedRef = useRef(pinned);
  const partsRef = useRef<readonly WindowPart[] | null>(null);
  const bindingRef = useRef<Binding | null>(null);
  const [version, setVersion] = useState(0);
  rowsRef.current = rows;
  pinnedRef.current = pinned;

  const parts = useMemo(() => {
    if (!enabled) return null;
    if (stateRef.current?.layoutKey !== layoutKey) stateRef.current = freshState(layoutKey);
    return windowParts(stateRef.current, rows, pinned);
    // `version` re-reads the view, measurements and rows in use kept in stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rows, layoutKey, pinned, version]);
  partsRef.current = parts;

  function bind(scroller: HTMLElement): Binding {
    let frame: number | null = null;
    const update = (): void => {
      frame = null;
      const state = stateRef.current;
      const container = windowRef.current;
      if (!state || !container) return;
      state.view = readView(scroller, container);
      state.gap = readGap(container) ?? state.gap;
      state.inUse = rowsInUse(container, rowsRef.current);
      const previous = partsRef.current;
      if (!previous || !sameParts(previous, windowParts(state, rowsRef.current, pinnedRef.current)))
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
