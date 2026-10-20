// Read-only contract probes. Run from the repository with:
// node --import tsx docs/research/kodax-space-contract-alignment-probe-2026-10-18.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectProductConversation } from '../../apps/desktop/renderer/src/features/session/productConversation.ts';
import {
  sessionProductItemSchema,
  sessionProductItemChannel,
} from '../../packages/space-ipc-schema/src/channels/session.ts';
import {
  projectRuntimeInteractions,
  projectRuntimeRun,
} from '../../apps/desktop/electron/kodax/runtime/coder-daemon-projection.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, new URL('../../', import.meta.url)), 'utf8'));
const [manifest, desktop, installed, lock] = await Promise.all([
  readJson('package.json'),
  readJson('apps/desktop/package.json'),
  readJson('node_modules/@kodax-ai/kodax/package.json'),
  readJson('package-lock.json'),
]);
const registry = await Promise.all(
  ['@kodax-ai/kodax', '@kodax-ai/artifacts'].map(async (name) => {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}?audit=${Date.now()}`,
      {
        headers: { 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(20_000),
      },
    );
    const metadata = await response.json();
    return {
      name,
      status: response.status,
      tags: metadata['dist-tags'],
      error: metadata.error,
      installedVersionPublishedAt: metadata.time?.[installed.version],
      installedVersionIntegrity: metadata.versions?.[installed.version]?.dist?.integrity,
    };
  }),
);
const tool = sessionProductItemSchema.parse({
  id: 'tool-image-proof',
  type: 'tool',
  text: 'image read',
  attachments: [{ kind: 'image', path: 'C:/fixture/output.png', mediaType: 'image/png' }],
  imageAttachments: [{ kind: 'image', id: 'fixture-image', status: 'unsupported' }],
  tool: { callId: 'call-fixture', name: 'read', status: 'success', resultRecorded: true },
});
const toolMessage = projectProductConversation([tool]).messages[0];
const terminal = {
  revision: 1,
  kind: 'interrupted',
  code: 'daemon_crashed',
  effectOutcome: 'unknown',
};
const run = projectRuntimeRun({
  runId: 'run-fixture',
  sessionId: 'session-fixture',
  phase: 'interrupted',
  provider: 'fixture',
  startedAt: '2026-10-18T00:00:00Z',
  terminal,
});
const plan = 'Inspect the current files, modify the requested file, then verify the result.';
const permission = projectRuntimeInteractions(
  [
    {
      id: 'plan-fixture',
      sessionId: 'session-fixture',
      runId: 'run-fixture',
      toolName: 'exit_plan_mode',
      plan,
      createdAt: '2026-10-18T00:00:00Z',
    },
  ],
  [],
)[0];
const evidence = {
  checkedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dependency: {
    root: manifest.dependencies['@kodax-ai/kodax'],
    desktop: desktop.dependencies['@kodax-ai/kodax'],
    installed: installed.version,
    locked: lock.packages['node_modules/@kodax-ai/kodax'].version,
    lockedIntegrityMatchesRegistry:
      lock.packages['node_modules/@kodax-ai/kodax'].integrity ===
      registry[0].installedVersionIntegrity,
    artifactExports: Object.keys(installed.exports).filter((name) => /artifact/i.test(name)),
  },
  registry,
  probes: {
    toolImages: {
      suppliedAttachmentCount: tool.attachments.length,
      suppliedImageCount: tool.imageAttachments.length,
      displayMessage: toolMessage,
      imagePreserved: 'attachments' in toolMessage || 'imageAttachments' in toolMessage,
      attachmentReadAccepted: sessionProductItemChannel.input.safeParse({
        sessionId: 'session-fixture',
        itemId: tool.id,
        source: 'view',
        part: 'attachment',
        attachmentIndex: 0,
      }).success,
    },
    planApproval: {
      suppliedPlan: plan,
      projected: permission,
      fullPlanPreserved: JSON.stringify(permission).includes(plan),
    },
    terminalEffects: {
      suppliedTerminal: terminal,
      projected: run,
      effectOutcomePreserved: 'effectOutcome' in run || 'terminal' in run,
    },
  },
};
await writeFile(
  new URL('kodax-space-contract-alignment-evidence-2026-10-18.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
process.stdout.write(JSON.stringify(evidence, null, 2) + '\n');
