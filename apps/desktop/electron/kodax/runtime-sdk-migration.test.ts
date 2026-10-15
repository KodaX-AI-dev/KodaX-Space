import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {
  RuntimeHostAdapter,
  assertSpaceRuntimeSdkRequiredCapabilities,
} from './runtime-host-adapter.js';
import { readRuntimeSessionView } from './runtime/runtime-view-read.js';
import { workflowPolicyStore } from './workflow-policy.js';
import { RuntimeClientIdentityStore } from './runtime/runtime-client-identity.js';
import { settleRuntimeClientExit } from './runtime/runtime-client-exit.js';
import { RuntimeInputAuthorizationStore } from './runtime/runtime-input-authorization-store.js';

test('Space accepts the installed unified SDK capability contract', async () => {
  const sdk = await import('@kodax-ai/kodax/runtime');
  assert.doesNotThrow(() => assertSpaceRuntimeSdkRequiredCapabilities(sdk));
});

test(
  'Space submits a stable product input and retains its canonical identity',
  { timeout: 60_000 },
  async () => {
    const homeDir = await mkdtemp(path.join(os.tmpdir(), 'space-product-input-'));
    const projectRoot = path.join(homeDir, 'project');
    await mkdir(projectRoot);
    let release!: () => void;
    let entered!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const wire = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += String(chunk);
      assert.equal(request.headers.authorization, 'Bearer offline-fixture');
      if (body.includes('HOLD_SPACE_INPUT')) {
        entered();
        await hold;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(
        'data: ' +
          JSON.stringify({
            id: 'fixture',
            object: 'chat.completion.chunk',
            model: 'fixture',
            choices: [
              { index: 0, delta: { content: 'Offline Space reply' }, finish_reason: 'stop' },
            ],
          }) +
          '\n\ndata: [DONE]\n\n',
      );
    });
    await new Promise<void>((resolve) => wire.listen(0, '127.0.0.1', resolve));
    const address = wire.address();
    assert.ok(address && typeof address !== 'string');
    const sdk = await import('@kodax-ai/kodax/runtime');
    let attached: Awaited<ReturnType<typeof sdk.ensureKodaXRuntime>> | undefined;
    const startupStages: string[] = [];
    const secrets = new Map<string, string>();
    const identityStore = new RuntimeClientIdentityStore(
      path.join(homeDir, '.kodax', 'space', 'identity.json'),
      undefined,
      undefined,
      {
        read: async (account) => secrets.get(account),
        write: async (account, secret) => {
          secrets.set(account, secret);
        },
      },
    );
    let extraProvider = false;
    const createAdapter = () =>
      new RuntimeHostAdapter({
        mode: 'runtime',
        profileRoot: path.join(homeDir, '.kodax'),
        runtimeHomeDir: homeDir,
        identityStore,
        inputAuthorizationStore: new RuntimeInputAuthorizationStore(
          path.join(homeDir, '.kodax', 'space', 'input-authorizations'),
        ),
        credentialResolver: async () => 'offline-fixture',
        credentialProvidersResolver: async () => (extraProvider ? ['openai'] : []),
        runtimeFactory: async ({ autoStart: _autoStart, ...options }) => {
          const launcherOptions = {
            ...options,
            onStartupProgress: (
              progress: import('@kodax-ai/kodax/client').ClientStartupProgress,
            ) => {
              startupStages.push(progress.stage);
              options.onStartupProgress?.(progress);
            },
          };
          attached = _autoStart
            ? await sdk.ensureKodaXRuntime(launcherOptions)
            : await sdk.connectKodaXRuntime(launcherOptions);
          await attached.catalog.upsertCustomProvider({
            name: 'space-offline',
            protocol: 'openai',
            model: 'fixture',
            apiKeyEnv: 'SPACE_NO_AMBIENT_TEST_KEY',
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
          });
          return attached;
        },
      });
    let adapter = createAdapter();
    try {
      await adapter.initialize();
      assert.ok(startupStages.includes('checking'));
      assert.ok(startupStages.includes('connecting'));
      assert.equal(startupStages.at(-1), 'ready');
      const skills = await attached!.catalog.skills({ projectRoot });
      assert.ok(skills.some((skill) => skill.name === 'visual-review'));
      assert.equal('verifierLog' in (await attached!.config.readEffective()).entries, false);
      const sessionId = await adapter.createSession({
        projectRoot,
        surface: 'code',
        ephemeral: false,
      });
      await adapter.updateSessionSettings(sessionId, {
        provider: 'space-offline',
        model: 'fixture',
        agentMode: 'sa',
        permissionMode: 'full-access',
      });
      assert.equal((await attached!.sessions.list({ projectRoot })).length, 0,
        'unsubmitted Coder drafts and their settings must not appear in persisted history');
      assert.equal((await attached!.sessions.load(sessionId)).id, sessionId,
        'the unsubmitted draft remains observable through the Host');
      const input = {
        sessionId,
        inputId: 'stable-space-input',
        prompt: 'Offline query',
        options: { provider: 'space-offline', agentMode: 'sa' as const },
      };
      const handle = await adapter.startManagedRun(input);
      assert.equal((await handle.result).phase, 'completed');
      const hostConfig = (await attached!.config.read()) as {
        workflow?: { maxConcurrency?: number };
      };
      assert.equal(hostConfig.workflow?.maxConcurrency, workflowPolicyStore.get().maxConcurrency);
      const page = await attached!.sessions.readHistory(sessionId);
      assert.deepEqual(
        page.items.filter((item) => item.type === 'user').map((item) => [item.inputId, item.text]),
        [['stable-space-input', 'Offline query']],
      );
      const statistics = await adapter.readSessionStatistics(sessionId);
      assert.ok(statistics.physicalRequestCount >= 1);
      assert.ok(statistics.requestsWithoutUsage >= 1, 'missing Provider usage stays explicit');
      const requests = await adapter.readSessionExecutionFacts({ sessionId, kind: 'requests' });
      assert.ok(
        requests.items.some(
          (item) => item.target.kind === 'run' && item.target.runId === handle.runId,
        ),
      );
      const manual = await adapter.startManagedRun({
        sessionId,
        inputId: 'space-manual-input',
        prompt: 'Space manual',
        options: { toolInvocation: { name: 'space_manual', input: { topic: 'overview' } } },
      });
      assert.equal((await manual.result).phase, 'completed');
      const manualView = await readRuntimeSessionView(attached!.sessions, sessionId);
      assert.ok(
        manualView.items.some(
          (item) =>
            item.sourceRunId === manual.runId &&
            item.type === 'tool' &&
            item.text.includes('KodaX Space'),
        ),
      );
      await verifyRuntimePngAttachment(attached!, adapter, sessionId, projectRoot);
      await adapter.updateSessionSettings(sessionId, { agentMode: 'ama' });
      const active = await adapter.startManagedRun({
        ...input,
        inputId: 'active-space-input',
        prompt: 'HOLD_SPACE_INPUT',
      });
      void active.result.catch(() => undefined); // Cleanup may detach after an earlier assertion fails.
      await held;
      const steering = await adapter.submitInput({
        sessionId,
        afterRunId: active.runId,
        inputId: 'steer-space-input',
        delivery: 'interrupt',
        input: { type: 'text', text: 'Steer this Run' },
      });
      assert.equal(steering.accepted, true);
      assert.equal(steering.runId, active.runId);
      const queued = await adapter.submitInput({
        sessionId,
        afterRunId: active.runId,
        inputId: 'queued-space-input',
        delivery: 'after_turn',
        input: { type: 'text', text: 'Queued query' },
      });
      assert.equal(queued.accepted, true);
      assert.equal(queued.inputId, 'queued-space-input');
      assert.equal(queued.runId, undefined, 'queue acceptance must not invent a future Run');
      const live = await adapter.readSessionLiveSnapshot(sessionId);
      assert.ok(
        live.queuedInputs.some((item) => item.inputId === 'queued-space-input'),
        JSON.stringify({
          queue: (await readRuntimeSessionView(attached!.sessions, sessionId)).queue,
          live: live.queuedInputs,
          active: live.activeRun,
          acceptance: queued,
        }),
      );
      await adapter.close();
      extraProvider = true;
      adapter = createAdapter();
      await adapter.initialize(undefined, false);
      const duplicate = await adapter.startManagedRun(input);
      assert.equal(
        duplicate.runId,
        handle.runId,
        'reattachment must not submit an accepted input again',
      );
      assert.equal((await duplicate.result).phase, 'completed');
      const restoredSteer = await adapter.submitInput({
        sessionId,
        afterRunId: active.runId,
        inputId: 'reattached-steer',
        delivery: 'interrupt',
        input: { type: 'text', text: 'Continue with the captured authority' },
      });
      assert.ok(restoredSteer.accepted);
      assert.equal(
        restoredSteer.runId,
        active.runId,
        'original allowlist survives Main reconstruction',
      );
      release();
      await attached!.runs.await(active.runId);
      const clientSdk = await import('@kodax-ai/kodax/client');
      const peerInfo = {
        name: 'space-peer-fixture',
        instanceId: 'peer-stable-fixture',
        instanceSecret: 'peer-stable-secret-fixture-0123456789',
      };
      const peer = await clientSdk.connectKodaXClient({
        homeDir,
        profile: 'coder',
        clientInfo: peerInfo,
      });
      try {
        const oldIdentity = await identityStore.openInstance({ name: 'Space', version: 'fixture' });
        assert.ok(attached!.lifecycle);
        const requestExit = attached!.lifecycle.requestExit.bind(attached!.lifecycle);
        attached!.lifecycle.requestExit = async (input) => {
          await requestExit(input);
          throw new Error('Exit acknowledgement lost after Host acceptance.');
        };
        await assert.rejects(adapter.stopDaemonForCompleteExit(), /recovery relaunch required/);
        await adapter.close(); // Simulate the Main process dying before its lost ACK can be handled.
        assert.equal(
          (await identityStore.openInstance({ name: 'Space', version: 'fixture' })).instanceId,
          oldIdentity.instanceId,
          'response loss delays Main identity rotation until offline evidence',
        );
        const peerObservation = await peer.sessions.observe(sessionId, (view) => {
          assert.equal(view.session.id, sessionId, 'Space exit protects an online peer');
        });
        peerObservation.close();
        let recovered = await adapter.resumePendingRuntimeExitSettlement();
        const recoveryDeadline = Date.now() + 15_000;
        while (recovered.status === 'blocked' && Date.now() < recoveryDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          recovered = await adapter.resumePendingRuntimeExitSettlement();
        }
        assert.equal(recovered.status, 'recovered', JSON.stringify(recovered));
        const nextIdentity = await identityStore.openInstance({
          name: 'Space',
          version: 'fixture',
        });
        assert.notEqual(
          nextIdentity.instanceId,
          oldIdentity.instanceId,
          'exit-fenced identity must not start new work',
        );
        assert.equal(
          await identityStore.openExitRecovery({ name: 'Space', version: 'fixture' }),
          undefined,
        );
      } finally {
        const lastExit = await settleRuntimeClientExit({
          configHome: path.join(homeDir, '.kodax'),
          homeDir,
          profile: 'coder',
          runtime: { lifecycle: peer.lifecycle },
          clientInfo: peerInfo,
        });
        assert.equal(lastExit.status, 'clean', JSON.stringify(lastExit));
        assert.equal(lastExit.receipt?.host.state, 'succeeded', 'last peer proves exact Host exit');
        await peer.disconnect();
      }
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; host ${JSON.stringify(adapter.snapshot())}; attachment ${JSON.stringify(attached?.connection?.current())}`,
        { cause: error },
      );
    } finally {
      release();
      await adapter.close();
      await new Promise<void>((resolve, reject) =>
        wire.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);

async function verifyRuntimePngAttachment(
  runtime: Awaited<ReturnType<typeof import('@kodax-ai/kodax/runtime').ensureKodaXRuntime>>,
  adapter: RuntimeHostAdapter,
  sessionId: string,
  projectRoot: string,
): Promise<void> {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  const imagePath = path.join(projectRoot, 'host-evidence.png');
  await writeFile(imagePath, bytes);
  const handle = await adapter.startManagedRun({
    sessionId,
    inputId: 'space-png-evidence',
    prompt: 'Read current PNG evidence',
    options: { toolInvocation: { name: 'read', input: { path: imagePath } } },
  });
  assert.equal((await handle.result).phase, 'completed');
  const view = await readRuntimeSessionView(runtime.sessions, sessionId);
  const item = view.items.find(
    (candidate) =>
      candidate.sourceRunId === handle.runId &&
      candidate.attachments?.some((attachment) => attachment.path === imagePath),
  );
  assert.ok(item, 'the actual tool result must retain its PNG attachment');
  const expectedImageSha256 = createHash('sha256').update(bytes).digest('hex');
  const content = await runtime.sessions.readViewItem(sessionId, item.id, {
    part: 'attachment',
    attachmentIndex: 0,
    expectedImageSha256,
  });
  assert.ok(content?.image);
  assert.deepEqual(Buffer.from(content.image.dataBase64, 'base64'), bytes);
  assert.deepEqual([content.image.width, content.image.height], [1, 1]);
  await assert.rejects(
    runtime.sessions.readViewItem(sessionId, item.id, {
      part: 'attachment',
      attachmentIndex: 0,
      expectedImageSha256: '0'.repeat(64),
    }),
    /hash changed/,
  );
}
