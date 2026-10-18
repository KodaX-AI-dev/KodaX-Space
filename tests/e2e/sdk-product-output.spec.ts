import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { connectKodaXClient } from '@kodax-ai/kodax/client';
import path from 'node:path';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(150_000);

test('SDK error output retains Provider actions and diagnostics without a second error body', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-product-error-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'FAIL_PRODUCT');
    const sessionId = await currentSdkSession(space);
    await expect(
      space.page
        .getByTestId('conversation-stream')
        .getByRole('button', { name: 'Provider settings', exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await waitSdkIdle(space, sessionId);
    const snapshot = await space.page.evaluate(
      (id) => window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id }),
      sessionId,
    );
    if (!snapshot.ok || !snapshot.data) throw new Error('SDK error view unavailable');
    const errorItem = snapshot.data.items.find((item) => item.type === 'error');
    if (errorItem)
      await expect(space.page.locator(`[data-msg-id="${errorItem.id}"]`)).toHaveCount(1);
    await expect(
      space.page
        .getByTestId('conversation-stream')
        .getByRole('button', { name: 'Provider settings', exact: true }),
    ).toHaveCount(1);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('expired SDK history cursors request resync and leave the current view intact', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-product-cursor-${Date.now()}`, provider.url);
  let peer: Awaited<ReturnType<typeof connectKodaXClient>> | undefined;
  try {
    await sendSdkPrompt(space, 'CURSOR_FIRST');
    const sessionId = await currentSdkSession(space);
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:CURSOR_FIRST',
    );
    await waitSdkIdle(space, sessionId);
    const daemonDir = path.join(space.testDataDir, 'runtime/daemon/coder');
    const descriptor = JSON.parse(await readFile(path.join(daemonDir, 'daemon.json'), 'utf8')) as {
      endpoint: string;
    };
    peer = await connectKodaXClient({
      profile: 'coder',
      endpoint: descriptor.endpoint,
      token: (await readFile(path.join(daemonDir, 'daemon.token'), 'utf8')).trim(),
      clientInfo: {
        name: 'Space history E2E',
        instanceId: randomUUID(),
        instanceSecret: randomUUID(),
      },
    });
    const history = await peer.sessions.readHistory(sessionId, { limit: 1 });
    expect(history.nextCursor).toBeDefined();
    await sendSdkPrompt(space, 'CURSOR_SECOND');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:CURSOR_SECOND',
    );
    await waitSdkIdle(space, sessionId);
    const result = await space.page.evaluate(
      (args) => window.kodaxSpace!.invoke('session.history', args),
      {
        sessionId,
        requestId: randomUUID(),
        expectedSurface: 'code' as const,
        cursor: history.nextCursor,
        revision: history.revision,
        sourceRevision: history.sourceRevision,
      },
    );
    expect(result.ok && result.data.page?.outcome).toBe('data_changed');
    await expect(space.page.getByTestId('conversation-stream')).toContainText(
      'SDK_REPLY:CURSOR_SECOND',
    );
    expect(provider.errors).toEqual([]);
  } finally {
    await peer?.disconnect();
    await provider.close();
    await space.close();
  }
});

test('SDK streaming replacement retains one output item across active reload and terminal commit', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-product-stream-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'STREAM_PRODUCT');
    const sessionId = await currentSdkSession(space);
    const output = space.page
      .getByTestId('conversation-render-row')
      .filter({ hasText: 'SDK_PARTIAL' });
    await expect(output).toHaveCount(1, { timeout: 20_000 });
    const itemId = await output.getAttribute('data-msg-id');
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'STREAM_PRODUCT' })
      .first()
      .click();
    await expect(output).toHaveCount(1, { timeout: 20_000 });
    expect(await output.getAttribute('data-msg-id')).toBe(itemId);
    provider.release('STREAM_PRODUCT');
    await waitSdkIdle(space, sessionId);
    await expect(output).toHaveCount(1);
    await expect(output).toContainText('SDK_PARTIAL:SDK_FINAL');
    expect(await output.getAttribute('data-msg-id')).toBe(itemId);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('SDK Artifact tools keep their inline result after reload', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-product-artifact-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'SDK_ARTIFACT');
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const stream = space.page.getByTestId('conversation-stream');
    await expect(stream).toContainText('SDK artifact output');
    await expect(stream.getByText('SDK artifact output', { exact: true })).toHaveCount(1);
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_ARTIFACT' })
      .first()
      .click();
    await expect(stream).toContainText('SDK artifact output', { timeout: 20_000 });
    await expect(stream.getByText('SDK artifact output', { exact: true })).toHaveCount(1);
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('SDK user images retain safe thumbnails and full previews across reload', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `sdk-product-image-${Date.now()}`,
    provider.url,
  );
  try {
    const imagePath = path.join(projectRoot, 'product.png');
    await writeFile(
      imagePath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await space.page.getByTestId('file-attachment-input').setInputFiles(imagePath);
    await space.page.locator('textarea').first().fill('SDK_IMAGE');
    await expect(
      space.page.getByRole('button', { name: 'Send message', exact: true }),
    ).toBeEnabled();
    await space.page.locator('textarea').first().press('Enter');
    const sessionId = await currentSdkSession(space);
    let latestImageView: unknown;
    try {
      await expect
        .poll(
          async () => {
            const result = await space.page.evaluate(
              (id) => window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id }),
              sessionId,
            );
            latestImageView = result;
            return (
              result.ok &&
              result.data?.items.some(
                (item) =>
                  item.type === 'user' &&
                  item.imageAttachments?.some((image) => image.status === 'available'),
              )
            );
          },
          { timeout: 20_000 },
        )
        .toBe(true);
    } catch (error) {
      await test.info().attach('sdk-image-view.json', {
        body: JSON.stringify({
          view: latestImageView,
          requests: provider.requests,
          errors: provider.errors,
        }),
        contentType: 'application/json',
      });
      throw error;
    }
    await waitSdkIdle(space, sessionId);
    const imageFacts = await space.page.evaluate(
      async (id) => ({
        view: await window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id }),
        history: await window.kodaxSpace!.invoke('session.history', {
          sessionId: id,
          requestId: crypto.randomUUID(),
          expectedSurface: 'code',
        }),
      }),
      sessionId,
    );
    await test.info().attach('sdk-image-display.json', {
      body: JSON.stringify(imageFacts),
      contentType: 'application/json',
    });
    const thumbnail = space.page.getByTestId('user-image-thumbnail');
    await expect(thumbnail).toHaveCount(1);
    await expect(thumbnail.locator('img')).toHaveAttribute(
      'src',
      /^app:\/\/space\/session-attachment\//,
    );
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_IMAGE' })
      .first()
      .click();
    await expect(thumbnail).toHaveCount(1, { timeout: 20_000 });
    await thumbnail.click();
    await expect(space.page.getByTestId('file-viewer').locator('img')).toHaveAttribute(
      'src',
      /^app:\/\/space\/session-attachment\/.+variant=original$/,
    );
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});

test('real SDK items replace live output, survive reload, and retain repeated distinct input intents', async () => {
  const provider = await createLocalSdkProvider();
  const { space, projectRoot } = await launchRealSdkSpace(
    `sdk-product-output-${Date.now()}`,
    provider.url,
  );
  const errors: string[] = [];
  space.page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  space.page.on('pageerror', (error) => errors.push(error.message));
  try {
    const attachment = path.join(projectRoot, 'material.txt');
    await writeFile(attachment, 'Fixture material');
    const prompt = `ONE_DISPLAY_INTENT\n\n@${attachment}`;
    await sendSdkPrompt(space, prompt);
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const readView = () =>
      space.page.evaluate(async (id) => {
        const result = await window.kodaxSpace!.invoke('session.productSnapshot', {
          sessionId: id,
        });
        if (!result.ok || !result.data) throw new Error('Official product view unavailable: '+JSON.stringify(result));
        return result.data;
      }, sessionId);
    await expect
      .poll(async () => (await readView()).items.filter((item) => item.type === 'assistant').length)
      .toBe(1);
    let view = await readView();
    expect(view.items.filter((item) => item.type === 'user')).toHaveLength(1);
    for (const item of view.items.filter(
      (item) => item.type === 'user' || item.type === 'assistant',
    )) {
      await expect(space.page.locator(`[data-msg-id="${item.id}"]`)).toHaveCount(1);
    }
    await expect(
      space.page
        .getByTestId('conversation-render-row')
        .filter({ hasText: 'SDK_REPLY:ONE_DISPLAY_INTENT' }),
    ).toHaveCount(1);
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'ONE_DISPLAY_INTENT' })
      .first()
      .click();
    try {
      await expect(
        space.page
          .getByTestId('conversation-render-row')
          .filter({ hasText: 'SDK_REPLY:ONE_DISPLAY_INTENT' }),
      ).toHaveCount(1);
    } catch (error) {
      const facts = await space.page.evaluate(async (id) => {
        const history = await window.kodaxSpace!.invoke('session.history', {
          sessionId: id,
          requestId: crypto.randomUUID(),
          expectedSurface: 'code',
        });
        const view = await window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id });
        const profile = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
        return { history, view, profile };
      }, sessionId);
      await test.info().attach('product-reload-diagnostics.json', {
        body: JSON.stringify({ errors, facts }),
        contentType: 'application/json',
      });
      throw error;
    }
    await sendSdkPrompt(space, prompt);
    await waitSdkIdle(space, sessionId);
    await expect
      .poll(async () => (await readView()).items.filter((item) => item.type === 'user').length)
      .toBe(2);
    view = await readView();
    expect(
      new Set(view.items.filter((item) => item.type === 'user').map((item) => item.inputId)).size,
    ).toBe(2);
    await expect(
      space.page
        .getByTestId('conversation-render-row')
        .filter({ hasText: 'SDK_REPLY:ONE_DISPLAY_INTENT' }),
    ).toHaveCount(2);
    await space.page.keyboard.press('Control+f');
    await space.page
      .getByTestId('transcript-search-bar')
      .locator('input')
      .fill('ONE_DISPLAY_INTENT');
    await expect(space.page.getByTestId('sdk-history-search-result').first()).toBeVisible();
    await space.page.getByTestId('sdk-history-search-result').first().click();
    await expect(space.page.getByTestId('sdk-history-search-body')).toContainText(
      'ONE_DISPLAY_INTENT',
    );
    expect(provider.errors).toEqual([]);
  } catch (error) {
    await test.info().attach('first-product-failure.json', {body:JSON.stringify({error:String(error),requests:provider.requests,errors}),contentType:'application/json'});
    throw error;
  } finally {
    await provider.close();
    await space.close();
  }
});

test('real SDK bounded output restores the complete immutable body through its public item reader', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`sdk-product-body-${Date.now()}`, provider.url);
  try {
    await sendSdkPrompt(space, 'LONG_PRODUCT_BODY');
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);
    const stream = space.page.getByTestId('conversation-stream');
    await expect(stream).toContainText('SDK_LONG_HEAD', { timeout: 20_000 });
    await expect(stream).toContainText('SDK_LONG_TAIL');
    await space.page.reload();
    await space.page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'LONG_PRODUCT_BODY' })
      .first()
      .click();
    await expect(stream).toContainText('SDK_LONG_HEAD', { timeout: 20_000 });
    await expect(stream).toContainText('SDK_LONG_TAIL');
  } catch (error) {
    const sessionId = await currentSdkSession(space);
    const state = await Promise.race([space.page.evaluate(async id => ({
      live: await window.kodaxSpace!.invoke('session.liveSnapshot', {sessionId:id}),
      profile: await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined),
    }), sessionId), new Promise(resolve => setTimeout(() => resolve({diagnosticTimeout:true}),5000))]).catch(error => ({captureError:String(error)}));
    await test.info().attach('public-failure-state.json', {body: JSON.stringify({state, requests:provider.requests}), contentType:'application/json'});
    throw error;
  } finally {
    await provider.close();
    await space.close();
  }
});
