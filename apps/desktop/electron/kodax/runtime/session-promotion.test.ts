import assert from 'node:assert/strict';
import test from 'node:test';
import type { KodaXDaemonRuntime, RuntimeSessionPromotionResult } from '@kodax-ai/kodax/runtime';
import { promoteHostSession } from './session-promotion.js';

test('Quick Ask recovers a committed promotion after response loss with the original operation and Session', async () => {
  let receipt: RuntimeSessionPromotionResult | null = null;
  let calls = 0;
  const runtime = {
    capabilities: { sessionPromotion: { version: 1 } },
    sessions: {
      load: async () => ({
        id: 'promotion-lost',
        metadataRevision: 'before',
        tag: 'space-ephemeral',
      }),
      readPromotion: async () => receipt,
      promote: async (input: {
        sessionId: string;
        requestId: string;
        expectedRevision: string;
        tag: string;
      }) => {
        calls++;
        assert.equal(input.expectedRevision, 'before');
        receipt = {
          requestId: input.requestId,
          session: { id: input.sessionId, title: 'Answer', tag: input.tag },
        };
        throw Object.assign(new Error('Response lost'), { code: 'disconnected' });
      },
    },
  } as unknown as KodaXDaemonRuntime;
  const first = await promoteHostSession(runtime, 'promotion-lost', 'code');
  assert.equal(first.session.id, 'promotion-lost');
  assert.equal(first.session.tag, 'code');
  assert.deepEqual(await promoteHostSession(runtime, 'promotion-lost', 'code'), first);
  assert.equal(calls, 1);
  await assert.rejects(promoteHostSession(runtime, 'promotion-lost', 'partner'));
});

test('Quick Ask keeps the original intent on busy/conflict and rejects an old Host', async () => {
  let request: unknown;
  const runtime = {
    capabilities: { sessionPromotion: { version: 1 } },
    sessions: {
      load: async () => ({
        id: 'promotion-busy',
        metadataRevision: 'original',
        tag: 'space-ephemeral',
      }),
      readPromotion: async () => null,
      promote: async (input: unknown) => {
        if (request) assert.deepEqual(input, request);
        request = input;
        throw Object.assign(new Error('Busy'), { code: 'conflict' });
      },
    },
  } as unknown as KodaXDaemonRuntime;
  await assert.rejects(promoteHostSession(runtime, 'promotion-busy', 'code'), { code: 'conflict' });
  await assert.rejects(promoteHostSession(runtime, 'promotion-busy', 'code'), { code: 'conflict' });
  await assert.rejects(
    promoteHostSession({ capabilities: {} } as KodaXDaemonRuntime, 'promotion-old', 'code'),
    { code: 'daemon_upgrade_required' },
  );
});
