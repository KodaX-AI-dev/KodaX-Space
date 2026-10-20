import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MemoryLearningHandoff } from '@kodax-ai/kodax/agent';
import { MemoryGovernanceService } from '../memory/memory-service.js';

type AgentSdkModule = typeof import('@kodax-ai/kodax/agent');

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
});

afterEach(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
  tempRoots = [];
});

async function makeHarness(): Promise<{
  readonly sdk: AgentSdkModule;
  readonly service: MemoryGovernanceService;
  readonly projectRoot: string;
  readonly storePath: string;
  readonly memoryRoot: string;
}> {
  const sdk = await import('@kodax-ai/kodax/agent');
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'kodax-space-memory-service-'));
  tempRoots.push(projectRoot);
  const storePath = path.join(projectRoot, '.test-memory', 'learning-proposals.json');
  const memoryRoot = path.join(projectRoot, '.test-memory', 'memory-root');
  const service = new MemoryGovernanceService({
    loadSdk: async () => sdk,
    resolveSession: async (sessionId) => ({ sessionId, projectRoot, surface: 'code' }),
    resolvePaths: () => ({ learningStorePath: storePath, memoryRoot }),
  });
  return { sdk, service, projectRoot, storePath, memoryRoot };
}

function makeMemoryProposal(proposalId: string, body: string): MemoryLearningHandoff {
  return {
    destination: 'memdir_handoff',
    proposalId,
    origin: 'assistant_tool',
    userLabel: 'context_note',
    memoryKind: 'project',
    body,
    metadata: {
      writeOrigin: 'assistant_tool',
      executionContext: 'primary',
      sessionId: 's_memory',
      platform: 'kodax-space-test',
      sourceTool: 'memory-service.test',
      sourceRefs: ['session:s_memory', 'turn:3'],
      completedTurn: true,
    },
  };
}

async function seed(
  harness: Awaited<ReturnType<typeof makeHarness>>,
  proposalId: string,
  body = 'Always run npm run typecheck before shipping Memory Governance changes.',
): Promise<void> {
  await harness.sdk.upsertLearningProposal(
    harness.storePath,
    makeMemoryProposal(proposalId, body),
    { now: () => '2026-07-07T01:02:03.000Z' },
  );
}

test('list exposes pending memory proposals through the 0.7.62 controller', async () => {
  const harness = await makeHarness();
  await seed(harness, 'mem-list-1');

  const listed = await harness.service.list({ sessionId: 's_memory' });

  assert.equal(listed.inbox.length, 1);
  assert.equal(listed.inbox[0]?.id, 'memory:mem-list-1');
  assert.equal(listed.inbox[0]?.action, 'write_memdir');
  assert.equal(listed.refs.length, 1);
  assert.equal(listed.refs[0]?.kind, 'learning_proposal');
});

test('Coder memory uses the Host controller and forwards the reviewed revision unchanged', async () => {
  const harness = await makeHarness();
  await seed(harness, 'host-proposal');
  const controller = harness.sdk.createMemoryControlPlane({
    cwd: harness.projectRoot,
    memoryRoot: harness.memoryRoot,
    learningStorePath: harness.storePath,
    discoverSkills: false,
  });
  const expectedRevision = harness.sdk.memoryProposalRevision(
    (await controller.showProposal('memory:host-proposal'))!,
  );
  const service = new MemoryGovernanceService({
    resolveSession: async (sessionId) => ({
      sessionId,
      projectRoot: harness.projectRoot,
      surface: 'code',
    }),
    loadSdk: async () => {
      throw new Error('must not create a second Memory owner');
    },
    resolveHostController: async (session) => {
      assert.equal(session.projectRoot, harness.projectRoot);
      return {
        ...controller,
        showProposal: async (id) => {
          const proposal = await controller.showProposal(id);
          return proposal ? { ...proposal, revision: 'reviewed-revision' } : undefined;
        },
        approveProposal: async (_id, _fingerprints, revision) => {
          assert.equal(revision, expectedRevision);
          return {
            proposalId: 'host-proposal',
            applied: false,
            changedRefs: [],
            changedPaths: [],
            skippedReason: 'conflict',
            warnings: [],
          };
        },
      };
    },
  });
  const shown = await service.proposal({
    sessionId: 's_memory',
    proposalId: 'memory:host-proposal',
  });
  assert.equal(shown.proposal?.revision, expectedRevision);
  const result = await service.approve({
    sessionId: 's_memory',
    proposalId: 'memory:host-proposal',
    expectedFingerprints: {},
    expectedRevision: shown.proposal!.revision,
  });
  assert.equal(result.result.skippedReason, 'conflict');
  await assert.rejects(
    service.approve({
      sessionId: 's_memory',
      proposalId: 'memory:host-proposal',
      expectedFingerprints: {},
    }),
    /revision/i,
  );
});

test('approve returns applied=false when fingerprints are missing', async () => {
  const harness = await makeHarness();
  await seed(harness, 'mem-fingerprint-1');

  const result = await harness.service.approve({
    sessionId: 's_memory',
    proposalId: 'memory:mem-fingerprint-1',
    expectedFingerprints: {},
  });

  assert.equal(result.result.applied, false);
  assert.equal(result.result.skippedReason, 'approval fingerprints do not cover proposal preview');
});

test('approval fails closed when MEMORY.md changes after preview', async () => {
  const harness = await makeHarness();
  await seed(harness, 'mem-stale-1');
  const shown = await harness.service.proposal({
    sessionId: 's_memory',
    proposalId: 'memory:mem-stale-1',
  });
  assert.ok(shown.proposal);
  const entrypoint = shown.proposal.preview.changedPaths.find((p) => p.endsWith('MEMORY.md'));
  assert.ok(entrypoint);
  await mkdir(path.dirname(entrypoint), { recursive: true });
  await writeFile(entrypoint, '# external edit\n', 'utf8');

  const result = await harness.service.approve({
    sessionId: 's_memory',
    proposalId: shown.proposal.id,
    expectedFingerprints: shown.proposal.expectedFingerprints,
  });

  assert.equal(result.result.applied, false);
  assert.equal(result.result.skippedReason, 'MEMORY.md changed after preview');
});

test('approve after refreshed preview writes memdir refs and pack selects them', async () => {
  const harness = await makeHarness();
  await seed(harness, 'mem-apply-1');
  const shown = await harness.service.proposal({
    sessionId: 's_memory',
    proposalId: 'memory:mem-apply-1',
  });
  assert.ok(shown.proposal);

  const approved = await harness.service.approve({
    sessionId: 's_memory',
    proposalId: shown.proposal.id,
    expectedFingerprints: shown.proposal.expectedFingerprints,
  });

  assert.equal(approved.result.applied, true);
  assert.ok(approved.result.changedPaths.some((p) => p.endsWith('MEMORY.md')));

  const listed = await harness.service.list({ sessionId: 's_memory' });
  assert.equal(listed.inbox.length, 0);
  assert.ok(listed.refs.some((ref) => ref.kind === 'memdir' && ref.lifecycle === 'active'));

  const pack = await harness.service.pack({
    sessionId: 's_memory',
    task: 'finish Memory Governance UI',
    maxHints: 3,
    includeSnippets: true,
  });
  assert.equal(pack.pack.traceMetadata.suppressed, false);
  assert.ok(pack.pack.hints.length >= 1);
});

test('reject removes proposal from inbox and curator can return no-op report', async () => {
  const harness = await makeHarness();
  await seed(harness, 'mem-reject-1', 'Reject path should leave the Memory Governance inbox.');

  const rejected = await harness.service.reject({
    sessionId: 's_memory',
    proposalId: 'memory:mem-reject-1',
    reason: 'not durable',
  });
  assert.equal(rejected.result.rejected, true);

  const listed = await harness.service.list({ sessionId: 's_memory' });
  assert.equal(listed.inbox.length, 0);

  const report = await harness.service.curate({ sessionId: 's_memory' });
  assert.ok(report.report.findings.some((finding) => finding.kind === 'no_op'));
});
