// Which transcript rows to mount (F144). Rows stay in normal flow; unmounted runs collapse into
// one spacer each. A spacer exists only where rows are unmounted, so when the window reaches an
// end of the loaded collection the DOM edge is the collection edge and edge paging is unchanged.
//
// Pure layout math: no DOM, no scroll writes. Offsets are relative to the first row's top.

export interface WindowRow {
  readonly id: string;
  /** Rows of one kind share a calibration of their estimates against real measurements. */
  readonly kind: string;
  /** Content-based height guess, used until the row has been measured. */
  readonly estimate: number;
}

export interface TranscriptWindowInput {
  readonly rows: readonly WindowRow[];
  readonly measured: ReadonlyMap<string, number>;
  /** Vertical gap the container puts before every child (rows and spacers alike). */
  readonly gap: number;
  /** Used when there is no anchor or its row is gone; past the end means "at the bottom". */
  readonly scrollTop: number;
  /** Viewport top as a row identity plus the distance into that row; survives prepends. */
  readonly anchor?: { readonly id: string; readonly offset: number };
  readonly viewportHeight: number;
  readonly overscanBefore: number;
  readonly overscanAfter: number;
  /** Rows that must stay mounted wherever they are (selection, focus, menus, editing, streaming). */
  readonly pinned: ReadonlySet<string>;
  /** Kind scales held from an earlier `estimateScales`, so new measurements do not rescale the rest. */
  readonly scales?: ReadonlyMap<string, number>;
}

export type WindowPart =
  | { readonly kind: 'rows'; readonly start: number; readonly end: number }
  | {
      readonly kind: 'spacer';
      readonly start: number;
      readonly end: number;
      readonly height: number;
    };

/** Per kind, how its measured rows compared to their estimates (measured / estimated). */
export function estimateScales(
  rows: readonly WindowRow[],
  measured: ReadonlyMap<string, number>,
): Map<string, number> {
  const calibration = new Map<string, { measured: number; estimated: number }>();
  for (const row of rows) {
    const height = measured.get(row.id);
    if (height === undefined) continue;
    const kind = calibration.get(row.kind) ?? { measured: 0, estimated: 0 };
    kind.measured += height;
    kind.estimated += row.estimate;
    calibration.set(row.kind, kind);
  }
  const scales = new Map<string, number>();
  for (const [kind, sums] of calibration)
    if (sums.estimated > 0) scales.set(kind, sums.measured / sums.estimated);
  return scales;
}

/** Measured height, else the estimate scaled by its kind. */
function rowHeights(input: TranscriptWindowInput): number[] {
  const { rows, measured, scales: held } = input;
  const scales = estimateScales(rows, measured);
  return rows.map(
    (row) =>
      measured.get(row.id) ?? row.estimate * (held?.get(row.kind) ?? scales.get(row.kind) ?? 1),
  );
}

function viewportTop(input: TranscriptWindowInput, tops: readonly number[]): number {
  const anchorIndex = input.anchor
    ? input.rows.findIndex((row) => row.id === input.anchor?.id)
    : -1;
  const top =
    anchorIndex >= 0 && input.anchor ? tops[anchorIndex] + input.anchor.offset : input.scrollTop;
  return Math.max(0, Math.min(top, tops[tops.length - 1] - input.viewportHeight));
}

/** Half-open index ranges to mount, sorted and merged when they touch. */
function mountedRanges(
  input: TranscriptWindowInput,
  tops: readonly number[],
): Array<[number, number]> {
  const top = viewportTop(input, tops);
  const from = top - input.overscanBefore;
  const to = top + input.viewportHeight + input.overscanAfter;
  const ranges: Array<[number, number]> = [];
  let start = -1;
  for (let index = 0; index < input.rows.length; index += 1) {
    const visible = tops[index] < to && tops[index + 1] > from;
    if (visible && start < 0) start = index;
    if (!visible && start >= 0) {
      ranges.push([start, index]);
      start = -1;
    }
  }
  if (start >= 0) ranges.push([start, input.rows.length]);
  input.rows.forEach((row, index) => {
    if (input.pinned.has(row.id)) ranges.push([index, index + 1]);
  });
  ranges.sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export function computeTranscriptWindow(input: TranscriptWindowInput): WindowPart[] {
  const heights = rowHeights(input);
  // tops[i] is where row i starts (its gap included above it); tops[n] is the total extent.
  const tops = [0];
  for (const height of heights) tops.push(tops[tops.length - 1] + height + input.gap);
  const parts: WindowPart[] = [];
  const spacer = (start: number, end: number): void => {
    if (end > start)
      parts.push({ kind: 'spacer', start, end, height: tops[end] - tops[start] - input.gap });
  };
  let next = 0;
  for (const [start, end] of mountedRanges(input, tops)) {
    spacer(next, start);
    parts.push({ kind: 'rows', start, end });
    next = end;
  }
  spacer(next, input.rows.length);
  return parts;
}
