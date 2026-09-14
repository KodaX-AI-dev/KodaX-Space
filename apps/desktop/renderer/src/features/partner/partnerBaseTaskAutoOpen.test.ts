import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerFeishuBaseCreateTaskT } from '@kodax-space/space-ipc-schema';
import {
  createPartnerBaseTaskTracker,
  partnerDetailTargetForBaseTaskEvent,
  projectPartnerBaseTaskUpdate,
} from './partnerBaseTaskAutoOpen.js';

function task(
  id: string,
  status: PartnerFeishuBaseCreateTaskT['status'],
  createdAt: string,
): PartnerFeishuBaseCreateTaskT {
  const succeeded = status === 'succeeded';
  return {
    id,
    sessionId: 'session-1',
    projectRoot: '/project',
    extensionId: 'kodax.partner-library',
    connectorId: 'feishu-docs',
    connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
    connectionRevision: 1,
    folderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
    baseName: '项目台账',
    tableName: '任务',
    fields: [{ type: 'text', name: '事项' }],
    timeZone: 'Asia/Shanghai',
    inputHash: 'a'.repeat(64),
    scopeHash: 'b'.repeat(64),
    status,
    ...(succeeded
      ? {
          baseToken: `base${id}`,
          tableId: `tbl${id}`,
          url: `https://www.feishu.cn/base/base${id}`,
        }
      : {}),
    createdAt,
    updatedAt: createdAt,
  };
}

test('initial load establishes a baseline without reopening historical Base tasks', () => {
  const tracker = createPartnerBaseTaskTracker('project/session');
  const result = projectPartnerBaseTaskUpdate(tracker, true, [
    task('old', 'succeeded', '2026-09-01T09:00:00.000Z'),
  ]);

  assert.equal(result.event, null);
  assert.equal(result.tracker.initialized, true);
});

test('a new Base task opens once while later status changes stay in the same detail tab', () => {
  let result = projectPartnerBaseTaskUpdate(
    createPartnerBaseTaskTracker('project/session'),
    true,
    [],
  );
  const preparing = task('new', 'preparing', '2026-09-01T10:01:00.000Z');
  result = projectPartnerBaseTaskUpdate(result.tracker, true, [preparing], {
    id: preparing.id,
    revision: 1,
  });
  assert.deepEqual(result.event, { kind: 'task', task: preparing });

  const succeeded = { ...preparing, ...task('new', 'succeeded', preparing.createdAt) };
  result = projectPartnerBaseTaskUpdate(result.tracker, true, [succeeded], {
    id: succeeded.id,
    revision: 2,
  });
  assert.equal(result.event, null);
  assert.deepEqual(result.tracker.openedTaskIds, ['new']);

  result = projectPartnerBaseTaskUpdate(result.tracker, true, [succeeded]);
  assert.equal(result.event, null);
});

test('a host-signalled task can open during first load, while failure never opens a resource', () => {
  const tracker = createPartnerBaseTaskTracker('project/session');
  const failed = task('new', 'failed', '2026-09-01T10:00:01.000Z');
  const result = projectPartnerBaseTaskUpdate(tracker, true, [failed], {
    id: failed.id,
    revision: 1,
  });

  assert.deepEqual(result.event, { kind: 'task', task: failed });
});

test('records are ignored until loaded for the current scope', () => {
  const tracker = createPartnerBaseTaskTracker('project/session');
  const preparing = task('new', 'preparing', '2026-09-01T10:00:01.000Z');
  const result = projectPartnerBaseTaskUpdate(tracker, false, [preparing], {
    id: preparing.id,
    revision: 1,
  });

  assert.equal(result.event, null);
  assert.equal(result.tracker.initialized, false);
});

test('a signal selects its exact task instead of reopening the newest historical task', () => {
  const old = task('old', 'succeeded', '2026-09-01T09:00:00.000Z');
  const current = task('current', 'submitting', '2026-09-01T10:00:00.000Z');
  const result = projectPartnerBaseTaskUpdate(
    createPartnerBaseTaskTracker('project/session'),
    true,
    [old, current],
    { id: current.id, revision: 1 },
  );

  assert.deepEqual(result.event, { kind: 'task', task: current });
});

test('task status and success map to one replaceable right-panel tab', () => {
  const preparing = task('new', 'preparing', '2026-09-01T10:01:00.000Z');

  assert.deepEqual(partnerDetailTargetForBaseTaskEvent({ kind: 'task', task: preparing }), {
    kind: 'baseTask',
    task: preparing,
  });
});

test('a signal remains pending until its exact task appears in records', () => {
  const signal = { id: 'late', revision: 1 };
  let result = projectPartnerBaseTaskUpdate(
    createPartnerBaseTaskTracker('project/session'),
    true,
    [],
    signal,
  );
  assert.equal(result.event, null);
  assert.equal(result.tracker.lastSignalRevision, 0);

  const late = task('late', 'preparing', '2026-09-01T10:02:00.000Z');
  result = projectPartnerBaseTaskUpdate(result.tracker, true, [late], signal);
  assert.deepEqual(result.event, { kind: 'task', task: late });
});

test('two distinct host-signalled tasks can each open while duplicate stages cannot reopen either', () => {
  const first = task('first', 'preparing', '2026-09-01T10:03:00.000Z');
  const second = task('second', 'preparing', '2026-09-01T10:04:00.000Z');
  let result = projectPartnerBaseTaskUpdate(
    createPartnerBaseTaskTracker('project/session'),
    true,
    [first, second],
    { id: first.id, revision: 1 },
  );
  assert.deepEqual(result.event, { kind: 'task', task: first });

  result = projectPartnerBaseTaskUpdate(result.tracker, true, [first, second], {
    id: second.id,
    revision: 2,
  });
  assert.deepEqual(result.event, { kind: 'task', task: second });

  result = projectPartnerBaseTaskUpdate(
    result.tracker,
    true,
    [{ ...first, status: 'submitting' }, second],
    { id: first.id, revision: 3 },
  );
  assert.equal(result.event, null);
});
