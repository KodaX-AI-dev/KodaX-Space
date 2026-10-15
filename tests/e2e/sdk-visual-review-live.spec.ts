import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile, copyFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { launchSpace, type SpaceInstance } from './fixtures.js';
import { sendSdkPrompt, readSdkHistory } from './sdk-provider-fixture.js';
import {
  connectKodaXClient,
  type ClientSessionView,
  type ClientImageAttachmentContent,
} from '@kodax-ai/kodax/client';

test.setTimeout(540_000);
const enabled = process.env.SPACE_LIVE_VISUAL_REVIEW_E2E === '1';
const prompt =
  '请将 report.html 的季度汇报图更新为 data.json 中的数据，把标题改成 Quarterly Results，保留现有尺寸、布局和配色，交付更新后的 report.html 和 report.png。最后给我文件链接和一句说明。';

async function seedVisualWorkspace(root: string, explicit: boolean) {
  const require = createRequire(import.meta.url);
  const playwrightUrl = pathToFileURL(require.resolve('playwright')).href;
  const labels = explicit ? [13, 26, 39] : [0, 0, 0];
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'data.json'), JSON.stringify({ Q1: 42, Q2: 57, Q3: 68 }));
  await writeFile(
    path.join(root, 'report.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#f5f2eb;color:#142d40;font:24px Arial;width:960px;height:540px;box-sizing:border-box;padding:48px}
h1{margin:0 0 40px;font-size:42px}.chart{height:330px;display:flex;gap:70px;align-items:flex-end}
.quarter{width:180px;text-align:center}.bar{background:#277e8f;width:180px;height:1px}.label{padding:16px}
</style></head><body><h1>Quarterly Report</h1><div class="chart">
<div class="quarter"><div class="bar"></div><div class="label">Q1: ${labels[0]}</div></div>
<div class="quarter"><div class="bar"></div><div class="label">Q2: ${labels[1]}</div></div>
<div class="quarter"><div class="bar"></div><div class="label">Q3: ${labels[2]}</div></div>
</div></body></html>`,
  );
  await writeFile(
    path.join(root, 'render.mjs'),
    `import playwright from ${JSON.stringify(playwrightUrl)};const {chromium}=playwright;
import {pathToFileURL} from 'node:url';import path from 'node:path';
const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
await page.goto(pathToFileURL(path.resolve('report.html')).href);await page.evaluate(()=>document.fonts.ready);
await page.screenshot({path:path.resolve('report.png')});process.stdout.write('Saved report.png');}finally{await browser.close();}
`,
  );
  await writeFile(
    path.join(root, 'README.md'),
    `# Quarterly report workspace
The source is report.html; the data is data.json. Render the HTML to report.png using:
${JSON.stringify(process.execPath)} render.mjs
Chromium and Playwright are installed. No package installation is needed.
`,
  );
}

async function createVisualSession(
  space: SpaceInstance,
  root: string,
  mode: 'ama' | 'sa',
  target: ConfiguredModel,
) {
  return space.page.evaluate(
    async ({ root, mode, target }) => {
      const catalog = await window.kodaxSpace!.invoke('provider.list', undefined);
      if (!catalog.ok) throw new Error(catalog.error.message);
      const provider = catalog.data.providers.find((item) => item.id === target.provider);
      if (!provider?.configured || provider.isCustom)
        throw new Error('Use an already configured Space built-in provider.');
      if (!provider.models?.includes(target.model) && provider.defaultModel !== target.model)
        throw new Error('Configured model is missing from the Space provider catalog.');
      const defaults = await window.kodaxSpace!.invoke('settings.setRuntimeDefaults', {
        runtimeDefaults: { permissionMode: 'full-access', agentMode: mode },
      });
      if (!defaults.ok) throw new Error(defaults.error.message);
      const created = await window.kodaxSpace!.invoke('session.create', {
        projectRoot: root,
        surface: 'code',
        provider: target.provider,
        model: target.model,
        agentMode: mode,
        reasoningMode: 'auto',
        permissionMode: 'full-access',
      });
      if (!created.ok) throw new Error(created.error.message);
      return { sessionId: created.data.sessionId, provider };
    },
    { root, mode, target },
  );
}

interface VisualCase {
  mode: 'ama' | 'sa';
  explicit: boolean;
}

interface ConfiguredModel {
  provider: string;
  model: string;
}

async function configuredModel(): Promise<ConfiguredModel> {
  const configRoot = process.env.KODAX_HOME ?? path.join(os.homedir(), '.kodax');
  const config = JSON.parse(await readFile(path.join(configRoot, 'config.json'), 'utf8')) as {
    provider?: unknown;
    model?: unknown;
  };
  if (typeof config.provider !== 'string' || typeof config.model !== 'string')
    throw new Error('Choose a provider and model in Space before running live acceptance.');
  return { provider: config.provider, model: config.model };
}

async function initialEvidence({ mode, explicit }: VisualCase, target: ConfiguredModel) {
  const sdk = JSON.parse(
    await readFile(createRequire(import.meta.url).resolve('@kodax-ai/kodax/package.json'), 'utf8'),
  ) as { version: string };
  return {
    sdk: sdk.version,
    mode,
    ...target,
    transport: 'Space built-in provider; no custom provider or HTTP proxy',
    prompt: explicit
      ? '请使用 visual-review 检查 report.png 的数值是否与 data.json 一致，不改动文件。只返回 JSON：matches 为是否一致，quarters 中 Q1/Q2/Q3 各有 data（JSON 源数据值）与 image（图片中实际显示值）两个数值字段。'
      : prompt,
    explicitSkillRequested: explicit,
  };
}

async function captureSessionEvidence(space: SpaceInstance, sessionId: string) {
  const facts = await space.page.evaluate(async (id) => {
    const requests = await window.kodaxSpace!.invoke('session.executionFacts', {
      sessionId: id,
      kind: 'requests',
      limit: 500,
    });
    const tools = await window.kodaxSpace!.invoke('session.executionFacts', {
      sessionId: id,
      kind: 'tools',
      limit: 500,
    });
    if (!requests.ok) throw new Error(requests.error.message);
    if (!tools.ok) throw new Error(tools.error.message);
    return { requests: requests.data, tools: tools.data };
  }, sessionId);
  const history = await readSdkHistory(space, sessionId);
  const calls = history.items
    .filter((item) => item.type === 'tool')
    .map((item) => ({
      toolId: item.tool?.callId,
      toolName: item.tool!.name,
      input: JSON.parse(item.tool?.inputText ?? '{}') as Record<string, unknown>,
      result: item.text,
      isError: item.tool?.status === 'error',
    }));
  return {
    ...facts,
    calls,
    answers: history.items.filter((item) => item.type === 'assistant').map((item) => item.text),
    conversation: history.conversation,
    skillInvocation: calls.some(
      (call) => call.toolName === 'skill' && call.input?.skill === 'visual-review',
    ),
    loadedVisualReview: calls.some(
      (call) =>
        call.toolName === 'skill' &&
        !call.isError &&
        call.result?.includes('# Visual review') &&
        call.result.includes('## Obtain evidence'),
    ),
  };
}

async function captureTranscriptImages(space: SpaceInstance, sessionId: string) {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      const {loadSession}=await import('@kodax-ai/kodax/session');
      const session=await loadSession(process.argv[1]);
      if(!session)throw new Error('SDK session transcript is missing.');
      const images=[];
      for(const message of session.messages){
        if(!Array.isArray(message.content))continue;
        for(const block of message.content){
          if(block.type!=='tool_result'||!Array.isArray(block.content))continue;
          for(const item of block.content)
            if(item.type==='image')images.push({toolId:block.tool_use_id,path:item.path,mediaType:item.mediaType});
        }
      }
      process.stdout.write(JSON.stringify(images));
    `,
      sessionId,
    ],
    { windowsHide: true, timeout: 15_000, env: { ...process.env, KODAX_HOME: space.testDataDir } },
  );
  return JSON.parse(stdout) as { toolId: string; path: string; mediaType?: string }[];
}

async function connectVisualEvidenceReader(space: SpaceInstance) {
  const daemonDir = path.join(space.testDataDir, 'runtime/daemon/coder');
  const descriptor = JSON.parse(await readFile(path.join(daemonDir, 'daemon.json'), 'utf8')) as {
    endpoint: string;
  };
  return connectKodaXClient({
    profile: 'coder',
    endpoint: descriptor.endpoint,
    token: (await readFile(path.join(daemonDir, 'daemon.token'), 'utf8')).trim(),
    clientInfo: {
      name: 'Space visual evidence reader',
      instanceId: randomUUID(),
      instanceSecret: randomUUID(),
    },
  });
}

async function captureHostImage(
  space: SpaceInstance,
  sessionId: string,
  imagePath: string,
  expectedImageSha256: string,
) {
  const client = await connectVisualEvidenceReader(space);
  try {
    let view: ClientSessionView | undefined;
    const observation = await client.sessions.observe(sessionId, (current) => {
      view = current;
    });
    observation.close();
    const item = view?.items.findLast(
      (candidate) =>
        candidate.type === 'tool' &&
        candidate.attachments?.some((attachment) => attachment.path === imagePath),
    );
    expect(item, 'Host current view must retain the actual tool PNG').toBeDefined();
    if (!item) throw new Error('Current Host image item is unavailable.');
    const attachmentIndex = item.attachments!.findIndex(
      (attachment) => attachment.path === imagePath,
    );
    const content = await client.sessions.readItem(sessionId, item.id, {
      part: 'attachment',
      attachmentIndex,
      expectedImageSha256,
    });
    expect(content?.image).toBeDefined();
    const image = content!.image!;
    assertHostImageBytes(image, expectedImageSha256);
    return {
      toolId: item.tool?.callId,
      path: imagePath,
      sha256: image.sha256,
      width: image.width,
      height: image.height,
      bytes: image.totalLength,
    };
  } finally {
    await client.disconnect();
  }
}

function assertHostImageBytes(image: ClientImageAttachmentContent, expectedImageSha256: string) {
  const bytes = Buffer.from(image.dataBase64, 'base64');
  expect(image.offset).toBe(0);
  expect(image.nextOffset).toBeUndefined();
  expect(bytes.length).toBe(image.totalLength);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(expectedImageSha256);
}

async function waitForTerminal(space: SpaceInstance, sessionId: string) {
  await expect
    .poll(
      () =>
        space.page.evaluate(async (id) => {
          const snapshot = await window.kodaxSpace!.invoke('session.liveSnapshot', {
            sessionId: id,
          });
          if (!snapshot.ok) return 'pending';
          return snapshot.data.activeRun
            ? 'running'
            : (snapshot.data.lastTerminalRun?.phase ?? 'pending');
        }, sessionId),
      { timeout: 480_000, intervals: [1_000] },
    )
    .toMatch(/^(completed|failed|cancelled|interrupted)$/);
  return space.page.evaluate(async (id) => {
    const result = await window.kodaxSpace!.invoke('session.liveSnapshot', { sessionId: id });
    if (!result.ok) throw new Error(result.error.message);
    return result.data.lastTerminalRun;
  }, sessionId);
}

async function captureOutputs(space: SpaceInstance, root: string, reportRoot: string) {
  for (const name of ['report.html', 'report.png']) {
    if (existsSync(path.join(root, name)))
      await copyFile(path.join(root, name), path.join(reportRoot, name));
  }
  await space.page.screenshot({ path: path.join(reportRoot, 'space.png') });
  if (!existsSync(path.join(root, 'report.png'))) return { finalPngExists: false };
  const image = await readFile(path.join(root, 'report.png'));
  return {
    finalPngExists: true,
    finalImageSha256: createHash('sha256').update(image).digest('hex'),
    imageWidth: image.readUInt32BE(16),
    imageHeight: image.readUInt32BE(20),
  };
}

function assertExplicitDifferences(answer: string | undefined) {
  expect(answer).toBeDefined();
  const text = answer ?? '';
  const result: unknown = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  expect(result).toMatchObject({
    matches: false,
    quarters: {
      Q1: { data: 42, image: 13 },
      Q2: { data: 57, image: 26 },
      Q3: { data: 68, image: 39 },
    },
  });
}

async function assertVisualEvidence(
  facts: Awaited<ReturnType<typeof captureSessionEvidence>>,
  images: Awaited<ReturnType<typeof captureTranscriptImages>>,
  root: string,
  explicit: boolean,
  evidence: Record<string, unknown>,
) {
  if (!explicit) {
    expect(evidence.skillInvocation).toBe(true);
    expect(facts.loadedVisualReview).toBe(true);
  }
  expect(evidence.finalPngExists).toBe(true);
  expect(evidence.imageWidth).toBe(960);
  expect(evidence.imageHeight).toBe(540);
  const imageCall = facts.calls.findLast(
    (call) =>
      call.toolName === 'read' &&
      !call.isError &&
      typeof call.input?.path === 'string' &&
      path.resolve(root, call.input.path) === path.join(root, 'report.png'),
  );
  expect(imageCall, 'Model must read the rendered PNG').toBeDefined();
  expect(
    images.some(
      (image) =>
        image.toolId === imageCall?.toolId &&
        path.resolve(image.path) === path.join(root, 'report.png'),
    ),
  ).toBe(true);
  expect(evidence.hostImage).toMatchObject({
    toolId: imageCall?.toolId,
    sha256: evidence.finalImageSha256,
    width: 960,
    height: 540,
  });
  if (explicit) {
    expect(evidence.finalImageSha256).toBe(evidence.initialImageSha256);
    assertExplicitDifferences(facts.answers.at(-1));
  } else {
    const html = await readFile(path.join(root, 'report.html'), 'utf8');
    for (const value of ['Quarterly Results', '42', '57', '68']) expect(html).toContain(value);
  }
  assertConfiguredRequests(facts, evidence);
  evidence.passed = true;
}

function assertConfiguredRequests(
  facts: Awaited<ReturnType<typeof captureSessionEvidence>>,
  evidence: Record<string, unknown>,
) {
  expect(facts.requests.kind).toBe('requests');
  if (facts.requests.kind !== 'requests') throw new Error('Request facts are unavailable.');
  expect(facts.requests.items.some((request) => request.state === 'succeeded')).toBe(true);
  for (const request of facts.requests.items) {
    expect(request.provider).toBe(evidence.provider);
    expect(request.model).toBe(evidence.model);
    expect(request.fallback).toBe(false);
  }
}

async function captureVisualRunEvidence(
  space: SpaceInstance,
  sessionId: string,
  root: string,
  reportRoot: string,
  evidence: Record<string, unknown>,
) {
  try {
    Object.assign(evidence, await captureOutputs(space, root, reportRoot));
    const facts = await captureSessionEvidence(space, sessionId);
    Object.assign(evidence, facts);
    const images = await captureTranscriptImages(space, sessionId);
    Object.assign(evidence, { transcriptImages: images });
    if (typeof evidence.finalImageSha256 === 'string')
      evidence.hostImage = await captureHostImage(
        space,
        sessionId,
        path.join(root, 'report.png'),
        evidence.finalImageSha256,
      );
    return { facts, images };
  } catch (error) {
    evidence.captureError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}

async function executeVisualCase(
  space: SpaceInstance,
  options: VisualCase,
  target: ConfiguredModel,
  reportRoot: string,
  evidence: Record<string, unknown>,
) {
  const root = path.join(space.testDataDir, 'project');
  await seedVisualWorkspace(root, options.explicit);
  if (options.explicit) {
    await promisify(execFile)(process.execPath, ['render.mjs'], { cwd: root, windowsHide: true });
    evidence.initialImageSha256 = createHash('sha256')
      .update(await readFile(path.join(root, 'report.png')))
      .digest('hex');
    await unlink(path.join(root, 'report.html'));
    await writeFile(
      path.join(root, 'README.md'),
      '# Visual comparison\nInspect report.png and data.json without modifying files.\n',
    );
  }
  await space.seedProject(root);
  const { sessionId, provider } = await createVisualSession(space, root, options.mode, target);
  Object.assign(evidence, { sessionId, configuredProvider: provider });
  await space.page.reload();
  await space.page
    .locator(`[data-testid="sidebar-session-row"][data-session-id="${sessionId}"]`)
    .click();
  await sendSdkPrompt(space, String(evidence.prompt));
  let captured: Awaited<ReturnType<typeof captureVisualRunEvidence>>;
  try {
    const terminal = await waitForTerminal(space, sessionId);
    evidence.terminal = terminal;
    expect(terminal?.phase).toBe('completed');
  } finally {
    captured = await captureVisualRunEvidence(space, sessionId, root, reportRoot, evidence);
  }
  await assertVisualEvidence(captured.facts, captured.images, root, options.explicit, evidence);
}

async function saveEvidenceAndClose(
  reportRoot: string,
  evidence: Record<string, unknown>,
  space: SpaceInstance | undefined,
) {
  try {
    await writeFile(path.join(reportRoot, 'evidence.json'), JSON.stringify(evidence, null, 2));
  } finally {
    await space?.close();
  }
}

async function runVisualCase(options: VisualCase) {
  const target = await configuredModel();
  const reportRoot = path.resolve(
    process.env.SPACE_VISUAL_E2E_REPORT_DIR ?? 'artifacts/visual-review-live',
    options.explicit ? `${options.mode}-explicit` : options.mode,
  );
  await mkdir(reportRoot, { recursive: true });
  const evidence: Record<string, unknown> = await initialEvidence(options, target);
  let space: SpaceInstance | undefined;
  try {
    space = await launchSpace(`sdk-visual-live-${options.mode}-${Date.now()}`, {
      env: { KODAX_FORCE_MOCK: '0' },
    });
    await executeVisualCase(space, options, target, reportRoot, evidence);
  } finally {
    await saveEvidenceAndClose(reportRoot, evidence, space);
  }
}

for (const options of [
  { mode: 'ama', explicit: false },
  { mode: 'sa', explicit: false },
  { mode: 'sa', explicit: true },
] as const) {
  const title = options.explicit
    ? 'live explicit control inspects current pixels and reports data differences'
    : `live ${options.mode} automatically reviews its rendered result without an explicit skill request`;
  test(title, async () => {
    test.skip(
      !enabled,
      'Opt in with SPACE_LIVE_VISUAL_REVIEW_E2E=1; uses the configured Space model.',
    );
    await runVisualCase(options);
  });
}
