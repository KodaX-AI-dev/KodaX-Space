import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { SpaceInstance } from './fixtures.js';
import { listenFetchableLoopback } from '../../apps/desktop/electron/loopback-http.js';
import { stopOwnedTestDaemon } from './fixture-daemon-cleanup.js';

interface ToolAction {
  readonly name: string;
  readonly input: Record<string, unknown>;
}
export interface ContractRequest {
  readonly prompt: string;
  readonly model: string;
  readonly tools: string[];
  readonly results: string[];
}

interface WireRequest {
  model: string;
  messages: { role: string; content: unknown }[];
  tools?: { function?: { name?: string } }[];
}
interface FixtureState {
  plans: Readonly<Record<string, readonly ToolAction[]>>;
  requests: ContractRequest[];
  steps: Map<string, number>;
}

function nextAction(wire: WireRequest, state: FixtureState) {
  const tools = (wire.tools ?? []).map((tool) => tool.function?.name ?? '');
  const prompt = String(
    wire.messages.findLast((message) => message.role === 'user')?.content ?? '',
  );
  const index = state.steps.get(prompt) ?? 0;
  let action: ToolAction | undefined;
  if (tools.includes('emit_sidecar_verdict'))
    action = {
      name: 'emit_sidecar_verdict',
      input: { verdict: 'accept', reason: 'Local contract fixture.' },
    };
  else if (tools.includes('commit_episode_learning_review'))
    action = {
      name: 'commit_episode_learning_review',
      input: {
        memoryPlan: { actions: [], warnings: [] },
        capabilityDecision: { disposition: 'discard', reasonCodes: ['fixture'] },
      },
    };
  else {
    const results = wire.messages
      .filter((message) => message.role === 'tool')
      .map((message) => String(message.content));
    state.requests.push({ prompt, model: wire.model, tools, results });
    state.steps.set(prompt, index + 1);
    action = state.plans[prompt]?.[index];
  }
  return { prompt, index, action };
}

async function respond(request: IncomingMessage, response: ServerResponse, state: FixtureState) {
  if (request.method === 'GET') {
    response.end(JSON.stringify({ data: [] }));
    return;
  }
  let body = '';
  for await (const chunk of request) body += String(chunk);
  const wire = JSON.parse(body) as WireRequest;
  const { prompt, index, action } = nextAction(wire, state);
  const delta = action
    ? {
        tool_calls: [
          {
            index: 0,
            id: `contract-${index}`,
            type: 'function',
            function: { name: action.name, arguments: JSON.stringify(action.input) },
          },
        ],
      }
    : { content: `CONTRACT_DONE:${prompt}` };
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(
    `data: ${JSON.stringify({
      id: 'contract',
      object: 'chat.completion.chunk',
      model: wire.model,
      choices: [{ index: 0, delta, finish_reason: action ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    })}\n\ndata: [DONE]\n\n`,
  );
}

/** Deterministic model responses; tools, permissions and persistence run in the real SDK. */
export async function createContractProvider(plans: FixtureState['plans']) {
  const requests: ContractRequest[] = [];
  const errors: string[] = [];
  const state: FixtureState = { plans, requests, steps: new Map() };
  const server = createServer((request, response) => {
    void respond(request, response, state).catch((error) => {
      errors.push(String(error));
      response.writeHead(500);
      response.end('Contract fixture failed');
    });
  });
  const address = await listenFetchableLoopback(server, AbortSignal.timeout(2_000));
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    errors,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await writeFile(
        test.info().outputPath('contract-provider.json'),
        JSON.stringify({ requests, errors }, null, 2),
      );
    },
  };
}

export async function restartIsolatedHost(space: SpaceInstance) {
  const connection = () =>
    space.page.evaluate(async () => {
      const reply = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
      if (!reply.ok) throw new Error(reply.error.message);
      return reply.data.connection;
    });
  const before = await connection();
  expect(await stopOwnedTestDaemon(space.testDataDir)).toBe(true);
  let after = before;
  try {
    await expect
      .poll(
        async () => {
          after = await connection();
          return after.state === 'ready' && after.runtimeId !== before.runtimeId;
        },
        { timeout: 45_000 },
      )
      .toBe(true);
  } finally {
    await writeFile(
      test.info().outputPath('host-restart.json'),
      JSON.stringify({ before, after }, null, 2),
    );
  }
  return after;
}
