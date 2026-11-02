import { test, expect } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '@kodax-ai/kodax/session';
import { launchSpace } from './fixtures.js';

test('sidebar preserves real SDK message recency across reload instead of creation order', async () => {
  const recentMessageAt = Date.now() - 3_600_000;
  let projectRoot = '';
  const space = await launchSpace(`message-recency-${Date.now()}`, {
    prepareProfile: async (profileRoot) => {
      // Seed before the Host can migrate the same session layout during startup.
      const root = await fs.realpath(profileRoot);
      projectRoot = path.join(root, 'workspace');
      const manager = createSessionManager({
        sessionsDir: path.join(root, 'sessions'),
        configHome: root,
      });
      await manager.storage.save('older-continued', {
        title: 'Older session continued recently',
        gitRoot: projectRoot,
        scope: 'user',
        runtimeInfo: { workspaceRoot: projectRoot, surface: 'repl' },
        messages: [
          {
            role: 'user',
            content: 'Recent real message',
            timestamp: new Date(recentMessageAt).toISOString(),
          },
        ],
      });
      const first = (await manager.listSessions()).find(
        (session) => session.id === 'older-continued',
      );
      expect(first?.createdAt).toBeDefined();
      await expect.poll(() => Date.now() > Date.parse(first!.createdAt!)).toBe(true);
      await manager.storage.save('newer-inactive', {
        title: 'Newer session with older conversation',
        gitRoot: projectRoot,
        scope: 'user',
        runtimeInfo: { workspaceRoot: projectRoot, surface: 'repl' },
        messages: [
          {
            role: 'user',
            content: 'Older real message',
            timestamp: new Date(recentMessageAt - 86_400_000).toISOString(),
          },
        ],
      });
    },
  });
  try {
    await space.seedProject(projectRoot);
    for (let round = 0; round < 2; round++) {
      await expect
        .poll(async () => {
          const result = await space.page.evaluate(
            (projectRoot) =>
              window.kodaxSpace.invoke('session.list', { projectRoot, surface: 'code' }),
            projectRoot,
          );
          if (!result.ok) throw new Error(result.error.message);
          return result.data.sessions.map((session) => [session.sessionId, session.lastMessageAt]);
        })
        .toEqual([
          ['older-continued', recentMessageAt],
          ['newer-inactive', recentMessageAt - 86_400_000],
        ]);
      await space.page.reload();
      await expect
        .poll(() =>
          space.page
            .getByTestId('sidebar-session-row')
            .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-session-id'))),
        )
        .toEqual(['older-continued', 'newer-inactive']);
    }
  } finally {
    await space.close();
  }
});

async function seedEmptyRecords(profileRoot: string) {
  const root = await fs.realpath(profileRoot);
  const projectRoot = path.join(root, 'workspace');
  const manager = createSessionManager({
    sessionsDir: path.join(root, 'sessions'),
    configHome: root,
  });
  for (const [id, title, messages] of [
    ['legacy-empty', '', []],
    ['saved-empty', 'Saved workspace', []],
    ['unnamed-content', '   ', [{ role: 'user' as const, content: 'Actual retained input' }]],
  ] as const) {
    await manager.storage.save(id, {
      messages: [...messages],
      title,
      gitRoot: projectRoot,
      scope: 'user',
      runtimeInfo: { workspaceRoot: projectRoot, surface: 'repl' },
    });
  }
  return { manager, projectRoot };
}

test('old empty records stay on disk while real unnamed sessions display a title across reload', async () => {
  let seeded!: Awaited<ReturnType<typeof seedEmptyRecords>>;
  const space = await launchSpace(`empty-records-${Date.now()}`, {
    prepareProfile: async (root) => {
      seeded = await seedEmptyRecords(root);
    },
  });
  const { manager, projectRoot } = seeded;
  try {
    await space.seedProject(projectRoot);
    for (let round = 0; round < 2; round++) {
      await expect
        .poll(async () => {
          const result = await space.page.evaluate(
            (projectRoot) =>
              window.kodaxSpace.invoke('session.list', { projectRoot, surface: 'code' }),
            projectRoot,
          );
          if (!result.ok) throw new Error(result.error.message);
          return result.data.sessions
            .filter((s) => ['legacy-empty', 'saved-empty', 'unnamed-content'].includes(s.sessionId))
            .map((s) => s.sessionId)
            .sort();
        })
        .toEqual(['saved-empty', 'unnamed-content']);
      // All records were seeded before the Host became the sole writer.
      if (round === 0) await space.page.reload();
      await expect(space.page.getByText('Saved workspace', { exact: true })).toBeVisible();
      await expect(space.page.locator('[data-session-id="unnamed-content"]')).toContainText(
        'Untitled session',
      );
      expect((await manager.loadSession('legacy-empty'))?.messages).toEqual([]);
      expect((await manager.loadSession('unnamed-content'))?.messages[0]?.content).toBe(
        'Actual retained input',
      );
      if (round === 0) await space.page.reload();
    }
  } finally {
    await space.close();
  }
});
