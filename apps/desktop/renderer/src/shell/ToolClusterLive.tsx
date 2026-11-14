// ToolClusterLive — live pieces of the tail tool group (pure projections: toolClusterPulse.ts).
// All motion is transform/opacity only. CSS animations are gated in styles.css; the WAAPI
// row push-up checks the same gates here because WAAPI bypasses CSS gating.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Dot, FileSearch, Pencil, SquareTerminal, X, type LucideIcon } from 'lucide-react';
import { DURATION, EASE_EXPO } from '../lib/motion.js';
import {
  formatPulseDuration,
  type FamilyTally,
  type LiveToolRow,
  type ToolFamily,
} from './toolClusterPulse.js';

export function motionAllowed(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.classList.contains('q-minimal')) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Wall clock that ticks once per second while `active`. */
export function useSecondClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function formatPulseTokens(n: number): string {
  return n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n);
}

const FAMILY_ICONS: Readonly<Record<ToolFamily, LucideIcon>> = {
  read: FileSearch,
  edit: Pencil,
  run: SquareTerminal,
  other: Dot,
  fail: X,
};

/** Icon + count + total time per tool family; a new call re-keys the count so it bumps. */
export function ClusterTallies({
  tallies,
  live,
}: {
  tallies: readonly FamilyTally[];
  live: boolean;
}): JSX.Element | null {
  if (tallies.length === 0) return null;
  return (
    <span className="tool-pulse-tallies" aria-hidden data-testid="tool-cluster-tallies">
      {tallies.map((tally) => {
        const Icon = FAMILY_ICONS[tally.family];
        return (
          <span
            key={tally.family}
            className={`tool-pulse-tally fam-${tally.family}${tally.running ? ' is-running' : ''}`}
            data-family={tally.family}
          >
            <Icon className="tool-pulse-tally-icon" strokeWidth={2.2} />
            <b key={live ? tally.count : 'settled'} className="tool-pulse-tally-count">
              {tally.count}
            </b>
            {tally.durationMs !== undefined && (
              <span className="tool-pulse-tally-time">
                {formatPulseDuration(tally.durationMs, tally.running)}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function RowIcon({ status }: { status: LiveToolRow['status'] }): JSX.Element {
  if (status === 'running') return <span className="tool-pulse-spin is-row" aria-hidden />;
  if (status === 'interrupted')
    return <X className="tool-pulse-row-icon is-stopped" strokeWidth={2} aria-hidden />;
  return <Check className="tool-pulse-row-icon is-done" strokeWidth={2.2} aria-hidden />;
}

/** The latest thinking line with a blinking caret; hidden (but laid out) while empty. */
export function LiveThinkingLine({ text }: { text: string }): JSX.Element {
  return (
    <div className={`tool-pulse-think${text ? ' is-on' : ''}`}>
      <span className="min-w-0 truncate">{text}</span>
      <span className="tool-pulse-caret" aria-hidden />
    </div>
  );
}

/** Thinking tail + latest rows; a new row pushes the list up one row (FLIP on the list). */
export function LiveToolFeed({
  thinking,
  rows,
}: {
  thinking: string;
  rows: readonly LiveToolRow[];
}): JSX.Element {
  const listRef = useRef<HTMLUListElement>(null);
  const lastId = rows.at(-1)?.id;
  const previousLastId = useRef(lastId);
  useLayoutEffect(() => {
    const list = listRef.current;
    const pushed = previousLastId.current !== undefined && previousLastId.current !== lastId;
    previousLastId.current = lastId;
    if (!pushed || !list || !motionAllowed()) return;
    const rowHeight = (list.lastElementChild as HTMLElement | null)?.offsetHeight ?? 0;
    list.animate([{ transform: `translateY(${rowHeight}px)` }, { transform: 'none' }], {
      duration: DURATION.slow,
      easing: EASE_EXPO,
    });
  }, [lastId]);

  return (
    <div className="tool-pulse-feed" data-testid="tool-cluster-live-feed">
      <LiveThinkingLine text={thinking} />
      <div className="tool-pulse-rows-clip">
        <ul ref={listRef} className="tool-pulse-rows">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`tool-pulse-row is-${row.status}`}
              data-testid="tool-cluster-live-row"
            >
              <RowIcon status={row.status} />
              <span className="tool-pulse-row-name">{row.name}</span>
              <span className="tool-pulse-row-target">{row.target}</span>
              {row.durationMs !== undefined && (
                <span className="tool-pulse-row-duration">
                  {formatPulseDuration(row.durationMs, row.status === 'running')}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
