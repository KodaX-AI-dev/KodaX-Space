export interface PerfSummary {
  readonly n: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
}

/** Nearest-rank percentile over a non-empty sample. */
export function percentile(values: readonly number[], rank: number): number {
  if (values.length === 0) throw new Error('percentile needs at least one value');
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((rank / 100) * sorted.length) - 1),
  );
  return sorted[index]!;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarize(values: readonly number[]): PerfSummary | null {
  if (values.length === 0) return null;
  return {
    n: values.length,
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    max: round(Math.max(...values)),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}
