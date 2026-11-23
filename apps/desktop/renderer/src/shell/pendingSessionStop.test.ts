import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readPendingSessionStops,
  settlePendingSessionStops,
  writePendingSessionStops,
} from './pendingSessionStop.js';

function memoryStorage() {
  const values = new Map<string, string>();
  let writes = 0;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes += 1;
      values.set(key, value);
    },
    writes: () => writes,
  };
}

test('a pending Stop is settled once its Run is observed terminal, other pending Stops stay', () => {
  const storage = memoryStorage();
  const settled = { sessionId: 'session-1', runId: 'stopped-run', requestId: 'stop-1' };
  const otherRun = { sessionId: 'session-1', runId: 'other-run', requestId: 'stop-2' };
  const otherSession = { sessionId: 'session-2', runId: 'stopped-run', requestId: 'stop-3' };
  writePendingSessionStops(storage, {
    'stop-1': settled,
    'stop-2': otherRun,
    'stop-3': otherSession,
  });

  const records = settlePendingSessionStops(storage, 'session-1', ['stopped-run']);

  const expected = { 'stop-2': otherRun, 'stop-3': otherSession };
  assert.deepEqual(records, expected);
  assert.deepEqual(readPendingSessionStops(storage), expected);
});

test('settling without a matching terminal Run leaves pending Stops untouched', () => {
  const storage = memoryStorage();
  const pending = { sessionId: 'session-1', runId: 'stopped-run', requestId: 'stop-1' };
  writePendingSessionStops(storage, { 'stop-1': pending });
  const writesBefore = storage.writes();

  assert.equal(settlePendingSessionStops(storage, 'session-1', ['later-run']), undefined);
  assert.equal(storage.writes(), writesBefore);
  assert.deepEqual(readPendingSessionStops(storage), { 'stop-1': pending });
});

test('pending Stop survives UI reload with its original Session, Run and request binding', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const pending = { sessionId: 'session-1', runId: 'original-run', requestId: 'original-request' };
  writePendingSessionStops(storage, { 'original-request': pending });
  assert.deepEqual(readPendingSessionStops(storage)['original-request'], pending);
  const second = { ...pending, runId: 'later-run', requestId: 'later-request' };
  writePendingSessionStops(storage, {
    ...readPendingSessionStops(storage),
    'later-request': second,
  });
  const records = readPendingSessionStops(storage);
  delete records['later-request'];
  writePendingSessionStops(storage, records);
  assert.deepEqual(readPendingSessionStops(storage)['original-request'], pending);
  writePendingSessionStops(storage, {});
  assert.deepEqual(readPendingSessionStops(storage), {});
});
