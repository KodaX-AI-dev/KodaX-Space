// Opt-in: DEEPSEEK_API_KEY=... SPACE_LIVE_EXE=... node --import tsx e2e/issue216-live-acceptance.mjs
// Real provider and packaged product; synthetic prompts in an isolated profile.
// Credentials stay in memory. This does not replace the separate DPAPI restart smoke.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { launchSpace } from '../tests/e2e/fixtures.ts';

const credential = process.env.DEEPSEEK_API_KEY;
assert.ok(credential, 'DEEPSEEK_API_KEY is required');
const executablePath = path.resolve(
  process.env.SPACE_LIVE_EXE || 'out/win-unpacked/KodaX Space.exe',
);
const reportDir =
  process.env.SPACE_LIVE_REPORT_DIR || path.join(os.tmpdir(), `space-live-${randomUUID()}`);
await mkdir(reportDir, { recursive: true });
const report = { checks: [], errors: [], passed: false };
let space;
let projectRoot;
const step = (name) => process.stdout.write(`[issue216-live] ${name}\n`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, probe, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result) return result;
    await pause(200);
  }
  throw new Error(`Timed out: ${label}`);
}

async function invoke(name, input) {
  const result = await space.page.evaluate(
    async ({ name, input }) => window.kodaxSpace.invoke(name, input),
    { name, input },
  );
  if (!result.ok) throw new Error(`${name}: ${result.error?.message}`);
  return result.data;
}

async function snapshot(sessionId) {
  return invoke('session.liveSnapshot', { sessionId });
}

async function completed(sessionId, runId, phase = 'completed') {
  const result = await waitFor('Run settlement', async () => {
    const current = await snapshot(sessionId);
    return !current.activeRun && current.lastTerminalRun?.runId === runId
      ? current.lastTerminalRun
      : undefined;
  });
  assert.equal(result.phase, phase);
  return result;
}

async function send(sessionId, prompt) {
  const receipt = await invoke('session.send', {
    sessionId,
    prompt,
    operationId: randomUUID(),
    expectedProjectRoot: projectRoot,
    expectedSurface: 'code',
  });
  assert.equal(receipt.accepted, true, receipt.reason);
  assert.ok(receipt.runId, 'Immediate send must return its exact Run');
  return receipt.runId;
}

async function createSession(title, permissionMode = 'full-access') {
  const session = await invoke('session.create', {
    projectRoot,
    provider: 'deepseek',
    model: 'deepseek-flash',
    permissionMode,
    reasoningMode: 'off',
    agentMode: 'ama',
    surface: 'code',
  });
  await invoke('session.setTitle', { sessionId: session.sessionId, title });
  return session.sessionId;
}

async function selectSession(sessionId) {
  await space.page.reload();
  await space.page.waitForSelector('[data-space-shell-ready]', { timeout: 45_000 });
  await space.page
    .locator(`[data-testid="sidebar-session-row"][data-session-id="${sessionId}"]`)
    .click();
  await space.page.evaluate(() => {
    window.issue216Events = [];
    window.issue216Sandboxes = {};
    window.kodaxSpace.on('session.event', (event) => {
      if (['compact_start', 'compact_stats', 'compact_end', 'error'].includes(event.kind)) {
        window.issue216Events.push(event);
      }
    });
    window.kodaxSpace.on('session.liveChanged', (event) => {
      if (event.change.domain !== 'tools') return;
      for (const tool of event.change.activeTools) {
        if (tool.sandbox) window.issue216Sandboxes[event.sessionId] = tool.sandbox;
      }
    });
  });
}

async function compactEvents() {
  return space.page.evaluate(() => window.issue216Events ?? []);
}

async function configureCompaction(triggerTokens) {
  const result = await invoke('settings.kodaxConfig.setCompaction', {
    projectRoot,
    compaction: { enabled: true, triggerTokens },
  });
  assert.ok(result.runtimeReload, 'Configuration must reach the Runtime reload boundary');
}

async function history(sessionId) {
  return invoke('session.history', { sessionId, requestId: randomUUID(), expectedSurface: 'code' });
}

async function verifyCompaction() {
  step('manual compaction through renderer /compact');
  await configureCompaction(4_000);
  const composer = space.page.locator('textarea').first();
  await composer.fill('/compact');
  await space.page.getByLabel('Send message', { exact: true }).click();
  await waitFor('composer cleared', async () => (await composer.inputValue()) === '', 5_000);
  const manual = await waitFor('committed manual compaction', async () =>
    (await compactEvents()).find(
      (event) => event.kind === 'compact_stats' && event.source === 'manual' && event.committed,
    ),
  );
  assert.ok(manual.summaryRequestCount > 0, 'Manual compact must call the real summary provider');
  report.checks.push({
    name: 'manual-compaction',
    source: manual.source,
    requests: manual.summaryRequestCount,
    elapsedMs: manual.elapsedMs,
    commitMs: manual.commitMs,
  });
  await waitFor('manual compaction ended', async () =>
    (await compactEvents()).some((event) => event.kind === 'compact_end'),
  );
  report.manualCompactionEvents = await compactEvents();
}

async function verifyAutomaticCompaction() {
  await configureCompaction(100_000);
  const sessionId = await createSession('Issue216 automatic compaction');
  await selectSession(sessionId);
  step('seed independent automatic-compaction history with real assistant output');
  const seed = await send(
    sessionId,
    '这是合成验收。不要调用工具。请直接输出编号1至180的180行，每行严格为“编号: amber blue cedar delta echo foxtrot golf hotel india juliet”。请完整输出所有行，不省略。',
  );
  await completed(sessionId, seed);
  const seedItems = (await history(sessionId)).items;
  assert.ok(
    seedItems.some((item) => item.kind === 'assistant' && item.text?.length > 8_000),
    'Automatic compact needs substantial real assistant history beyond the protected tail',
  );
  const tail = await send(sessionId, '请只回复 AUTO_SEED_OK，不调用工具。');
  await completed(sessionId, tail);
  await configureCompaction(2_000);
  step('automatic compaction then a real provider reply');
  const runId = await send(sessionId, '请根据之前的会话，只回复 AUTO_COMPACT_OK，不调用工具。');
  await completed(sessionId, runId);
  const automatic = (await compactEvents()).find(
    (event) =>
      event.kind === 'compact_stats' && event.source === 'automatic_threshold' && event.committed,
  );
  assert.ok(automatic, 'The automatic threshold path must commit a real compaction');
  assert.ok(automatic.summaryRequestCount > 0);
  assert.ok(automatic.afterRevision > automatic.beforeRevision);
  const items = (await history(sessionId)).items;
  assert.ok(
    items.some((item) => item.kind === 'assistant' && item.text?.includes('AUTO_COMPACT_OK')),
  );
  report.checks.push({
    name: 'automatic-compaction',
    source: automatic.source,
    requests: automatic.summaryRequestCount,
    elapsedMs: automatic.elapsedMs,
    commitMs: automatic.commitMs,
  });
  report.automaticCompactionEvents = await compactEvents();
  await configureCompaction(100_000);
  return sessionId;
}

async function verifyConcurrentCommands() {
  step('four concurrent managed shell commands in distinct Sessions');
  const ids = await Promise.all(
    Array.from({ length: 4 }, (_, index) => createSession(`parallel-${index}`, 'accept-edits')),
  );
  const started = Date.now();
  const runs = await Promise.all(
    ids.map((id, index) =>
      send(
        id,
        `!node -e "const fs=require('node:fs'); const start=Date.now(); fs.writeFileSync('parallel-${index}.start',String(start)); const timer=setInterval(()=>{if(Date.now()-start>30000){clearInterval(timer);process.exitCode=1;}else if([0,1,2,3].every(i=>fs.existsSync('parallel-'+i+'.start'))){clearInterval(timer);setTimeout(()=>fs.writeFileSync('parallel-${index}.done',String(Date.now())),500);}},100)"`,
      ),
    ),
  );
  await Promise.all(ids.map((id, index) => completed(id, runs[index])));
  const intervals = await Promise.all(
    ids.map(async (_, index) => ({
      start: Number(await readFile(path.join(projectRoot, `parallel-${index}.start`), 'utf8')),
      end: Number(await readFile(path.join(projectRoot, `parallel-${index}.done`), 'utf8')),
    })),
  );
  assert.ok(intervals.every(({ start, end }) => Number.isFinite(start) && end > start));
  assert.ok(
    Math.max(...intervals.map(({ start }) => start)) < Math.min(...intervals.map(({ end }) => end)),
    'All four sandbox commands must overlap at the filesystem barrier',
  );
  const sandboxes = await space.page.evaluate(() => window.issue216Sandboxes);
  for (const id of ids) {
    assert.equal(sandboxes[id]?.state, 'applied', 'Parallel shell must actually use the sandbox');
    assert.equal(sandboxes[id]?.backend, 'windows-restricted-user');
  }
  report.checks.push({
    name: 'four-concurrent-sandbox-shell-runs',
    elapsedMs: Date.now() - started,
    intervals,
  });
  return ids[0];
}

async function verifyStop(sessionId) {
  await selectSession(sessionId);
  step('UI Stop settles the running shell child before a successor');
  const runId = await send(
    sessionId,
    "!node -e \"const fs=require('node:fs'); fs.writeFileSync('stop-child.pid',String(process.pid)); setTimeout(()=>fs.writeFileSync('unexpected-stop.done','BAD'),90000)\"",
  );
  const pid = await waitFor(
    'exact test child PID',
    async () => {
      try {
        return Number(await readFile(path.join(projectRoot, 'stop-child.pid'), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      }
    },
    45_000,
  );
  await space.page
    .locator('button[aria-label="Stop generation"], button[aria-label="停止生成"]')
    .click();
  await completed(sessionId, runId, 'interrupted');
  await waitFor(
    'stopped child gone',
    () => {
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        if (error.code === 'ESRCH') return true;
        throw error;
      }
    },
    10_000,
  );
  const successor = await send(
    sessionId,
    "!node -e \"require('node:fs').writeFileSync('successor.done','SUCCESSOR_OK')\"",
  );
  await completed(sessionId, successor);
  assert.equal(await readFile(path.join(projectRoot, 'successor.done'), 'utf8'), 'SUCCESSOR_OK');
  report.checks.push({ name: 'ui-stop-exact-child-and-successor' });
}

try {
  step('launch packaged application with isolated credentials');
  space = await launchSpace(`issue216-live-${randomUUID()}`, {
    executablePath,
    env: { KODAX_FORCE_MOCK: '0', DEEPSEEK_API_KEY: '', SPACE_TEST_WINDOW_HIDDEN: '1' },
    onPageError: (error) => report.errors.push(error.message),
  });
  report.spaceVersion = await space.app.evaluate(({ app }) => app.getVersion());
  assert.equal(await space.app.evaluate(() => Boolean(process.env.DEEPSEEK_API_KEY)), false);
  projectRoot = path.join(space.testDataDir, 'workspace');
  await mkdir(projectRoot, { recursive: true });
  await space.seedProject(projectRoot);
  await waitFor(
    'Runtime ready',
    async () => (await invoke('runtime.profileSnapshot')).connection.state === 'ready',
    90_000,
  );
  const daemon = JSON.parse(
    await readFile(path.join(space.testDataDir, 'runtime/daemon/coder/daemon.json'), 'utf8'),
  );
  report.sdkVersion = daemon.version;
  assert.equal(daemon.version, '0.7.96-rc.10');
  assert.equal(
    (await invoke('provider.setKey', { providerId: 'deepseek', apiKey: credential })).ok,
    true,
  );
  await configureCompaction(100_000);
  const sessionId = await createSession('Issue216 live compaction');
  await selectSession(sessionId);
  step('two real provider turns with synthetic history');
  const filler = Array.from(
    { length: 160 },
    (_, index) => `Fixture record ${index}: amber blue cedar delta echo. `,
  ).join('');
  for (const marker of ['LIVE_FIRST_OK', 'LIVE_SECOND_OK']) {
    const runId = await send(
      sessionId,
      `以下是合成验收数据，无需工具或解释。请只回复 ${marker}。\n${filler}`,
    );
    await completed(sessionId, runId);
    assert.ok(
      (await history(sessionId)).items.some(
        (item) => item.kind === 'assistant' && item.text?.includes(marker),
      ),
    );
  }
  report.checks.push({ name: 'real-provider-credential-broker', turns: 2 });
  await verifyCompaction();
  const automaticSessionId = await verifyAutomaticCompaction();
  await selectSession(automaticSessionId);
  await waitFor(
    'history restored after reload',
    async () =>
      (await space.page.getByTestId('conversation-stream').innerText()).includes('AUTO_COMPACT_OK'),
    30_000,
  );
  report.checks.push({ name: 'compacted-history-renderer-reload' });
  await verifyStop(await verifyConcurrentCommands());
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = String(error.stack ?? error).replaceAll(credential, '<REDACTED>');
  process.exitCode = 1;
} finally {
  try {
    if (space) {
      try {
        report.compactionEvents = await compactEvents();
      } catch (error) {
        report.passed = false;
        report.errors.push(
          `Evidence collection failed: ${String(error).replaceAll(credential, '<REDACTED>')}`,
        );
        process.exitCode = 1;
      }
    }
    await writeFile(
      path.join(reportDir, 'report.json'),
      JSON.stringify(report, null, 2).replaceAll(credential, '<REDACTED>'),
    );
  } finally {
    await space?.close();
  }
}
step(
  JSON.stringify({
    passed: report.passed,
    checks: report.checks,
    failure: report.failure,
    reportDir,
  }),
);
