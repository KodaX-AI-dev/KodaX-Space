// Mounts only the transcript rows near the viewport (F144 ticket 4, behind
// `KODAX_SPACE_TRANSCRIPT_WINDOWING=1`). The window follows the reader by row identity: the
// first row crossing the viewport top plus the distance into it, or "the bottom" when the reader
// is within BOTTOM_SLACK_PX of the end.
//
// Where the reader is gets re-read only on a scroll (including one whose event is still pending)
// or a viewport resize. Content moving under a still reader (a caller inserting rows above before
// restoring its own anchor, a row growing) keeps the row they were reading mounted. "The bottom" holds only for the rows it was read
// against: rows arriving below a reader who has not scrolled since keep the window where it was.
//
// Spacers opt out of native scroll anchoring, so the browser keeps the row being read in place
// while spacers and newly mounted rows change height. Native anchoring is not guaranteed (Chromium
// keeps a coarse anchor it picked while only a spacer was in view, until the next scroll), so a
// window change also re-pins the row being read, or the bottom, itself; that write is a no-op
// whenever native anchoring already held it. Rows mounting at their real heights must not move a
// reader off the bottom even where the caller does not auto-follow (an inactive window). Nothing
// else here writes scrollTop.
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
  /** The rows `view` was read against; null before the first read. */
  viewRows: readonly WindowRow[] | null;
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
    viewRows: null,
  };
}

/** The reader was at the bottom of these very rows; newer rows since then do not carry them. */
const followsBottom = (state: WindowState, rows: readonly WindowRow[]): boolean =>
  state.view.scrollTop === Number.POSITIVE_INFINITY &&
  (state.viewRows === null || state.viewRows === rows);

function windowParts(
  state: WindowState,
  rows: readonly WindowRow[],
  pinned: ReadonlySet<string>,
): WindowPart[] {
  const { view } = state;
  const anchor = followsBottom(state, rows) ? undefined : view.anchor;
  return computeTranscriptWindow({
    rows,
    measured: state.measured,
    gap: state.gap,
    scrollTop: view.scrollTop,
    ...(anchor ? { anchor } : {}),
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
  const atBottom = scroller.scrollHeight - scroller.scrollTop - viewportHeight <= BOTTOM_SLACK_PX;
  const view = atBottom ? bottomView(viewportHeight) : { scrollTop: 0, viewportHeight };
  const top = scroller.getBoundingClientRect().top;
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    const id = child.dataset.windowRow ?? child.dataset.windowSpacer;
    if (id === undefined) continue;
    const rect = child.getBoundingClientRect();
    if (rect.bottom <= top) continue;
    return { ...view, anchor: { id, offset: top - rect.top } };
  }
  return view;
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

/** What a window change keeps still: the first mounted row in view, or (null) the bottom. */
interface Hold {
  readonly row: HTMLElement | null;
  readonly offset: number;
  readonly rows: readonly WindowRow[];
}

function readHold(
  scroller: HTMLElement,
  container: HTMLElement,
  state: WindowState,
  rows: readonly WindowRow[],
): Hold | null {
  if (followsBottom(state, rows)) return { row: null, offset: 0, rows };
  const box = scroller.getBoundingClientRect();
  for (const row of container.querySelectorAll<HTMLElement>(':scope > [data-window-row]')) {
    const rect = row.getBoundingClientRect();
    if (rect.bottom <= box.top) continue;
    if (rect.top >= box.bottom) return null;
    return { row, offset: rect.top - box.top, rows };
  }
  return null;
}

/**
 * Re-pins what was held after the window change it was read for. Diff-based, so it composes with
 * native anchoring applied during this commit's layout. A scroll or a rows change in between drops
 * the hold: the reader or the caller moved things, not the window.
 */
function restoreHold(hold: Hold, scroller: HTMLElement, rows: readonly WindowRow[]): void {
  if (hold.rows !== rows) return;
  if (hold.row === null) {
    if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0.5)
      scroller.scrollTop = scroller.scrollHeight;
    return;
  }
  if (!hold.row.isConnected) return;
  const drift =
    hold.row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - hold.offset;
  if (Math.abs(drift) > 0.5) scroller.scrollTop += drift;
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
  const holdRef = useRef<Hold | null>(null);
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
    let reread = true;
    let readTop = 0;
    // A pane out of layout (`display: none`) reads zero sizes: no row heights, no reader position.
    const hidden = (): boolean => scroller.clientHeight === 0;
    const update = (): void => {
      frame = null;
      const state = stateRef.current;
      const container = windowRef.current;
      if (!state || !container || hidden()) return;
      // A scrollTop write earlier in this frame has not dispatched its scroll event yet.
      if (reread || scroller.scrollTop !== readTop) {
        state.view = readView(scroller, container);
        state.viewRows = rowsRef.current;
        readTop = scroller.scrollTop;
        reread = false;
      }
      state.gap = readGap(container) ?? state.gap;
      state.inUse = rowsInUse(container, rowsRef.current);
      const previous = partsRef.current;
      if (previous && sameParts(previous, windowParts(state, rowsRef.current, pinnedRef.current)))
        return;
      holdRef.current = readHold(scroller, container, state, rowsRef.current);
      setVersion((value) => value + 1);
    };
    const schedule = (): void => {
      frame ??= requestAnimationFrame(update);
    };
    const onScroll = (): void => {
      holdRef.current = null;
      reread = true;
      schedule();
    };
    const observer = new ResizeObserver((entries) => {
      if (hidden()) return;
      const state = stateRef.current;
      const measuredChange = state !== null && recordHeights(state, entries);
      if (entries.some((entry) => entry.target === scroller)) reread = true;
      if (measuredChange || reread) schedule();
    });
    observer.observe(scroller);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return {
      scroller,
      observer,
      observed: new Set(),
      dispose: () => {
        scroller.removeEventListener('scroll', onScroll);
        observer.disconnect();
        if (frame !== null) cancelAnimationFrame(frame);
      },
    };
  }

  // Every commit: re-pin the row a window change was read for, follow the scroller element (it
  // mounts after the welcome screen), observe the rows the commit mounted and stop observing the
  // ones it unmounted.
  useLayoutEffect(() => {
    const scroller = enabled ? scrollRef.current : null;
    const hold = holdRef.current;
    holdRef.current = null;
    if (hold && scroller) restoreHold(hold, scroller, rows);
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
