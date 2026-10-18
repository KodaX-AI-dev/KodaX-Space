import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ClientExitReceipt } from '@kodax-ai/kodax/client';
import { expect, test } from '@playwright/test';
import type {
  ChannelOutput,
  IpcError,
  IpcResult,
  SessionProductView,
} from '@kodax-space/space-ipc-schema';
import { launchSpace, type SpaceInstance } from './fixtures.js';
import { readProductItemText } from '../../apps/desktop/renderer/src/lib/productItemContent.js';

interface WireMessage {
  role: string;
  content?: unknown;
}

export async function createLocalSdkProvider() {
  const requests: string[] = [];
  const pending = new Map<string, ServerResponse>();
  const errors: string[] = [];
  let projectRoot = '';
  const reply = (response: ServerResponse, content: string, tools?: unknown[]) => {
    if (!response.headersSent) response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(
      `data: ${JSON.stringify({
        id: 'space-e2e',
        object: 'chat.completion.chunk',
        model: 'space-e2e-model',
        choices: [
          {
            index: 0,
            delta: tools ? { tool_calls: tools } : { content },
            finish_reason: tools ? 'tool_calls' : 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      })}\n\ndata: [DONE]\n\n`,
    );
  };
  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'space-e2e-model' }] }));
      return;
    }
    let body = '';
    for await (const chunk of request) body += String(chunk);
    const parsed = JSON.parse(body) as {
      messages: WireMessage[];
      tools?: { function?: { name?: string } }[];
    };
    const prompt = String(
      parsed.messages.findLast((message) => message.role === 'user')?.content ?? '',
    );
    requests.push(prompt);
    if (request.headers.authorization !== 'Bearer space-e2e-fixture')
      throw new Error('Main credential was not authorized');
    if (prompt === 'FAIL_PRODUCT') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: {
            message: 'Fixture credential rejected',
            type: 'invalid_api_key',
            code: 'invalid_api_key',
          },
        }),
      );
      return;
    }
    if (prompt === 'LONG_PRODUCT_BODY') {
      reply(response, `SDK_LONG_HEAD\n\n${'x'.repeat(100_000)}\n\nSDK_LONG_TAIL`);
      return;
    }
    if (parsed.tools?.some((tool) => tool.function?.name === 'emit_sidecar_verdict')) {
      reply(response, '', [
        {
          index: 0,
          id: 'e2e-sidecar-verdict',
          type: 'function',
          function: {
            name: 'emit_sidecar_verdict',
            arguments: JSON.stringify({
              verdict: 'accept',
              reason: 'Deterministic local E2E verdict.',
            }),
          },
        },
      ]);
      return;
    }
    if (prompt === 'HOLD_QUEUE' || prompt === 'HOLD_CANCEL') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      pending.set(prompt, response);
      return;
    }
    if (prompt === 'STREAM_PRODUCT') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(
        `data: ${JSON.stringify({
          id: 'space-e2e',
          object: 'chat.completion.chunk',
          model: 'space-e2e-model',
          choices: [{ index: 0, delta: { content: 'SDK_PARTIAL' }, finish_reason: null }],
        })}\n\n`,
      );
      pending.set(prompt, response);
      return;
    }
    if (prompt === 'SDK_ARTIFACT' && parsed.messages.at(-1)?.role !== 'tool') {
      reply(response, '', [
        {
          index: 0,
          id: 'e2e-artifact',
          type: 'function',
          function: {
            name: 'create_artifact',
            arguments: JSON.stringify({
              kind: 'markdown',
              title: 'SDK artifact output',
              content: '# SDK Artifact\n\nComplete deliverable.',
            }),
          },
        },
      ]);
      return;
    }
    if (prompt === 'SDK_TOOLS' && parsed.messages.at(-1)?.role !== 'tool') {
      reply(response, '', [
        {
          index: 0,
          id: 'e2e-write',
          type: 'function',
          function: {
            name: 'write',
            arguments: JSON.stringify({
              path: path.join(projectRoot, 'sdk-created.txt'),
              content: 'REAL_SDK_TOOL_EXECUTION',
            }),
          },
        },
        {
          index: 1,
          id: 'e2e-read',
          type: 'function',
          function: {
            name: 'read',
            arguments: JSON.stringify({ path: path.join(projectRoot, 'README.md') }),
          },
        },
        {
          index: 2,
          id: 'e2e-manual',
          type: 'function',
          function: { name: 'space_manual', arguments: JSON.stringify({ topic: 'overview' }) },
        },
      ]);
      return;
    }
    reply(response, `SDK_REPLY:${prompt}`);
  };
  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      errors.push(error instanceof Error ? error.message : String(error));
      response.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local Provider did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    errors,
    setProject: (value: string) => {
      projectRoot = value;
    },
    release: (marker: string) => {
      for (const [prompt, response] of pending) {
        if (!prompt.includes(marker)) continue;
        pending.delete(prompt);
        if (!response.destroyed)
          reply(response, prompt === 'STREAM_PRODUCT' ? ':SDK_FINAL' : `SDK_REPLY:${prompt}`);
      }
    },
    close: async () => {
      for (const response of pending.values()) response.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

export async function launchRealSdkSpace(
  testId: string,
  baseUrl: string,
  prepareProfile?: (root: string) => Promise<void>,
) {
  const space = await launchSpace(testId, {
    env: { KODAX_FORCE_MOCK: '0', SPACE_TEST_COMPLETE_EXIT_TRIGGER: '1' },
    prepareProfile,
  });
  try {
    const projectRoot = path.join(space.testDataDir, 'project');
    await mkdir(projectRoot, { recursive: true });
    await writeFile(path.join(projectRoot, 'README.md'), '# Local SDK E2E\n');
    const providerId = await space.page.evaluate(async (url) => {
      const added = await window.kodaxSpace!.invoke('provider.addCustom', {
        displayName: 'Local SDK E2E',
        protocol: 'openai',
        baseUrl: url,
        skipBaseUrlValidation: true,
        apiKeyEnv: 'SPACE_ISOLATED_E2E_KEY',
        defaultModel: 'space-e2e-model',
        reasoning: 'none',
        imageInput: true,
        contextWindow: 200_000,
      });
      if (!added.ok) throw new Error(added.error.message);
      const id = added.data.providerId;
      for (const result of [
        await window.kodaxSpace!.invoke('provider.setKey', {
          providerId: id,
          apiKey: 'space-e2e-fixture',
        }),
        await window.kodaxSpace!.invoke('provider.setDefault', { providerId: id }),
        await window.kodaxSpace!.invoke('settings.setRuntimeDefaults', {
          runtimeDefaults: { permissionMode: 'full-access', agentMode: 'ama' },
        }),
      ])
        if (!result.ok) throw new Error(result.error.message);
      return id;
    }, baseUrl);
    await space.seedProject(projectRoot);
    await expect(space.page.locator('textarea').first()).toBeEnabled({ timeout: 15_000 });
    return { space, projectRoot, providerId };
  } catch (error) {
    await space.close();
    throw error;
  }
}

export async function currentSdkSession(space: SpaceInstance) {
  // Sidebar recency is independent of the selected Session (e.g. copied history).
  const sessionId = await space.page
    .getByTestId('conversation-stream')
    .getAttribute('data-session-id');
  if (!sessionId) throw new Error('No current SDK Session');
  return sessionId;
}

export async function sendSdkPrompt(space: SpaceInstance, prompt: string, key = 'Enter') {
  const composer = space.page.locator('textarea').first();
  await composer.fill(prompt);
  await composer.press(key);
  await expect(
    space.page.getByTestId('conversation-stream').getByText(prompt, { exact: true }).last(),
  ).toBeVisible({ timeout: 15_000 });
}

type ReadyHistoryPage = Extract<
  NonNullable<ChannelOutput<'session.history'>['page']>,
  { outcome: 'ready' }
>;

async function readHistoryBoundary(
  space: SpaceInstance,
  sessionId: string,
  previous?: ReadyHistoryPage,
) {
  return space.page.evaluate(
    async ({ id, previous }) =>
      window.kodaxSpace!.invoke('session.history', {
        sessionId: id,
        requestId: crypto.randomUUID(),
        expectedSurface: 'code',
        ...(previous?.nextCursor
          ? {
              cursor: previous.nextCursor,
              revision: previous.revision,
              sourceRevision: previous.sourceRevision,
            }
          : {}),
      }),
    { id: sessionId, previous },
  );
}

export async function readSdkHistoryPage(
  space: SpaceInstance,
  sessionId: string,
  previous?: ReadyHistoryPage,
) {
  if (previous !== undefined && !previous.nextCursor) {
    throw new Error('History continuation has no cursor');
  }
  let history: ChannelOutput<'session.history'> | undefined;
  const outcomes: IpcResult<ChannelOutput<'session.history'>>[] = [];
  try {
    await expect
      .poll(
        async () => {
          const result = await readHistoryBoundary(space, sessionId, previous);
          if (!result.ok) throw new Error(`Saved history unavailable: ${JSON.stringify(result)}`);
          outcomes.push(result);
          if (result.data.page?.outcome === 'ready') {
            history = result.data;
            return true;
          }
          if (previous === undefined && result.data.page?.outcome === 'data_changed') return false;
          throw new Error(`Saved history unavailable: ${JSON.stringify(result)}`);
        },
        { timeout: 5_000 },
      )
      .toBe(true);
  } finally {
    if (outcomes.some((value) => value.ok && value.data.page?.outcome === 'data_changed')) {
      await test.info().attach('history-read-boundaries.json', {
        body: JSON.stringify({ sessionId, outcomes }),
        contentType: 'application/json',
      });
    }
  }
  if (history?.page?.outcome !== 'ready') throw new Error('SDK supplied no ready history page');
  return { ...history, page: history.page };
}

export async function readSdkHistory(space: SpaceInstance, sessionId: string) {
  const raw = await readSdkHistoryPage(space, sessionId);
  if (!raw.productItems) throw new Error('Coder history did not use the SDK product display');
  const history = { ...raw, items: raw.productItems };
  const items = await Promise.all(
    history.items.map(async (item) => {
      const read = async (part: 'text' | 'input', offset: number) => {
        const result = await space.page.evaluate(
          (args) => window.kodaxSpace!.invoke('session.productItem', args),
          { sessionId, itemId: item.id, source: 'history' as const, part, offset },
        );
        if (!result.ok) throw new Error(result.error.message);
        return result.data;
      };
      const text = await readProductItemText(
        item,
        (offset) => read('text', offset),
        'text',
        'history',
      );
      const inputText = item.tool
        ? await readProductItemText(item, (offset) => read('input', offset), 'input', 'history')
        : undefined;
      return { ...item, text, ...(item.tool ? { tool: { ...item.tool, inputText } } : {}) };
    }),
  );
  return { ...history, items };
}

export async function waitSdkIdle(space: SpaceInstance, sessionId: string) {
  await expect
    .poll(
      async () => {
        const result = await space.page.evaluate(
          (id) => window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId: id }),
          sessionId,
        );
        if (!result.ok) return result.error.message;
        return (
          (!result.data.activeRun ||
            ['completed', 'cancelled', 'interrupted', 'failed'].includes(
              result.data.activeRun.phase,
            )) &&
          !result.data.queuedInputs?.length
        );
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

/** A read may race a canonical writer; retry reads only, preserving the first conflict. */
export async function readSdkProductView(space: SpaceInstance, sessionId: string) {
  let view: SessionProductView | undefined;
  const conflicts: IpcError[] = [];
  try {
    await expect
      .poll(
        async () => {
          const result = await space.page.evaluate(
            (id) => window.kodaxSpace!.invoke('session.productSnapshot', { sessionId: id }),
            sessionId,
          );
          if (result.ok) {
            if (!result.data) throw new Error('SDK supplied no product view');
            view = result.data;
            return 'ready';
          }
          conflicts.push(result.error);
          if (
            result.error.code !== 'HANDLER_ERROR' ||
            !/^\[session\.productSnapshot\] handler threw: Session data changed during the read boundary: [a-f0-9]{64}\.lock$/.test(
              result.error.message,
            )
          )
            throw new Error(result.error.message);
          return result.error.message;
        },
        { timeout: 5_000 },
      )
      .toBe('ready');
  } finally {
    if (conflicts.length > 0)
      await test.info().attach('product-read-conflicts.json', {
        body: JSON.stringify({ sessionId, conflicts }),
        contentType: 'application/json',
      });
  }
  if (!view) throw new Error('SDK supplied no product view');
  return view;
}

/** A fresh reader scopes the SDK's module-level config home to this profile. */
export async function readPublicSpaceExit(space: SpaceInstance) {
  // macOS authorizes this test identity's creator executable. Keep the same
  // binary for offline recovery rather than requesting Node's GUI consent.
  const useCreatorBinary = process.platform === 'darwin';
  const { stdout } = await promisify(execFile)(
    useCreatorBinary ? space.executablePath : process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { readFile } from 'node:fs/promises';
    import path from 'node:path';
    const root = process.argv[1];
    const identity = JSON.parse(await readFile(path.join(root, 'space/runtime-client-identity.json'), 'utf8')).exitRecovery;
    if (!identity) throw new Error('Space did not preserve its accepted exit identity.');
    const imported = await import('@napi-rs/keyring/keytar.js');
    const keyring = imported.default ?? imported;
    const secret = await keyring.getPassword('kodax-space-test-runtime', identity.secretAccount);
    if (!secret) throw new Error('Isolated exit credential is unavailable.');
    const { readKodaXClientExits } = await import('@kodax-ai/kodax/client');
    const receipts = await readKodaXClientExits({profile:identity.profile ?? 'coder', clientInfo:{
      instanceId:identity.instanceId, instanceSecret:secret,
    }});
    const receipt = receipts.find(item => item.requestId === identity.requestId && item.runtimeId === identity.runtimeId);
    if (!receipt) throw new Error('Accepted Space exit has no matching public receipt.');
    process.stdout.write(JSON.stringify(receipt));
  `,
      space.testDataDir,
    ],
    {
      windowsHide: true,
      timeout: 15_000,
      env: {
        ...process.env,
        KODAX_HOME: space.testDataDir,
        ...(useCreatorBinary ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      },
    },
  );
  return JSON.parse(stdout) as ClientExitReceipt;
}
