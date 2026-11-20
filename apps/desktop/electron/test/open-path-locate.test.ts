import { test } from 'node:test';
import assert from 'node:assert/strict';

// openFileSmart talks to the preload bridge and dispatches a DOM event to open File Viewer.
type Invoke = (channel: string, input: Record<string, unknown>) => unknown;
const calls: { channel: string; input: Record<string, unknown> }[] = [];
const opened: string[] = [];
let respond: Invoke = () => ({ ok: false });
const memory = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
};
Object.assign(globalThis, {
  localStorage,
  window: Object.assign(new EventTarget(), {
    localStorage,
    kodaxSpace: {
      invoke: async (channel: string, input: Record<string, unknown>) => {
        calls.push({ channel, input });
        return respond(channel, input);
      },
    },
  }),
});
const { openFileSmart } = await import('../../renderer/src/lib/openPath.js');
const { useToastStore } = await import('../../renderer/src/store/toastStore.js');
const { OPEN_FILE_VIEWER_EVENT } =
  await import('../../renderer/src/features/artifact/transientArtifact.js');
(globalThis as unknown as { window: EventTarget }).window.addEventListener(
  OPEN_FILE_VIEWER_EVENT,
  (event) => opened.push((event as CustomEvent).detail.snapshot.path),
);

const ctx = { projectRoot: '/p', sessionId: null, surface: 'code' as const };
const existing = new Set(['docs/标书审查/报告.xlsx', 'a/同名.xlsx', 'b/同名.xlsx']);

function projectFiles(): Invoke {
  return (channel, input) => {
    if (channel === 'files.stat') {
      const found = existing.has(String(input.path));
      return { ok: true, data: { exists: found, kind: found ? 'file' : undefined } };
    }
    if (channel === 'project.fileSearch') {
      const query = String(input.query).toLowerCase();
      return { ok: true, data: { paths: [...existing].filter((p) => p.includes(query)) } };
    }
    return { ok: true, data: { revealed: false, reason: 'not-found' } };
  };
}

function reset(): void {
  calls.length = 0;
  opened.length = 0;
  useToastStore.setState({ toasts: [] });
  respond = projectFiles();
}

test('a link missing a folder opens the one project file with that name', async () => {
  reset();
  await openFileSmart('标书审查/报告.xlsx', ctx);
  assert.deepEqual(opened, ['docs/标书审查/报告.xlsx']);
  const search = calls.find((call) => call.channel === 'project.fileSearch');
  assert.equal(search?.input.locate, true);
  assert.equal(
    calls.some((call) => call.channel === 'shell.revealPath'),
    false,
  );
});

test('same-named files are reported instead of guessing one', async () => {
  reset();
  await openFileSmart('c/同名.xlsx', ctx);
  assert.deepEqual(opened, []);
  const toasts = useToastStore.getState().toasts.map((toast) => toast.message);
  assert.ok(
    toasts.some((message) => /a\/同名\.xlsx/.test(message) && /b\/同名\.xlsx/.test(message)),
  );
  assert.equal(
    calls.some((call) => call.channel === 'shell.revealPath'),
    false,
  );
});

test('a name found nowhere still falls back to reveal', async () => {
  reset();
  await openFileSmart('nowhere/缺失.xlsx', ctx);
  assert.deepEqual(opened, []);
  assert.equal(calls.at(-1)?.channel, 'shell.revealPath');
});

test("the Session's own tool records pick the file among same-named project files", async () => {
  reset();
  const { useAppStore } = await import('../../renderer/src/store/appStore.js');
  useAppStore.setState({
    eventsBySession: {
      s1: [
        {
          kind: 'tool_start',
          sessionId: 's1',
          toolId: 't1',
          toolName: 'write',
          input: { path: '/p/b/同名.xlsx' },
        },
      ],
    },
  });
  await openFileSmart('c/同名.xlsx', { ...ctx, sessionId: 's1' });
  assert.deepEqual(opened, ['b/同名.xlsx']);
  assert.equal(
    calls.some((call) => call.channel === 'project.fileSearch'),
    false,
  );
});
