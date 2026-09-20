import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createProviderCredentialLeaseScope,
  deriveCurrentProviderCredentialLeaseScope,
  getScopedProviderCredential,
  runWithProviderCredential,
  runWithProviderCredentialLeaseScope,
  withProviderRequestCredential,
} from '@kodax-ai/kodax/llm';
import {
  runDetachedWorkflowWithProviderCredentialLease,
  runWithExactProviderCredential,
  runWithSpaceProviderCredentialLease,
} from '../providers/credential-scope.js';
import { wrapSdkError } from '../kodax/sdk-errors.js';

for (const name of ['TimeoutError', 'AbortError']) {
  for (const nested of [false, true]) {
    test(`released SDK preserves ${name} through a Space child lease (nested=${nested})`, async () => {
      const secret = 'synthetic-space-credential';
      const native = new DOMException(`Operation ended: ${secret}`, name);
      const original = nested
        ? new Error(`Provider failed: ${secret}`, { cause: new Error('Request failed', { cause: native }) })
        : native;
      Object.defineProperty(native, 'cause', { value: original, configurable: true });
      const operation = runWithSpaceProviderCredentialLease('provider-a', async () => {
        const child = deriveCurrentProviderCredentialLeaseScope(['provider-a']);
        assert.ok(child);
        try {
          return await runWithProviderCredentialLeaseScope(child, () =>
            withProviderRequestCredential('provider-a', 'primary', undefined, async () => {
              assert.equal(getScopedProviderCredential('provider-a'), secret);
              throw original;
            }),
          );
        } finally {
          child.close();
        }
      }, {
        readProviderCredential: async () => secret,
        listProviderCredentialIds: async () => [],
        createProviderCredentialLeaseScope,
        runWithProviderCredentialLeaseScope,
      });
      await assert.rejects(operation, (error: unknown) => {
        assert.ok(error instanceof Error);
        const redactedNative = nested ? (error.cause as Error).cause : error;
        assert.ok(redactedNative instanceof DOMException);
        assert.equal(redactedNative.name, name);
        assert.equal(redactedNative.code, name === 'TimeoutError' ? 23 : 20);
        assert.equal(redactedNative.message, 'Operation ended: [REDACTED_CREDENTIAL]');
        assert.equal(Reflect.get(redactedNative, 'cause'), error);
        assert.ok(!String(redactedNative).includes(secret));
        assert.equal(typeof redactedNative.stack, 'string');
        assert.ok(!redactedNative.stack?.includes(secret));
        const wrapped = wrapSdkError(error);
        assert.equal(wrapped.category, name === 'TimeoutError' ? 'network' : 'cancelled');
        assert.equal(wrapped.retriable, true);
        assert.ok(!wrapped.userMessage.includes(secret));
        assert.ok(!wrapped.debugMessage.includes(secret));
        return true;
      });
      assert.equal(native.message, `Operation ended: ${secret}`);
      assert.equal(getScopedProviderCredential('provider-a'), undefined);
    });
  }
}

test('an exact Space credential remains scoped across asynchronous work', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const operation = runWithExactProviderCredential(
    'provider-a',
    async () => {
      await gate;
      return getScopedProviderCredential('provider-a');
    },
    {
      readProviderCredential: async () => 'credential-a',
      runWithProviderCredential,
    },
  );
  release();

  assert.equal(await operation, 'credential-a');
  assert.equal(getScopedProviderCredential('provider-a'), undefined);
});

test('keychain credential wins and remains scoped when a real external env also exists', async () => {
  const calls: string[] = [];
  const result = await runWithExactProviderCredential(
    'anthropic',
    () => {
      calls.push('operation');
      return 'done';
    },
    {
      readProviderCredential: async () => 'keychain-secret',
      runWithProviderCredential: (provider, credential, operation) => {
        calls.push(`${provider}:${credential}`);
        return operation();
      },
    },
  );

  assert.equal(result, 'done');
  assert.deepEqual(calls, ['anthropic:keychain-secret', 'operation']);
});

test('an exact scope ends when a detached handle is returned', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const handle = await runWithExactProviderCredential(
    'provider-a',
    () => ({
      done: (async () => {
        await gate;
        return getScopedProviderCredential('provider-a');
      })(),
    }),
    {
      readProviderCredential: async () => 'credential-a',
      runWithProviderCredential,
    },
  );
  release();

  assert.equal(await handle.done, undefined);
});

test('a Space operation lazily resolves every allowed Provider identity inside one lease', async () => {
  const reads: string[] = [];

  const result = await runWithSpaceProviderCredentialLease(
    'provider-a',
    async () => {
      const primary = await withProviderRequestCredential('provider-a', 'primary', undefined, () =>
        getScopedProviderCredential('provider-a'),
      );
      const fallback = await withProviderRequestCredential(
        'provider-b',
        'fallback',
        undefined,
        () => getScopedProviderCredential('provider-b'),
      );
      return { primary, fallback };
    },
    {
      readProviderCredential: async (provider) => {
        reads.push(provider);
        return `credential-${provider}`;
      },
      listProviderCredentialIds: async () => ['provider-b'],
      createProviderCredentialLeaseScope,
      runWithProviderCredentialLeaseScope,
    },
  );

  assert.deepEqual(result, {
    primary: 'credential-provider-a',
    fallback: 'credential-provider-b',
  });
  assert.deepEqual(reads, ['provider-a', 'provider-b']);
});

test('a detached Workflow gets a lazy derived credential lease until done settles', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let releaseLateRequest!: () => void;
  const lateRequestGate = new Promise<void>((resolve) => {
    releaseLateRequest = resolve;
  });
  const attributions: unknown[] = [];
  let lateRequest!: Promise<unknown>;

  const handle = await runDetachedWorkflowWithProviderCredentialLease(
    'provider-a',
    'workflow-a',
    () => {
      const done = (async () => {
        await gate;
        return await withProviderRequestCredential('provider-a', 'primary', undefined, () =>
          getScopedProviderCredential('provider-a'),
        );
      })();
      lateRequest = (async () => {
        await lateRequestGate;
        return await withProviderRequestCredential('provider-a', 'primary', undefined, () =>
          getScopedProviderCredential('provider-a'),
        );
      })();
      return { done };
    },
    {
      readProviderCredential: async () => 'credential-a',
      listProviderCredentialIds: async () => [],
      createProviderCredentialLeaseScope,
      deriveCurrentProviderCredentialLeaseScope,
      runWithProviderCredentialLeaseScope,
      onAcquire: (attribution) => attributions.push(attribution),
    },
  );
  release();

  assert.equal(await handle.done, 'credential-a');
  assert.deepEqual(attributions, [{ kind: 'workflow', workflowRunId: 'workflow-a' }]);
  releaseLateRequest();
  await assert.rejects(lateRequest, /credential lease scope is no longer active/i);
});

test('an absent exact credential fails closed before the Provider operation starts', async () => {
  let operated = false;
  await assert.rejects(
    runWithExactProviderCredential(
      'provider-a',
      () => {
        operated = true;
        return 'missing-path';
      },
      {
        readProviderCredential: async () => undefined,
        runWithProviderCredential,
      },
    ),
    /no exact Space credential/i,
  );

  assert.equal(operated, false);
});

test('an external env credential is exact-scoped for the full asynchronous operation', async () => {
  const calls: string[] = [];
  const value = await runWithExactProviderCredential('provider-a', () => 'external-env-path', {
    readProviderCredential: async () => 'external-credential',
    runWithProviderCredential: (provider, credential, operation) => {
      calls.push(`${provider}:${credential}`);
      return operation();
    },
  });

  assert.equal(value, 'external-env-path');
  assert.deepEqual(calls, ['provider-a:external-credential']);
});

test('an external env credential is scoped when Space currently manages the same env name', async () => {
  const calls: string[] = [];
  const value = await runWithExactProviderCredential('provider-b', () => 'external-env-path', {
    readProviderCredential: async () => 'external-credential-b',
    runWithProviderCredential: (provider, credential, operation) => {
      calls.push(`${provider}:${credential}`);
      return operation();
    },
  });

  assert.equal(value, 'external-env-path');
  assert.deepEqual(calls, ['provider-b:external-credential-b']);
});
