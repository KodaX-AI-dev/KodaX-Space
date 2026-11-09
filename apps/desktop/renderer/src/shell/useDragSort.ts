// 纵向列表的指针拖排:拖动项跟随指针,其它项实时让位预览落点,松手后滑入目标位再提交。
// 不用 HTML5 DnD —— 原生拖拽只有半透明快照 + 目标描边,无法表达"放下后会在哪"。
//
// 性能:拖动项的位移直接写 DOM style (每帧不触发 React 渲染);只有预览落点变化时才 setState。

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { insertIndexFor, settleOffset, siblingShift, type SortSlot } from './sortPreview.js';

const DRAG_THRESHOLD_PX = 4;
const MOTION_MS = 160;
const EDGE_SCROLL_PX = 32;
const EDGE_SCROLL_MAX_STEP = 14;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

interface Gesture {
  readonly srcIndex: number;
  readonly startY: number;
  readonly startScroll: number;
  readonly scroller: HTMLElement | null;
  slots: readonly SortSlot[] | null; // null = 尚未越过阈值,还只是一次点击
  clientY: number;
  toIndex: number;
  scrollRaf: number;
}

interface Preview {
  readonly srcIndex: number;
  readonly toIndex: number;
  readonly srcPitch: number;
  /** 松手后的落位位移;null = 仍在拖动 */
  readonly settleY: number | null;
}

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

function snapshotSlots(els: readonly (HTMLElement | null)[], scrollTop: number): SortSlot[] {
  return els.map((el, i) => {
    if (!el) return { top: 0, pitch: 0 };
    const rect = el.getBoundingClientRect();
    const next = els[i + 1];
    const pitch = next
      ? next.getBoundingClientRect().top - rect.top
      : rect.height + parseFloat(getComputedStyle(el).marginBottom || '0');
    return { top: rect.top + scrollTop, pitch };
  });
}

function edgeScrollStep(scroller: HTMLElement, clientY: number): number {
  const rect = scroller.getBoundingClientRect();
  const depth = (edge: number): number =>
    Math.min(1, Math.max(0, (EDGE_SCROLL_PX - edge) / EDGE_SCROLL_PX));
  return Math.round(
    (depth(rect.bottom - clientY) - depth(clientY - rect.top)) * EDGE_SCROLL_MAX_STEP,
  );
}

export interface DragSort {
  readonly draggingIndex: number | null;
  readonly itemRef: (index: number) => (el: HTMLElement | null) => void;
  readonly itemStyle: (index: number) => CSSProperties | undefined;
  readonly onHandlePointerDown: (index: number, e: PointerEvent<HTMLElement>) => void;
  /** 挂在列表容器的 onClickCapture 上:吞掉拖动结束后浏览器补发的 click。 */
  readonly onClickCapture: (e: { stopPropagation(): void; preventDefault(): void }) => void;
}

export function useDragSort(count: number, onMove: (from: number, to: number) => void): DragSort {
  const els = useRef<(HTMLElement | null)[]>([]);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const settleTimer = useRef<number | null>(null);
  const detach = useRef<() => void>(() => undefined);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const countRef = useRef(count);
  countRef.current = count;
  const [preview, setPreview] = useState<Preview | null>(null);

  const follow = useCallback((g: Gesture): void => {
    if (!g.slots) return;
    const scroll = g.scroller?.scrollTop ?? 0;
    const offset = g.clientY + scroll - (g.startY + g.startScroll);
    const el = els.current[g.srcIndex];
    if (el) el.style.transform = `translateY(${offset}px)`;
    const toIndex = insertIndexFor(g.slots, g.srcIndex, g.clientY + scroll);
    if (toIndex === g.toIndex) return;
    g.toIndex = toIndex;
    setPreview((p) => (p ? { ...p, toIndex } : p));
  }, []);

  const finish = useCallback((commit: boolean): void => {
    const g = gesture.current;
    gesture.current = null;
    detach.current();
    if (!g?.slots) return;
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 0);
    const toIndex = commit ? g.toIndex : g.srcIndex;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setPreview((p) =>
      p ? { ...p, toIndex, settleY: settleOffset(g.slots ?? [], g.srcIndex, toIndex) } : p,
    );
    settleTimer.current = window.setTimeout(
      () => {
        settleTimer.current = null;
        setPreview(null);
        if (toIndex !== g.srcIndex) onMoveRef.current(g.srcIndex, toIndex);
      },
      reduceMotion ? 0 : MOTION_MS,
    );
  }, []);

  const onHandlePointerDown = useCallback(
    (index: number, e: PointerEvent<HTMLElement>): void => {
      if (e.button !== 0 || gesture.current || settleTimer.current !== null) return;
      const el = els.current[index];
      if (!el) return;
      const scroller = scrollParentOf(el);
      const g: Gesture = {
        srcIndex: index,
        startY: e.clientY,
        startScroll: scroller?.scrollTop ?? 0,
        scroller,
        slots: null,
        clientY: e.clientY,
        toIndex: index,
        scrollRaf: 0,
      };
      gesture.current = g;

      const autoScroll = (): void => {
        g.scrollRaf = 0;
        if (!g.scroller || !g.slots) return;
        const step = edgeScrollStep(g.scroller, g.clientY);
        if (step === 0) return;
        g.scroller.scrollTop += step;
        follow(g);
        g.scrollRaf = requestAnimationFrame(autoScroll);
      };
      const onPointerMove = (ev: globalThis.PointerEvent): void => {
        g.clientY = ev.clientY;
        if (!g.slots) {
          if (Math.abs(ev.clientY - g.startY) < DRAG_THRESHOLD_PX) return;
          g.slots = snapshotSlots(
            els.current.slice(0, countRef.current),
            g.scroller?.scrollTop ?? 0,
          );
          document.body.style.userSelect = 'none';
          document.body.style.cursor = 'grabbing';
          setPreview({
            srcIndex: index,
            toIndex: index,
            srcPitch: g.slots[index]?.pitch ?? 0,
            settleY: null,
          });
        }
        follow(g);
        if (!g.scrollRaf) g.scrollRaf = requestAnimationFrame(autoScroll);
      };
      const onPointerUp = (): void => finish(true);
      const onCancel = (): void => finish(false);
      const onKeyDown = (ev: KeyboardEvent): void => {
        if (ev.key !== 'Escape' || !g.slots) return;
        ev.preventDefault();
        finish(false);
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('blur', onCancel);
      window.addEventListener('keydown', onKeyDown, true);
      detach.current = () => {
        cancelAnimationFrame(g.scrollRaf);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onCancel);
        window.removeEventListener('keydown', onKeyDown, true);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        detach.current = () => undefined;
      };
    },
    [finish, follow],
  );

  useEffect(
    () => () => {
      detach.current();
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const itemRef = useCallback(
    (index: number) =>
      (el: HTMLElement | null): void => {
        els.current[index] = el;
      },
    [],
  );

  const itemStyle = (index: number): CSSProperties | undefined => {
    if (!preview) return undefined;
    const motion = `transform ${MOTION_MS}ms ${EASE}`;
    if (index === preview.srcIndex) {
      // 拖动中 transform 由 follow() 直接写 DOM;这里不声明 transform,避免 React 覆盖。
      return preview.settleY === null
        ? { position: 'relative', zIndex: 10, transition: 'none' }
        : {
            position: 'relative',
            zIndex: 10,
            transition: motion,
            transform: `translateY(${preview.settleY}px)`,
          };
    }
    const shift = siblingShift(index, preview.srcIndex, preview.toIndex, preview.srcPitch);
    return { transition: motion, transform: shift ? `translateY(${shift}px)` : undefined };
  };

  const onClickCapture = useCallback(
    (e: { stopPropagation(): void; preventDefault(): void }): void => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
    [],
  );

  return {
    draggingIndex: preview?.srcIndex ?? null,
    itemRef,
    itemStyle,
    onHandlePointerDown,
    onClickCapture,
  };
}
