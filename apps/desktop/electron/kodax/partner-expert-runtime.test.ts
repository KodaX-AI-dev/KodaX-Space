import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, test } from 'node:test';
import JSZip from 'jszip';
import type {
  PartnerExpertSnapshotT,
  SessionEvent,
  SpaceExtensionManifestT,
} from '@kodax-space/space-ipc-schema';

// Scope Space and SDK before importing any of their singleton stores or providers.
process.env.KODAX_TEST_ONBOARDING = `expert-runtime-${randomUUID()}`;
process.env.KODAX_SPACE_ENABLE_SDK_EXTENSIONS = '0';
const credentialEnv = 'SPACE_EXPERT_TEST_UNUSED';
const previousCredential = process.env[credentialEnv];
process.env[credentialEnv] = 'expert-test-credential';
const { applySdkHomeEnv, getKodaxDir } = await import('./data-paths.js');
applySdkHomeEnv();
const profileDirectory = getKodaxDir();
await fs.mkdir(profileDirectory, { recursive: true });
await fs.writeFile(
  path.join(profileDirectory, 'config.json'),
  `${JSON.stringify(
    {
      customProviders: [
        {
          name: 'space-expert-runtime-test',
          protocol: 'openai',
          baseUrl: 'https://example.invalid/v1',
          apiKeyEnv: credentialEnv,
          model: 'test-model',
          reasoning: 'none',
        },
      ],
    },
    null,
    2,
  )}\n`,
);
const keychain = await import('../providers/keychain.js');
keychain._resetMemoryStoreForTesting();
const { RealKodaXSession } = await import('./real-session.js');
const { kodaxHost } = await import('./host.js');
const { SessionRuntimeStore, setSessionRuntimeStoreForTesting } =
  await import('./session-runtime-store.js');
const { setRendererTarget } = await import('../ipc/push.js');
setRendererTarget(() => null);
const { getSpaceExtensionStore, getSpaceExpertCatalog } =
  await import('../space-extensions/runtime.js');
const { setPartnerExpertForIpc } = await import('../ipc/session.js');
const { loadPersistedConversationHistory, setSessionStoreImpl } =
  await import('./session-store.js');
const { registerSpaceBuiltinSkills, _resetSpaceBuiltinSkillsForTests } =
  await import('../skill/space-builtins.js');
const { KodaXBaseProvider, registerModelProvider } = await import('@kodax-ai/kodax/llm');
const { awaitLatestCodingMemoryReviewDrain } = await import('@kodax-ai/kodax/coding');
const projectRoot = path.join(profileDirectory, 'project');
const boundaryProjectRoot = path.join(profileDirectory, 'boundary-project');
const systems: string[] = [];
const conversations: string[] = [];
const shippedExperts: PartnerExpertSnapshotT[] = [];
const expandedExpertTasks = [
  [
    'writing-mentor',
    '为小团队工具写中文首页文案，只有自动汇总周报这一已验证功能，不提供效率数据。',
  ],
  [
    'user-research',
    '三条反馈中两条来自同一用户：导出失败、再次导出失败；另一用户说分享方便。归纳线索，保留样本限制。',
  ],
  [
    'project-management',
    '周五交付，开发需要四天，评审在开发后需要两天，今天是周一。分析计划冲突。',
  ],
  ['data-analysis', 'A组10人成功1人，B组90人成功45人。计算总体成功率并说明分母。'],
  [
    'meeting-minutes',
    '会议记录：小王建议周五上线。小李说测试未完成，日期未定。整理决定和行动，不补造负责人。',
  ],
  ['email-editing', '客户问何时交付。团队原话是争取周五，尚未确认。起草回复，保留承诺强度。'],
  ['process-documentation', '采购流程：申请人提交，主管审批。超过五万元还需财务审批。缺少材料退回；审批通过才能采购。整理SOP，不编造时限。'],
  ['customer-support', '客户说导出失败要求今天修好和退款。只确认正在调查，无修复时间、退款决定或升级记录。写回复草稿和内部待核实项。'],
  ['knowledge-synthesis', '正式政策A：2026年9月1日起报销上限500元。9月3日聊天B提议改成800元但未批准。C转发B。整理知识条目，保留冲突与来源，不能把转发视为独立证据。'],
  ['call-preparation', '准备30分钟拜访，客户预算与决策权未知，希望两周交付但未获批准。给议程和待确认项。'],
  ['interview-design', '为SQL数据分析师设计30分钟面试，给问题与评分锚点。没有候选人回答，不评分。'],
  ['new-hire-onboarding', '制定入职首周计划，导师和账号审批尚未确认。只给建议，不发邀请。'],
  ['presentation-html', '制作4页离线HTML演示和讲稿，只有本期6/10人完成的数据，不编造增长或称为PPTX。'],
  ['status-report', '本周计划10项、完成6项；其中2项验收未通过。预算实际8万元、总预算10万元。没有上期数据和新增时间承诺。生成周报，区别开发完成与验收完成，不编造趋势。'],
] as const;

const sessions: InstanceType<typeof RealKodaXSession>[] = [];
let writingExpert: PartnerExpertSnapshotT;
let researchExpert: PartnerExpertSnapshotT;
let skillExpert: PartnerExpertSnapshotT;
let missingSkillExpert: PartnerExpertSnapshotT;
const restrictedSkillKinds = ['dynamic', 'hook', 'fork'] as const;
const restrictedExperts = new Map<string, PartnerExpertSnapshotT>();
let beforeResponse: (() => Promise<void>) | undefined;

class RecordingProvider extends KodaXBaseProvider {
  readonly name = 'space-expert-runtime-test';
  readonly supportsThinking = false;
  protected readonly config = {
    apiKeyEnv: 'SPACE_EXPERT_TEST_UNUSED',
    model: 'test-model',
    supportsThinking: false,
  };
  override isConfigured(): boolean {
    return true;
  }
  async stream(
    ...args: Parameters<InstanceType<typeof KodaXBaseProvider>['stream']>
  ): Promise<Awaited<ReturnType<InstanceType<typeof KodaXBaseProvider>['stream']>>> {
    if (args[2].includes('KodaX Space Partner surface profile:')) {
      systems.push(args[2]);
      conversations.push(JSON.stringify(args[0]));
      await beforeResponse?.();
    }
    return {
      textBlocks: [{ type: 'text', text: 'Done.' }],
      toolBlocks: [],
      thinkingBlocks: [],
      stopReason: 'end_turn',
    };
  }
}

before(async () => {
  await fs.mkdir(projectRoot, { recursive: true });
  const skillDirectory = path.join(projectRoot, '.kodax', 'skills', 'expert-default-fixture');
  await fs.mkdir(skillDirectory, { recursive: true });
  await fs.writeFile(
    path.join(skillDirectory, 'SKILL.md'),
    '---\nname: expert-default-fixture\ndescription: A drafting rubric\n---\nEXPERT_DEFAULT_SKILL_BODY\nApply this rubric to: $ARGUMENTS\n',
  );
  const explicitDirectory = path.join(projectRoot, '.kodax', 'skills', 'expert-explicit-fixture');
  await fs.mkdir(explicitDirectory, { recursive: true });
  await fs.writeFile(
    path.join(explicitDirectory, 'SKILL.md'),
    '---\nname: expert-explicit-fixture\ndescription: A user chosen rubric\n---\nEXPERT_EXPLICIT_SKILL_BODY\nThe explicit task is: $ARGUMENTS\n',
  );
  for (const kind of restrictedSkillKinds) {
    const name = `expert-${kind}-fixture`;
    const directory = path.join(boundaryProjectRoot, '.kodax', 'skills', name);
    const command = `touch "${path.join(boundaryProjectRoot, `${kind}-must-not-run`)}"`;
    const extra =
      kind === 'fork'
        ? 'context: fork\n'
        : kind === 'hook'
          ? `hooks:\n  SessionStart:\n    - command: ${JSON.stringify(command)}\n`
          : '';
    const body = kind === 'hook' ? 'A role with a shell hook.' : `!\`${command}\``;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Boundary fixture\n${extra}---\n${body}\n`,
    );
  }
  const html = '<!doctype html><title>Expert fixture</title>';
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      formatVersion: 1,
      hostApiVersion: 1,
      id: 'partner.library',
      name: 'Fixture experts',
      description: 'Local execution fixture',
      version: '1.0.0',
      ui: { entry: 'ui/index.html', sha256: createHash('sha256').update(html).digest('hex') },
      experts: [
        {
          id: 'writing-guide',
          revision: 1,
          name: 'Writing guide',
          description: 'Drafting',
          prompt: 'EXPERT-WRITING: Keep original meaning.',
          starterTasks: [],
        },
        {
          id: 'research-guide',
          revision: 1,
          name: 'Research guide',
          description: 'Research',
          prompt: 'EXPERT-RESEARCH: Explain evidence and limitations.',
          starterTasks: [],
        },
        {
          id: 'skill-guide',
          revision: 1,
          name: 'Skill guide',
          description: 'Expert with one Skill',
          prompt: 'EXPERT-SKILLED: Preserve meaning and apply the chosen rubric.',
          starterTasks: [],
          skillRef: 'expert-default-fixture',
        },
        {
          id: 'missing-skill-guide',
          revision: 1,
          name: 'Missing Skill guide',
          description: 'Previously bound Skill is unavailable',
          prompt: 'EXPERT-MISSING-SKILL: Preserve the selected role.',
          starterTasks: [],
          skillRef: 'expert-missing-fixture',
        },
        ...restrictedSkillKinds.map((kind) => ({
          id: `${kind}-guide`,
          revision: 1,
          name: `${kind} guide`,
          description: 'Partner boundary fixture',
          prompt: 'EXPERT-BOUNDARY: The role does not grant shell authority.',
          starterTasks: [],
          skillRef: `expert-${kind}-fixture`,
        })),
      ],
      connectors: [],
    }),
  );
  zip.file('ui/index.html', html);
  const archive = path.join(profileDirectory, 'fixture.space-extension');
  await fs.writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  await getSpaceExtensionStore().install(archive);
  await getSpaceExtensionStore().setEnabled('partner.library', true);
  writingExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'writing-guide',
    revision: 1,
  });
  researchExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'research-guide',
    revision: 1,
  });
  skillExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'skill-guide',
    revision: 1,
  });
  missingSkillExpert = await getSpaceExpertCatalog().resolve({
    extensionId: 'partner.library',
    expertId: 'missing-skill-guide',
    revision: 1,
  });
  for (const kind of restrictedSkillKinds) {
    restrictedExperts.set(
      kind,
      await getSpaceExpertCatalog().resolve({
        extensionId: 'partner.library',
        expertId: `${kind}-guide`,
        revision: 1,
      }),
    );
  }
});

before(async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
  await registerSpaceBuiltinSkills(path.join(repositoryRoot, 'resources/builtin-skills'));
  const manifest: SpaceExtensionManifestT = JSON.parse(
    await fs.readFile(
      path.join(repositoryRoot, 'extensions/partner-library/manifest.json'),
      'utf8',
    ),
  );
  const html = await fs.readFile(
    path.join(repositoryRoot, 'extensions/partner-library/ui/index.html'),
  );
  manifest.ui.sha256 = createHash('sha256').update(html).digest('hex');
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  zip.file('ui/index.html', html);
  const archive = path.join(profileDirectory, 'shipped.space-extension');
  await fs.writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  await getSpaceExtensionStore().install(archive);
  await getSpaceExtensionStore().setEnabled(manifest.id, true);
  for (const id of [
    'product-management',
    'deep-research',
    ...expandedExpertTasks.map(([id]) => id),
  ]) {
    const definition = manifest.experts.find((entry) => entry.id === id)!;
    shippedExperts.push(
      await getSpaceExpertCatalog().resolve({
        extensionId: manifest.id,
        expertId: id,
        revision: definition.revision,
      }),
    );
  }
});

const unregisterProvider = registerModelProvider(
  'space-expert-runtime-test',
  () => new RecordingProvider(),
);
after(async () => {
  await awaitLatestCodingMemoryReviewDrain(2_000);
  unregisterProvider();
  _resetSpaceBuiltinSkillsForTests();
  keychain._resetMemoryStoreForTesting();
  await fs.rm(profileDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  if (previousCredential === undefined) delete process.env[credentialEnv];
  else process.env[credentialEnv] = previousCredential;
});
afterEach(async () => {
  beforeResponse = undefined;
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  await kodaxHost.disposeAll();
  setSessionStoreImpl(null);
  setSessionRuntimeStoreForTesting(null);
  await awaitLatestCodingMemoryReviewDrain(2_000);
  systems.length = 0;
  conversations.length = 0;
});

function makeSession(expert?: PartnerExpertSnapshotT, workingDirectory = projectRoot) {
  const events: SessionEvent[] = [];
  const session = new RealKodaXSession({
    sessionId: `expert-${randomUUID()}`,
    projectRoot: workingDirectory,
    provider: 'space-expert-runtime-test',
    reasoningMode: 'off',
    permissionMode: 'plan',
    agentMode: 'sa',
    surface: 'partner',
    partnerExpert: expert,
    emit: (event) => events.push(event),
    requestPermission: async () => 'deny',
  });
  sessions.push(session);
  return { session, events };
}

function makeHostSession(expert?: PartnerExpertSnapshotT) {
  const { sessionId } = kodaxHost.createSession({
    projectRoot,
    provider: 'space-expert-runtime-test',
    reasoningMode: 'off',
    permissionMode: 'plan',
    agentMode: 'sa',
    surface: 'partner',
    partnerExpert: expert,
  });
  const session = kodaxHost.get(sessionId);
  assert.ok(session);
  return session;
}

async function sendAndRecord(session: ReturnType<typeof makeHostSession>, message: string) {
  const count = systems.length;
  assert.deepEqual(await session.send(message), { accepted: true, queued: false });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, count + 1, 'the actual SDK must call the controlled provider');
  return systems.at(-1)!;
}

async function selectShippedExpert(
  sessionId: string,
  expert: PartnerExpertSnapshotT,
  useSkill = true,
) {
  return setPartnerExpertForIpc({
    sessionId,
    expert: {
      extensionId: expert.extensionId,
      expertId: expert.expert.id,
      revision: expert.expert.revision,
      useSkill,
    },
  });
}

async function resumeRecordedSession(sessionId: string) {
  await kodaxHost.disposeAll();
  assert.equal(await kodaxHost.tryResume(sessionId), true);
  const session = kodaxHost.get(sessionId);
  assert.ok(session);
  return session;
}

for (const [index, method] of [
  '证据 → 用户问题 → 需求 → 验收',
  '多个转载不能算独立交叉验证',
].entries()) {
  test(`shipped ${index === 0 ? 'role' : 'task'} expert persists across tasks, Skill choices and actual host restoration`, async () => {
    const expert = shippedExperts[index]!;
    let session = makeHostSession();
    await kodaxHost.persistRuntime(session.sessionId);
    await selectShippedExpert(session.sessionId, expert);
    for (const message of [
      'FIRST-DECISION: 用户是小团队。',
      'FOLLOW-UP: 沿用前述用户，补充验收。',
    ]) {
      const system = await sendAndRecord(session, message);
      assert.ok(system.includes(expert.expert.prompt));
      assert.ok(system.includes(method));
      assert.match(system, /until the user switches or removes/);
    }
    assert.match(conversations.at(-1)!, /FIRST-DECISION/);
    await selectShippedExpert(session.sessionId, expert, false);
    session = await resumeRecordedSession(session.sessionId);
    assert.deepEqual(session.partnerExpert, { ...expert, useSkill: false });
    const promptOnly = await sendAndRecord(session, 'RESTORED-FOLLOW-UP: 简短解释刚才的取舍。');
    assert.ok(promptOnly.includes(expert.expert.prompt));
    assert.ok(!promptOnly.includes(method));
    assert.match(conversations.at(-1)!, /FIRST-DECISION/);
    await selectShippedExpert(session.sessionId, expert);
    const explicit = await sendAndRecord(session, '/expert-explicit-fixture 临时审阅方法。');
    assert.ok(explicit.includes(expert.expert.prompt));
    assert.ok(explicit.includes('EXPERT_EXPLICIT_SKILL_BODY'));
    assert.ok(!explicit.includes(method));
    const next = await sendAndRecord(session, '继续下一项任务。');
    assert.ok(next.includes(method));
    assert.ok(!next.includes('EXPERT_EXPLICIT_SKILL_BODY'));
    session = await resumeRecordedSession(session.sessionId);
    assert.ok((await sendAndRecord(session, '继续之前的任务。')).includes(method));
  });
}

for (const [id, task] of expandedExpertTasks) {
  test(`expanded ${id} loads the actual bundled method and checks across host restoration`, async () => {
    const expert = shippedExperts.find((entry) => entry.expert.id === id)!;
    assert.ok(expert.expert.workflow);
    const rawMethod = await fs.readFile(
      path.resolve(
        import.meta.dirname,
        '../../../../resources/builtin-skills',
        expert.expert.skillRef!,
        'SKILL.md',
      ),
      'utf8',
    );
    const methodBody = rawMethod.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
    let session = makeHostSession();
    await kodaxHost.persistRuntime(session.sessionId);
    await selectShippedExpert(session.sessionId, expert);
    const first = await sendAndRecord(session, task);
    assert.ok(first.includes(methodBody), 'full shipped method reaches the actual model call');
    for (const check of expert.expert.workflow.qualityChecks) assert.ok(first.includes(check));
    session = await resumeRecordedSession(session.sessionId);
    const followUp = await sendAndRecord(session, '沿用上述材料，复核结果中的证据与不确定性。');
    assert.ok(followUp.includes(expert.expert.prompt));
    assert.ok(followUp.includes(methodBody));
    assert.ok(
      conversations.at(-1)!.includes(task),
      'original task survives actual host restoration',
    );
    await selectShippedExpert(session.sessionId, expert, false);
    const disabled = await sendAndRecord(session, '简短说明下一步。');
    assert.ok(disabled.includes(expert.expert.prompt));
    assert.ok(!disabled.includes(methodBody), 'method remains optional independently of role');
  });
}

test('switching and removing shipped experts preserves history while another conversation stays unbound', async () => {
  const [product, research] = shippedExperts;
  let session = makeHostSession(product!);
  await kodaxHost.persistRuntime(session.sessionId);
  await sendAndRecord(session, 'ORIGINAL-CONTEXT: 目标是服务小团队。');
  await selectShippedExpert(session.sessionId, research!);
  const switched = await sendAndRecord(session, '沿用目标，研究另一种方案。');
  assert.ok(switched.includes(research!.expert.prompt));
  assert.ok(!switched.includes(product!.expert.prompt));
  assert.ok(!switched.includes('证据 → 用户问题 → 需求 → 验收'));
  const independent = await sendAndRecord(makeHostSession(), '这是另一个会话。');
  assert.ok(!independent.includes(research!.expert.prompt));
  assert.doesNotMatch(conversations.at(-1)!, /ORIGINAL-CONTEXT/);
  await setPartnerExpertForIpc({ sessionId: session.sessionId, expert: null });
  session = await resumeRecordedSession(session.sessionId);
  assert.equal(session.partnerExpert, undefined);
  const removed = await sendAndRecord(session, 'REMOVED-FOLLOW-UP: 继续讨论目标。');
  assert.ok(!removed.includes(research!.expert.prompt));
  assert.ok(!removed.includes('多个转载不能算独立交叉验证'));
  assert.match(conversations.at(-1)!, /ORIGINAL-CONTEXT/);
  const history = await loadPersistedConversationHistory(session.sessionId);
  assert.equal(history.supported, true);
  assert.match(JSON.stringify(history.data), /ORIGINAL-CONTEXT/);
  assert.match(JSON.stringify(history.data), /REMOVED-FOLLOW-UP/);
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Partner expert runtime test timed out');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

test('real Partner sends include the selected role on every SDK run without leaking to another Session', async () => {
  const first = makeSession(writingExpert);
  const second = makeSession(researchExpert);
  await first.session.send('Review this sentence.');
  await waitFor(() => !first.session.isRunning());
  await first.session.send('Review the next sentence.');
  await waitFor(() => !first.session.isRunning());
  await second.session.send('Summarize this source.');
  await waitFor(() => !second.session.isRunning());

  assert.equal(systems.length, 3);
  assert.ok(systems[0]!.includes('EXPERT-WRITING'));
  assert.ok(systems[1]!.includes('EXPERT-WRITING'));
  assert.ok(!systems[0]!.includes('EXPERT-RESEARCH'));
  assert.ok(systems[2]!.includes('EXPERT-RESEARCH'));
  assert.ok(!systems[2]!.includes('EXPERT-WRITING'));
  assert.ok(
    systems.every(
      (system) =>
        !system.includes('EXPERT_DEFAULT_SKILL_BODY') &&
        !system.includes('EXPERT_EXPLICIT_SKILL_BODY'),
    ),
  );
  assert.equal(first.events.filter((event) => event.kind === 'session_error').length, 0);
});

test('disabling a bound expert package rejects a fresh send rather than silently running the base role', async (t) => {
  const { session } = makeSession(writingExpert);
  await getSpaceExtensionStore().setEnabled('partner.library', false);
  t.after(() => getSpaceExtensionStore().setEnabled('partner.library', true));

  await assert.rejects(
    () => session.send('This draft must remain editable.'),
    /expert.*unavailable.*disabled/i,
  );
  assert.equal(session.isRunning(), false);
  assert.equal(systems.length, 0);
  assert.deepEqual(session.partnerExpert, writingExpert);
});

test('a queued next turn rechecks the extension after disable and never calls the provider', async (t) => {
  const { session, events } = makeSession(writingExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => {
    release();
  });
  t.after(() => getSpaceExtensionStore().setEnabled('partner.library', true));
  await session.send('The first turn may finish with its original expert.');
  await waitFor(() => systems.length === 1);
  const queued = await session.send('Only run when the expert is available.', undefined, {
    queueMode: 'after-turn',
  });
  assert.equal(queued.accepted, true);
  await getSpaceExtensionStore().setEnabled('partner.library', false);
  release();
  await waitFor(() => !session.isRunning());

  assert.equal(systems.length, 1);
  assert.ok(
    events.some(
      (event) => event.kind === 'session_error' && /expert.*unavailable/i.test(event.error),
    ),
  );
});

test('a committed expert change applies to the queued next turn, never the running turn', async (t) => {
  const session = makeHostSession(writingExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => {
    release();
  });
  await session.send('First turn.');
  await waitFor(() => systems.length === 1);
  await session.send('Queued next turn.', undefined, { queueMode: 'after-turn' });
  assert.equal(await kodaxHost.setPartnerExpert(session.sessionId, researchExpert), 'ok');
  release();
  await waitFor(() => !session.isRunning());

  assert.equal(systems.length, 2);
  assert.ok(systems[0]!.includes('EXPERT-WRITING'));
  assert.ok(!systems[0]!.includes('EXPERT-RESEARCH'));
  assert.ok(systems[1]!.includes('EXPERT-RESEARCH'));
});

test('a queued turn starting before the expert write ACK uses the old role until a later run', async (t) => {
  const session = makeHostSession(writingExpert);
  await kodaxHost.persistRuntime(session.sessionId);
  let releaseResponse!: () => void;
  let releaseWrite!: () => void;
  let entered!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  const writeGate = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  const writeEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  class SlowStore extends SessionRuntimeStore {
    override async set(
      ...args: Parameters<InstanceType<typeof SessionRuntimeStore>['set']>
    ): Promise<boolean> {
      entered();
      await writeGate;
      return super.set(...args);
    }
  }
  beforeResponse = () => responseGate;
  t.after(() => {
    releaseResponse();
    releaseWrite();
  });
  await session.send('First turn.');
  await waitFor(() => systems.length === 1);
  await session.send('Queued before expert ACK.', undefined, { queueMode: 'after-turn' });
  setSessionRuntimeStoreForTesting(
    new SlowStore(path.join(profileDirectory, 'space', 'session-runtime')),
  );
  const changing = kodaxHost.setPartnerExpert(session.sessionId, researchExpert);
  await writeEntered;
  releaseResponse();
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems.every((system) => system.includes('EXPERT-WRITING')));
  releaseWrite();
  assert.equal(await changing, 'ok');
  await session.send('Sent after expert ACK.');
  await waitFor(() => !session.isRunning());
  assert.ok(systems[2]!.includes('EXPERT-RESEARCH'));
});

test('uninstalling a bound package prevents the next real run without discarding its saved role', async (t) => {
  const { session } = makeSession(writingExpert);
  t.after(async () => {
    await getSpaceExtensionStore().install(path.join(profileDirectory, 'fixture.space-extension'));
    await getSpaceExtensionStore().setEnabled('partner.library', true);
  });
  await getSpaceExtensionStore().uninstall('partner.library');
  await assert.rejects(() => session.send('Use the removed expert.'), /Partner expert unavailable/);
  assert.deepEqual(session.partnerExpert, writingExpert);
  assert.equal(session.isRunning(), false);
  assert.equal(systems.length, 0);
});

test('an expert default Skill reaches the actual SDK model on every turn with that turn’s arguments', async () => {
  const { session } = makeSession(skillExpert);
  assert.deepEqual(await session.send('Review FIRST-DRAFT-TASK.'), {
    accepted: true,
    queued: false,
  });
  await waitFor(() => !session.isRunning());
  assert.deepEqual(await session.send('Review SECOND-DRAFT-TASK.'), {
    accepted: true,
    queued: false,
  });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems.every((system) => system.includes('EXPERT-SKILLED')));
  assert.ok(systems.every((system) => system.includes('EXPERT_DEFAULT_SKILL_BODY')));
  assert.ok(systems[0]!.includes('FIRST-DRAFT-TASK'));
  assert.ok(systems[1]!.includes('SECOND-DRAFT-TASK'));
});

test('an after-turn queued run prepares the same expert Skill with the queued task instead of bypassing it', async (t) => {
  const { session } = makeSession(skillExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => release());
  await session.send('FIRST-QUEUED-SKILL-TASK');
  await waitFor(() => systems.length === 1);
  const queued = await session.send('SECOND-QUEUED-SKILL-TASK', undefined, {
    queueMode: 'after-turn',
  });
  assert.equal(queued.accepted && queued.queued, true);
  release();
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems[1]!.includes('EXPERT_DEFAULT_SKILL_BODY'));
  assert.ok(systems[1]!.includes('SECOND-QUEUED-SKILL-TASK'));
  assert.ok(!systems[1]!.includes('FIRST-QUEUED-SKILL-TASK'));
});

test('a user-selected slash Skill wins over the expert default without changing the expert role', async () => {
  const { session } = makeSession(skillExpert);
  assert.deepEqual(await session.send('/expert-explicit-fixture EXPLICIT-CHOICE-TASK'), {
    accepted: true,
    queued: false,
  });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(systems[0]!.includes('EXPERT-SKILLED'));
  assert.ok(systems[0]!.includes('EXPERT_EXPLICIT_SKILL_BODY'));
  assert.ok(systems[0]!.includes('EXPLICIT-CHOICE-TASK'));
  assert.ok(!systems[0]!.includes('EXPERT_DEFAULT_SKILL_BODY'));
  assert.deepEqual(session.partnerExpert, skillExpert);
});

test('prompt-only disables only the expert default and leaves user-selected Skills available', async () => {
  const { session } = makeSession({ ...skillExpert, useSkill: false });
  await session.send('Use only the expert prompt.');
  await waitFor(() => !session.isRunning());
  await session.send('/expert-explicit-fixture User selected this Skill.');
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 2);
  assert.ok(systems.every((system) => system.includes('EXPERT-SKILLED')));
  assert.ok(systems.every((system) => !system.includes('EXPERT_DEFAULT_SKILL_BODY')));
  assert.ok(!systems[0]!.includes('EXPERT_EXPLICIT_SKILL_BODY'));
  assert.ok(systems[1]!.includes('EXPERT_EXPLICIT_SKILL_BODY'));
  assert.equal(session.partnerExpert?.useSkill, false);
});

test('a missing default rejects before model admission until the user explicitly chooses prompt-only', async () => {
  const session = makeHostSession(missingSkillExpert);
  await kodaxHost.persistRuntime(session.sessionId);
  assert.deepEqual(await session.send('MISSING-SKILL-TASK'), {
    accepted: false,
    reason: 'skill_not_found',
    queueMode: 'interrupt',
  });
  assert.equal(session.isRunning(), false);
  assert.equal(systems.length, 0);
  const state = await setPartnerExpertForIpc({
    sessionId: session.sessionId,
    expert: {
      extensionId: missingSkillExpert.extensionId,
      expertId: missingSkillExpert.expert.id,
      revision: missingSkillExpert.expert.revision,
      useSkill: false,
    },
  });
  assert.deepEqual(state.expert, { ...missingSkillExpert, useSkill: false });
  assert.deepEqual(await session.send('PROMPT-ONLY-TASK'), { accepted: true, queued: false });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(systems[0]!.includes('EXPERT-MISSING-SKILL'));
  assert.ok(!systems[0]!.includes('EXPERT_DEFAULT_SKILL_BODY'));
  await assert.rejects(
    () =>
      setPartnerExpertForIpc({
        sessionId: session.sessionId,
        expert: {
          extensionId: missingSkillExpert.extensionId,
          expertId: missingSkillExpert.expert.id,
          revision: missingSkillExpert.expert.revision,
          useSkill: true,
        },
      }),
    /Skill.*unavailable/,
  );
  assert.equal(session.partnerExpert?.useSkill, false);
});

test('an unavailable default Skill cannot fall through on an internally started queued turn', async (t) => {
  const { session, events } = makeSession(writingExpert);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  beforeResponse = () => gate;
  t.after(() => release());
  await session.send('Current task.');
  await waitFor(() => systems.length === 1);
  await session.send('QUEUED-MISSING-SKILL-TASK', undefined, { queueMode: 'after-turn' });
  // Models a restored binding whose external Skill was removed before the next turn.
  session.partnerExpert = structuredClone(missingSkillExpert);
  release();
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(
    events.some(
      (event) => event.kind === 'session_error' && event.error.includes('skill_not_found'),
    ),
  );
  assert.deepEqual(session.partnerExpert, missingSkillExpert);
});

for (const { kind, reason } of [
  { kind: 'hook', reason: 'skill_blocked' },
  { kind: 'fork', reason: 'skill_fork_unsupported' },
]) {
  test(`an expert's ${kind} Skill cannot bypass Partner's existing execution boundary`, async () => {
    const expert = restrictedExperts.get(kind);
    assert.ok(expert);
    const { session } = makeSession(expert, boundaryProjectRoot);
    assert.deepEqual(await session.send('Check the boundary.'), {
      accepted: false,
      reason,
      queueMode: 'interrupt',
    });
    assert.equal(session.isRunning(), false);
    assert.equal(systems.length, 0);
    await assert.rejects(fs.access(path.join(boundaryProjectRoot, `${kind}-must-not-run`)), {
      code: 'ENOENT',
    });
    assert.deepEqual(session.partnerExpert, expert);
  });
}

test('expert Skill dynamic context retains the SDK disabled placeholder and never runs its shell command', async () => {
  const expert = restrictedExperts.get('dynamic');
  assert.ok(expert);
  const { session } = makeSession(expert, boundaryProjectRoot);
  // The shared SDK resolves a disabled command to an error placeholder rather than
  // rejecting the whole Skill. Preserve that existing behavior, without shell authority.
  assert.deepEqual(await session.send('Check dynamic context.'), { accepted: true, queued: false });
  await waitFor(() => !session.isRunning());
  assert.equal(systems.length, 1);
  assert.ok(systems[0]!.includes('Dynamic context disabled by host'));
  await assert.rejects(fs.access(path.join(boundaryProjectRoot, 'dynamic-must-not-run')), {
    code: 'ENOENT',
  });
});
