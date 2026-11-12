// Registry SDK offline acceptance: node --import tsx e2e/alpha12-partner-host-acceptance.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertKodaxReleaseDependencyState } from '../scripts/kodax-runtime-release-gate.mjs';

const dependency = await assertKodaxReleaseDependencyState(
  process.cwd(),
  path.resolve('node_modules/@kodax-ai/kodax'),
);

process.env.KODAX_TEST_ONBOARDING = `alpha12-host-${randomUUID()}`;
const { applySdkHomeEnv, getKodaxRuntimeDir } =
  await import('../apps/desktop/electron/kodax/data-paths.ts');
applySdkHomeEnv();
const profileRoot = getKodaxRuntimeDir();
const workspace = path.join(profileRoot, 'workspace');
await mkdir(workspace, { recursive: true });
const projectSkill = path.join(workspace, '.agents', 'skills', 'alpha12-project');
await mkdir(projectSkill, { recursive: true });
await writeFile(
  path.join(projectSkill, 'SKILL.md'),
  '---\nname: alpha12-project\ndescription: Isolated candidate discovery fixture.\n---\nRead the supplied source.\n',
);
await writeFile(
  path.join(profileRoot, 'config.json'),
  JSON.stringify({ provider: 'anthropic', model: 'claude-sonnet-4-6', agentMode: 'ama' }),
);
const sdk = await import('@kodax-ai/kodax/runtime');
const { registerSpaceBuiltinSkills } =
  await import('../apps/desktop/electron/skill/space-builtins.ts');
await registerSpaceBuiltinSkills(path.resolve('resources/builtin-skills'));
const { RuntimeHostAdapter } =
  await import('../apps/desktop/electron/kodax/runtime-host-adapter.ts');
const { RuntimeClientIdentityStore } =
  await import('../apps/desktop/electron/kodax/runtime/runtime-client-identity.ts');
let attached;
const report = {
  dependency,
  sdk: dependency.version,
  profileRoot,
  checks: [],
};
const adapter = new RuntimeHostAdapter({
  profileRoot,
  identityStore: new RuntimeClientIdentityStore(path.join(profileRoot, 'space', 'identity.json')),
  runtimeFactory: async ({ autoStart, endpoint, transport, ...options }) => {
    attached = autoStart
      ? await sdk.ensureKodaXRuntime(options)
      : await sdk.connectKodaXRuntime({ ...options, endpoint, transport });
    return attached;
  },
  credentialResolver: async () => 'offline-unused-fixture-key',
  credentialProvidersResolver: async () => ['anthropic'],
  integrationHealthPollMs: 0,
});
try {
  await adapter.initialize();
  report.host = { ...attached.identity, capabilities: attached.capabilities };
  const skills = await adapter.listRuntimeSkills(workspace);
  assert.ok(skills.some((skill) => skill.name === 'draft-response'));
  assert.ok(skills.some((skill) => skill.name === 'alpha12-project'));
  assert.ok(
    await attached.catalog.describeSkill({ projectRoot: workspace, name: 'draft-response' }),
  );
  report.checks.push(
    'Space builtin Skill is discovered and rehydrated by the actual Host',
    'project .agents/skills is discovered by the actual Host',
  );
  const sessionId = await adapter.createSession({
    projectRoot: workspace,
    surface: 'partner',
    ephemeral: false,
  });
  await adapter.updateSessionSettings(sessionId, {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    permissionMode: 'full-access',
    agentMode: 'ama',
  });
  assert.equal((await attached.sessions.getSettings(sessionId)).workMode, 'agent');
  const run = await adapter.startManagedRun({
    sessionId,
    prompt: 'Create the local report',
    options: {
      toolInvocation: {
        name: 'write_partner_deliverable',
        input: { relativePath: 'report.md', content: 'alpha12 Host lease proof' },
      },
    },
  });
  const result = await run.result;
  assert.equal(result.phase, 'completed', JSON.stringify(result));
  const status = await attached.runs.get(run.runId);
  const { partnerDeliveryStore } =
    await import('../apps/desktop/electron/kodax/partner-delivery-store.ts');
  const deliveries = await partnerDeliveryStore.list({ sessionId, projectRoot: workspace });
  assert.equal(deliveries.length, 1);
  const file = await partnerDeliveryStore.readBinary(deliveries[0].id, 1024);
  assert.equal(file.truncated, false);
  assert.equal(Buffer.from(file.base64, 'base64').toString('utf8'), 'alpha12 Host lease proof');
  report.delivery = { id: deliveries[0].id, verifiedBytes: file.size };
  const statistics = await attached.statistics.read(sessionId);
  assert.equal(statistics.physicalRequestCount, 0);
  report.statistics = statistics;
  assert.equal(status.workMode, 'agent');
  assert.ok(
    status.effectiveConfig?.toolScope.includes('bash'),
    JSON.stringify(status.effectiveConfig),
  );
  assert.ok(status.effectiveConfig?.toolScope.includes('write_partner_deliverable'));
  assert.equal(status.effectiveConfig?.agentProfile?.surface, 'partner');
  assert.equal(
    status.effectiveConfig?.modelToolScope,
    undefined,
    'No model-request schema is invented for an explicit tool',
  );
  report.checks.push(
    'Partner Agent admitted through the shared Host',
    'Space delivery tool executed through a Host lease',
    'actual tool scope retains shell',
    'actual persona retained',
  );
  report.run = status;
} finally {
  if (attached) {
    const inspection = await attached.daemon.inspect();
    const owner = inspection.owner;
    assert.equal(
      owner?.runtimeId,
      attached.identity.runtimeId,
      'Only this exact isolated Host can be stopped',
    );
    const preflight = await attached.status.preflight();
    assert.equal(preflight.canStop, true, JSON.stringify(preflight));
    await attached.daemon.shutdown();
    await adapter.close();
    const stopped = await sdk.waitForRuntimeDaemonShutdown({
      configHome: profileRoot,
      owner,
    });
    assert.equal(stopped.status, 'succeeded', JSON.stringify(stopped));
    report.shutdown = stopped.status;
  } else await adapter.close();
  await mkdir('artifacts/diagnostics/alpha12-release', { recursive: true });
  await writeFile(
    'artifacts/diagnostics/alpha12-release/real-partner-host-report.json',
    JSON.stringify(report, null, 2),
  );
}
process.stdout.write(
  `Registry ${report.sdk}: ${report.checks.length} real shared-Host checks passed.\n`,
);
