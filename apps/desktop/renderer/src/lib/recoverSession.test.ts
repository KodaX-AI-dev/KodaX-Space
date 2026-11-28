import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionMeta } from '@kodax-space/space-ipc-schema';
import { recoverSessionFromSummary } from './recoverSession.js';
import { useAppStore } from '../store/appStore.js';
import { useSurfaceStore } from '../store/surface.js';
import { useToastStore } from '../store/toastStore.js';

const source = {
  sessionId: 's_rejected',
  projectRoot: 'C:/proj',
  surface: 'code',
  provider: 'deepseek',
  agentMode: 'ama',
  permissionMode: 'accept-edits',
  reasoningMode: 'auto',
  title: 'Screenshot review',
  createdAt: 1,
  lastActivityAt: 1,
} as SessionMeta;

async function withBridge(
  invoke: (channel: string, input: unknown) => Promise<unknown>,
  run: () => Promise<void>,
): Promise<void> {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { kodaxSpace: { invoke } },
  });
  try {
    await run();
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved);
    else Reflect.deleteProperty(globalThis, 'window');
  }
}

test('recovery derives a child of the rejected session and switches to it', async () => {
  useSurfaceStore.setState({ currentSurface: 'code' });
  useAppStore.setState({
    sessions: [source],
    currentSessionId: source.sessionId,
    currentProjectPath: source.projectRoot,
  });
  const calls: Array<{ channel: string; input: unknown }> = [];
  await withBridge(
    async (channel, input) => {
      calls.push({ channel, input });
      return { ok: true, data: { newSessionId: 's_recovered', createdAt: 5, title: 'Recovered' } };
    },
    () => recoverSessionFromSummary(source.sessionId, (key) => key),
  );

  assert.deepEqual(calls, [{ channel: 'session.recover', input: { sessionId: 's_rejected' } }]);
  const state = useAppStore.getState();
  const child = state.sessions.find((s) => s.sessionId === 's_recovered');
  assert.equal(child?.parentSessionId, 's_rejected');
  assert.equal(child?.provider, 'deepseek');
  assert.equal(child?.title, 'Recovered');
  assert.equal(state.currentSessionId, 's_recovered');
});

test('a failed recovery keeps the current session and reports the reason', async () => {
  useSurfaceStore.setState({ currentSurface: 'code' });
  useAppStore.setState({
    sessions: [source],
    currentSessionId: source.sessionId,
    currentProjectPath: source.projectRoot,
  });
  useToastStore.setState({ toasts: [] });
  await withBridge(
    async () => ({ ok: false, error: { code: 'conflict', message: 'Session is running' } }),
    () =>
      recoverSessionFromSummary(source.sessionId, (key, vars) =>
        vars?.message ? `${key}:${vars.message}` : key,
      ),
  );

  assert.equal(useAppStore.getState().currentSessionId, 's_rejected');
  const toast = useToastStore.getState().toasts.at(-1);
  assert.equal(toast?.message, 'session.recoverFailed:Session is running');
  assert.equal(toast?.tone, 'error');
});
