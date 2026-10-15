import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import {
  listPersistedSessions,
  setSessionStoreImpl,
  type SessionStoreImpl,
} from '../kodax/session-store.js';
import { setSessionTitleStoreForTesting } from '../kodax/session-title-store.js';

type Transcript = NonNullable<
  Awaited<ReturnType<NonNullable<SessionStoreImpl['loadFullTranscript']>>>
>;
afterEach(() => {
  setSessionStoreImpl(null);
  setSessionTitleStoreForTesting(null);
});

test('listing hides only confirmed empty unnamed records, retains recoverable history, and fills the visible limit', async () => {
  const records = new Map<string, Transcript>([
    ['renamed', { title: 'SDK rename after summary capture', gitRoot: '/repo', messages: [], activeMessages: [], transcriptEntries: [] }],
    [
      'empty',
      { title: '', gitRoot: '/repo', messages: [], activeMessages: [], transcriptEntries: [] },
    ],
    [
      'inactive',
      {
        title: '',
        gitRoot: '/repo',
        messages: [],
        activeMessages: [],
        transcriptEntries: [
          {
            entryId: 'old',
            logicalId: 'old',
            parentId: null,
            timestamp: '2026-10-14T00:00:00Z',
            type: 'message',
            message: { role: 'user', content: 'recoverable old input' },
            active: false,
          },
        ],
      },
    ],
    [
      'named-empty',
      {
        title: 'Saved workspace',
        gitRoot: '/repo',
        messages: [],
        activeMessages: [],
        transcriptEntries: [],
      },
    ],
    [
      'content',
      {
        title: '',
        gitRoot: '/repo',
        messages: [{ role: 'user', content: 'actual input' }],
        activeMessages: [],
        transcriptEntries: [],
      },
    ],
  ]);
  let deletes = 0;
  setSessionTitleStoreForTesting({
    read: async () => null,
    set: async () => {},
    delete: async () => {},
  });
  setSessionStoreImpl({
    listSessions: async () =>
      [...records].map(([id, data]) => ({
        id,
        title: id === 'renamed' ? '' : data.title,
        msgCount: 0,
        runtimeInfo: { workspaceRoot: '/repo', surface: 'repl' },
      })),
    loadFullTranscript: async (id) => records.get(id) ?? null,
    loadSession: async (id) => records.get(id) ?? null,
    deleteSession: async () => {
      deletes++;
      return { ok: true };
    },
    forkSession: async () => null,
    rewindSession: async () => null,
    watchSessions: () => ({ close() {} }),
  });
  assert.deepEqual(
    (await listPersistedSessions({ projectRoot: '/repo', limit: 2 })).map((s) => s.sessionId),
    ['renamed', 'inactive'],
  );
  assert.deepEqual(
    (await listPersistedSessions({ projectRoot: '/repo' })).map((s) => s.sessionId),
    ['renamed', 'inactive', 'named-empty', 'content'],
  );
  assert.equal(deletes, 0);
  assert.equal(records.has('empty'), true);
});
