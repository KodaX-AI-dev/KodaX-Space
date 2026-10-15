import { test, expect } from '@playwright/test';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createSessionManager } from '@kodax-ai/kodax/session';
import { launchSpace } from './fixtures.js';

test('sidebar preserves real SDK message recency across reload instead of creation order', async () => {
  const space = await launchSpace(`message-recency-${Date.now()}`);
  try {
    const root = await fs.realpath(space.testDataDir);
    const projectRoot = path.join(root, 'workspace');
    const manager = createSessionManager({ sessionsDir: path.join(root, 'sessions') });
    const recentMessageAt = Date.now() - 3_600_000;
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

test('old empty records stay on disk while real unnamed sessions display a title across reload', async () => {
  const space = await launchSpace(`empty-records-${Date.now()}`);
  try {
    const root = await fs.realpath(space.testDataDir);
    const projectRoot = path.join(root, 'workspace');
    const manager = createSessionManager({ sessionsDir: path.join(root, 'sessions') });
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
      // The fixture writes through a separate SDK manager after the first UI load.
      // Reload once its public list sees those files, as reopening Space would.
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
