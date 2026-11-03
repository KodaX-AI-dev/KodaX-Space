import { expect, test } from '@playwright/test';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createLocalSdkProvider,
  launchRealSdkSpace,
  readSdkProductView,
} from './sdk-provider-fixture.js';
import type { SpaceInstance } from './fixtures.js';
import { readProductItemText } from '../../apps/desktop/renderer/src/lib/productItemContent.js';

const source = process.env.SPACE_E2E_REPLAY_SESSION;
test.skip(
  !source,
  'Set SPACE_E2E_REPLAY_SESSION to replay a supplied Session copy without executing it.',
);
test.setTimeout(180_000);

async function copySessionCorpus(root: string, source: string, sessionId: string) {
  const before = await stat(source);
  const directory = path.dirname(source);
  const target = path.join(root, 'sessions', path.basename(directory));
  await mkdir(target, { recursive: true });
  for (const name of await readdir(directory)) {
    if (name.startsWith(sessionId + '.') && !name.endsWith('.lock'))
      await copyFile(path.join(directory, name), path.join(target, name));
  }
  const after = await stat(source);
  expect({ size: after.size, mtime: after.mtimeMs }).toEqual({
    size: before.size,
    mtime: before.mtimeMs,
  });
}

async function readCorpusHeader() {
  if (!source) throw new Error('Session replay source missing');
  const sessionId = path.basename(source, '.jsonl');
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('Invalid Session fixture name');
  const header = JSON.parse((await readFile(source, 'utf8')).split('\n', 1)[0]!) as {
    gitRoot: string;
  };
  if (typeof header.gitRoot !== 'string') throw new Error('Session workspace missing');
  return { sessionId, gitRoot: header.gitRoot };
}

async function waitForCorpus(space: SpaceInstance, sessionId: string) {
  const stream = space.page.getByTestId('conversation-stream');
  await expect(stream).toHaveAttribute('data-session-id', sessionId, { timeout: 60_000 });
  await expect(stream.getByTestId('user-message-bubble').first()).toBeVisible({
    timeout: 60_000,
  });
}

async function openCorpus(space: SpaceInstance, sessionId: string, gitRoot: string) {
  await space.seedProject(gitRoot);
  await space.page
    .getByTestId('sidebar-session-row')
    .and(space.page.locator(`[data-session-id="${sessionId}"]`))
    .click();
  await waitForCorpus(space, sessionId);
}

async function waitForAssistantBodies(space: SpaceInstance, sessionId: string) {
  const view = await readSdkProductView(space, sessionId);
  const assistants = view.items.filter(
    (item) => item.type === 'assistant' && item.text.length > 40,
  );
  expect(assistants.length).toBeGreaterThan(0);
  let expandedBodies = 0;
  for (const item of assistants) {
    const text = await readProductItemText(item, async (offset) => {
      const result = await space.page.evaluate(
        (input) => window.kodaxSpace!.invoke('session.productItem', input),
        { sessionId, itemId: item.id, source: 'view' as const, part: 'text' as const, offset },
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    });
    if (text.length > item.text.length) expandedBodies++;
    const excerpt = [...text.matchAll(/[\p{L}\p{N}，。、（）()；：,.!?;:\s]{25,}/gu)]
      .map((match) => match[0].trim())
      .filter((part) => part.length >= 25)
      .at(-1);
    if (!excerpt) throw new Error('Corpus assistant has no plain-text rendering assertion');
    await expect(space.page.locator(`[data-msg-id=${JSON.stringify(item.id)}]`)).toContainText(
      excerpt,
      { timeout: 60_000 },
    );
  }
  await space.page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  return { assistants: assistants.length, expandedBodies };
}

test('the supplied Session loads and reloads from an isolated corpus without React errors or model requests', async () => {
  const { sessionId, gitRoot } = await readCorpusHeader();
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`corpus-replay-${Date.now()}`, provider.url, (root) =>
    copySessionCorpus(root, source!, sessionId),
  );
  const errors: string[] = [];
  space.page.on('pageerror', (error) => errors.push(error.message));
  space.page.on('console', (message) => {
    if (/React error #\d+|Maximum update depth/i.test(message.text())) errors.push(message.text());
  });
  try {
    const started = performance.now();
    await openCorpus(space, sessionId, gitRoot);
    const firstBodies = await waitForAssistantBodies(space, sessionId);
    const firstContentMs = performance.now() - started;
    await space.page.reload();
    await openCorpus(space, sessionId, gitRoot);
    const reloadedBodies = await waitForAssistantBodies(space, sessionId);
    await space.page.screenshot({ path: test.info().outputPath('corpus-replayed.png') });
    expect(errors).toEqual([]);
    expect(provider.requests).toEqual([]);
    await writeFile(
      test.info().outputPath('corpus-replay.json'),
      JSON.stringify({
        sessionId,
        sourceBytes: (await stat(source!)).size,
        firstContentMs,
        firstBodies,
        reloadedBodies,
        errors,
        modelRequests: provider.requests.length,
      }),
    );
  } finally {
    await provider.close();
    await space.close();
  }
});
