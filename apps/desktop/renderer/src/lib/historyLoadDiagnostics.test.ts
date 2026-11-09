import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_LOAD_MEASURE_PREFIX,
  startHistoryLoadTrace,
  type HistoryLoadEnvironment,
  type HistoryLoadSplit,
} from './historyLoadDiagnostics.js';

function fakeEnvironment(ticks: readonly number[]) {
  const reports: HistoryLoadSplit[] = [];
  const pending: (() => void)[] = [];
  let index = 0;
  let layouts = 0;
  const env: HistoryLoadEnvironment = {
    now: () => ticks[index++]!,
    afterCommit: (callback) => pending.push(callback),
    forceLayout: () => {
      layouts += 1;
    },
    afterPaint: (callback) => pending.push(callback),
    report: (split) => reports.push(split),
  };
  const flush = () => {
    while (pending.length > 0) pending.shift()!();
  };
  return { env, reports, flush, layouts: () => layouts };
}

function measures(seq: number) {
  return performance
    .getEntriesByType('measure')
    .filter(
      (entry) =>
        entry.name.startsWith(HISTORY_LOAD_MEASURE_PREFIX) &&
        (entry as PerformanceMeasure).detail?.seq === seq,
    )
    .map((entry) => [entry.name.slice(HISTORY_LOAD_MEASURE_PREFIX.length), entry.duration]);
}

test('a history load splits into IPC, install, commit, layout and paint in chain order', () => {
  const { env, reports, flush, layouts } = fakeEnvironment([10, 25, 27, 40, 41, 48, 60]);
  const trace = startHistoryLoadTrace('older', env);
  trace.received();
  trace.received();
  trace.installed(150);
  assert.equal(reports.length, 0, 'nothing is reported before the commit and paint run');
  flush();
  assert.equal(layouts(), 1);
  assert.equal(reports.length, 1);
  const split = reports[0]!;
  assert.deepEqual(
    { ...split, seq: 0 },
    {
      seq: 0,
      kind: 'older',
      items: 150,
      roundTrips: 2,
      ipcMs: 17,
      installMs: 13,
      commitMs: 1,
      layoutMs: 7,
      paintMs: 12,
    },
  );
  assert.deepEqual(measures(split.seq), [
    ['ipc', 17],
    ['install', 13],
    ['commit', 1],
    ['layout', 7],
    ['paint', 12],
  ]);
});

test('a load that never installs a page records nothing', () => {
  const { env, reports, flush } = fakeEnvironment([0, 5]);
  const trace = startHistoryLoadTrace('newest', env);
  trace.received();
  flush();
  assert.equal(reports.length, 0);
});

test('an install without a received response records nothing', () => {
  const { env, reports, flush } = fakeEnvironment([0, 5]);
  startHistoryLoadTrace('around', env).installed(3);
  flush();
  assert.equal(reports.length, 0);
});

test('each load records once even if install is signalled twice', () => {
  const { env, reports, flush } = fakeEnvironment([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const trace = startHistoryLoadTrace('newer', env);
  trace.received();
  trace.installed(1);
  trace.installed(1);
  flush();
  assert.equal(reports.length, 1);
});
