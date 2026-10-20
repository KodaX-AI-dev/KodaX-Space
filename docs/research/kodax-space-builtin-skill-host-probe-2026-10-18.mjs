// Catalog-only probe; no Provider requests or personal configuration writes.
// node --import tsx docs/research/kodax-space-builtin-skill-host-probe-2026-10-18.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'space-sdk-skill-audit-'));
const projectRoot = path.join(homeDir, 'project');
await fs.mkdir(projectRoot);
process.env.KODAX_HOME = path.join(homeDir, '.kodax');
const { registerSpaceBuiltinSkills, _resetSpaceBuiltinSkillsForTests } =
  await import('../../apps/desktop/electron/skill/space-builtins.ts');
const { getSkillRegistry } = await import('../../apps/desktop/electron/skill/registry.ts');
const { settleRuntimeClientExit } =
  await import('../../apps/desktop/electron/kodax/runtime/runtime-client-exit.ts');
const registered = await registerSpaceBuiltinSkills(path.join(root, 'resources/builtin-skills'));
const registry = await getSkillRegistry(projectRoot);
const skillIdentity = (skill) => ({ name: skill.name, source: skill.source, path: skill.path });
const localSkills = registry.listUserInvocable().map(skillIdentity);
const localNames = localSkills.map((skill) => skill.name);
const sdk = await import('@kodax-ai/kodax/runtime');
const profile = 'skill-contract-audit';
const clientInfo = {
  name: 'space-contract-audit',
  instanceId: `audit-${randomBytes(12).toString('hex')}`,
  instanceSecret: randomBytes(32).toString('hex'),
};
const evidence = {
  checkedAt: new Date().toISOString(),
  homeDir,
  registeredNames: registered.skillNames,
  localNames,
  localSkills,
};
let runtime;
try {
  runtime = await sdk.ensureKodaXRuntime({
    homeDir,
    profile,
    sessionsDir: path.join(homeDir, 'sessions'),
    daemonLifecycle: 'interactive',
    clientInfo,
  });
  evidence.hostSkills = (await runtime.catalog.skills({ projectRoot })).map(skillIdentity);
  evidence.hostNames = evidence.hostSkills.map((skill) => skill.name);
  evidence.missingFromHost = registered.skillNames.filter(
    (name) => localNames.includes(name) && !evidence.hostNames.includes(name),
  );
} finally {
  try {
    if (runtime) {
      const settlement = await settleRuntimeClientExit({
        configHome: path.join(homeDir, '.kodax'),
        homeDir,
        profile,
        runtime,
        clientInfo,
      });
      evidence.cleanup = {
        status: settlement.status,
        cleanup: settlement.receipt?.cleanup.state,
        host: settlement.receipt?.host.state,
      };
    }
  } finally {
    await runtime?.close();
    _resetSpaceBuiltinSkillsForTests();
    await fs.writeFile(
      new URL('kodax-space-builtin-skill-host-evidence-2026-10-18.json', import.meta.url),
      JSON.stringify(evidence, null, 2) + '\n',
    );
  }
}
process.stdout.write(
  JSON.stringify(
    {
      missingFromHost: evidence.missingFromHost,
      collidingHostSkills: evidence.hostSkills.filter((skill) =>
        registered.skillNames.includes(skill.name),
      ),
      cleanup: evidence.cleanup,
    },
    null,
    2,
  ) + '\n',
);
