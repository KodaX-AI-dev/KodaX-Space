import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import JSZip from 'jszip';
import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';
import { SpaceExpertCatalog } from './experts.js';
import { SpaceExtensionStore } from './store.js';

const HTML = '<!doctype html><html><body>Experts</body></html>';
const WRITING_MENTOR: SpaceExpertDefinitionT = {
  id: 'writing-mentor',
  revision: 1,
  name: '写作导师',
  description: '帮助整理结构并提升表达。',
  prompt: '你是写作导师。保留用户观点，指出结构与表达上的改进。',
  starterTasks: ['帮我梳理这篇文档的结构。'],
};

test('user copies preserve workflows for old editors, accept edits and can explicitly clear them', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  const workflow = {
    inputs: ['Question'],
    deliverables: ['Report'],
    qualityChecks: ['Evidence'],
    connectorNeeds: [],
  };
  const preset = { ...WRITING_MENTOR, workflow };
  await store.install(await buildArchive(directory, [preset]));
  await store.setEnabled('test.library', true);
  const values = { name: 'My method', description: '', prompt: 'My judgement', starterTasks: [] };
  const copy = await catalog.save({
    extensionId: 'test.library',
    expertId: preset.id,
    expectedRevision: 1,
    values,
  });
  assert.deepEqual(copy.workflow, workflow);
  const changed = { ...workflow, deliverables: ['Decision report'] };
  const updated = await catalog.save({
    extensionId: 'test.library',
    expertId: copy.id,
    expectedRevision: 1,
    values: { ...values, workflow: changed },
  });
  assert.deepEqual(updated.workflow, changed);
  const cleared = await catalog.save({
    extensionId: 'test.library',
    expertId: copy.id,
    expectedRevision: 2,
    values: { ...values, workflow: null },
  });
  assert.equal(cleared.workflow, undefined);
  assert.deepEqual(
    (await catalog.list('test.library')).find((expert) => expert.id === preset.id)?.workflow,
    workflow,
  );
});

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'space-experts-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new SpaceExtensionStore(path.join(directory, 'extensions'));
  const userDataRoot = path.join(directory, 'extension-data');
  const catalog = new SpaceExpertCatalog(store, userDataRoot);
  return { directory, store, catalog, userDataRoot };
}

async function buildArchive(
  directory: string,
  experts = [WRITING_MENTOR],
  version = '0.2.0',
  id = 'test.library',
  connectors: Array<{
    id: string;
    adapter: 'feishu-cli';
    name: string;
    description: string;
  }> = [],
) {
  const hasWorkflow = experts.some((expert) => expert.workflow || expert.retired !== undefined);
  const hostApiVersion = hasWorkflow
    ? 4
    : experts.some((expert) => expert.capabilityGuide)
      ? 3
      : experts.some((expert) => expert.expertType || expert.category || expert.listingType)
        ? 2
        : 1;
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      formatVersion: 1,
      hostApiVersion,
      ...(hasWorkflow ? { requiredHostCapabilities: ['partnerExpertWorkflowsV1'] } : {}),
      id,
      name: 'Test Library',
      description: 'Expert catalog',
      version,
      ui: { entry: 'ui/index.html', sha256: createHash('sha256').update(HTML).digest('hex') },
      experts,
      connectors,
    }),
  );
  zip.file('ui/index.html', HTML);
  const archivePath = path.join(directory, 'experts.space-extension');
  await fs.writeFile(archivePath, await zip.generateAsync({ type: 'nodebuffer' }));
  return archivePath;
}

function pauseAtomicReplacement(target: string) {
  const originalRename = fs.rename;
  const originalLink = fs.link;
  let signalEntered!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  const linkGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let forceFallback = true;
  fs.rename = async (source, destination) => {
    if (forceFallback && String(destination) === target && String(source).includes('-new-')) {
      forceFallback = false;
      throw Object.assign(new Error('Simulated Windows rename restriction'), { code: 'EPERM' });
    }
    return originalRename(source, destination);
  };
  fs.link = async (source, destination) => {
    if (String(destination) === target && String(source).includes('-new-')) {
      signalEntered();
      await linkGate;
    }
    return originalLink(source, destination);
  };
  return {
    entered,
    release,
    restore() {
      fs.rename = originalRename;
      fs.link = originalLink;
      release();
    },
  };
}

test('only an enabled installed package can list and resolve a versioned expert snapshot', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await assert.rejects(catalog.list('test.library'), /disabled/i);
  await store.setEnabled('test.library', true);
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR]);
  const snapshot = await catalog.resolve({
    extensionId: 'test.library',
    expertId: 'writing-mentor',
    revision: 1,
  });
  assert.deepEqual(snapshot, {
    extensionId: 'test.library',
    extensionVersion: '0.2.0',
    expert: WRITING_MENTOR,
  });
  await catalog.requireAvailable(snapshot);
});

test('a modified installed manifest cannot supply a silently changed expert catalog', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const packages = path.join(directory, 'extensions', 'packages');
  const [packageDirectory] = await fs.readdir(packages);
  assert.ok(packageDirectory);
  const manifestPath = path.join(packages, packageDirectory, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.experts[0].prompt = 'Changed outside the extension manager';
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(store.getManifest('test.library'), /manifest.*integrity/i);
  await assert.rejects(catalog.list('test.library'), /manifest.*integrity/i);
});

test('an extension upgrade never mutates an existing snapshot but rejects a stale new selection', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const ref = { extensionId: 'test.library', expertId: 'writing-mentor', revision: 1 };
  const snapshot = await catalog.resolve(ref);
  const original = structuredClone(snapshot);
  const revisedExpert = {
    ...WRITING_MENTOR,
    revision: 2,
    prompt: 'The second revision has a new prompt.',
  };
  await store.install(await buildArchive(directory, [revisedExpert], '0.3.0'));
  await assert.rejects(catalog.requireAvailable(snapshot), /disabled/i);
  await store.setEnabled('test.library', true);

  await catalog.requireAvailable(snapshot);
  assert.deepEqual(snapshot, original);
  assert.equal(snapshot.expert.revision, 1);
  assert.equal(snapshot.expert.prompt, WRITING_MENTOR.prompt);
  await assert.rejects(catalog.resolve(ref), /revision changed/i);
  const newest = await catalog.resolve({ ...ref, revision: 2 });
  assert.equal(newest.extensionVersion, '0.3.0');
  assert.deepEqual(newest.expert, revisedExpert);
});

test('removing an expert, disabling its package, or uninstalling it makes its binding unavailable', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const snapshot = await catalog.resolve({
    extensionId: 'test.library',
    expertId: 'writing-mentor',
    revision: 1,
  });
  await store.setEnabled('test.library', false);
  await assert.rejects(catalog.requireAvailable(snapshot), /disabled/i);
  await store.install(await buildArchive(directory, [], '0.3.0'));
  await store.setEnabled('test.library', true);
  await assert.rejects(catalog.requireAvailable(snapshot), /no longer available/i);
  assert.equal(snapshot.expert.prompt, WRITING_MENTOR.prompt);
  await store.uninstall('test.library');
  await assert.rejects(catalog.requireAvailable(snapshot), /not installed/i);
});

test('unknown expert references cannot resolve and callers cannot mutate persisted definitions', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  await assert.rejects(
    catalog.resolve({ extensionId: 'test.library', expertId: 'unknown', revision: 1 }),
    /no longer available/i,
  );
  await assert.rejects(catalog.list('missing.library'), /not installed/i);
  const list = await catalog.list('test.library');
  list[0]!.prompt = 'caller changed its copy';
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR]);
});

test('an existing Skill reference is returned as data without loading or installing a Skill', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  const referenced = { ...WRITING_MENTOR, skillRef: 'existing-doc-skill' };
  await store.install(await buildArchive(directory, [referenced]));
  await store.setEnabled('test.library', true);
  const snapshot = await catalog.resolve({
    extensionId: 'test.library',
    expertId: 'writing-mentor',
    revision: 1,
  });
  assert.equal(snapshot.expert.skillRef, 'existing-doc-skill');
  assert.deepEqual((await fs.readdir(directory)).sort(), ['experts.space-extension', 'extensions']);
});

test('large expert catalogs cannot publish a registry that the store can no longer read', async (t) => {
  const { directory, store } = await fixture(t);
  const experts = Array.from({ length: 7 }, (_, index) => ({
    ...WRITING_MENTOR,
    id: `writer-${index}`,
    prompt: 'x'.repeat(7_800),
  }));
  const installedIds: string[] = [];
  let rejection: unknown;
  for (let index = 0; index < 25; index++) {
    const id = `test.library-${index}`;
    try {
      await store.install(await buildArchive(directory, experts, '0.2.0', id));
      installedIds.push(id);
    } catch (error) {
      rejection = error;
      break;
    }
  }
  assert.ok(rejection instanceof Error);
  assert.match(rejection.message, /registry.*size limit/i);
  assert.ok(installedIds.length > 0);
  assert.deepEqual(
    (await store.list()).map((entry) => entry.id),
    installedIds,
  );
});

test('a created user expert is versioned, listed and resolved after reopening the catalog', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = {
    name: '审阅助手',
    description: '检查文稿证据。',
    prompt: '请指出事实依据与未验证的结论。',
    starterTasks: ['帮我检查这份草稿。'],
    skillRef: 'documents:review',
  };
  const created = await catalog.save({ extensionId: 'test.library', values });
  assert.match(created.id, /^user\.[a-f0-9-]{36}$/);
  assert.equal(created.revision, 1);
  assert.deepEqual(created, { ...values, id: created.id, revision: 1 });
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, created]);
  const reopened = new SpaceExpertCatalog(store, userDataRoot);
  const snapshot = await reopened.resolve({
    extensionId: 'test.library',
    expertId: created.id,
    revision: 1,
  });
  assert.deepEqual(snapshot.expert, created);
  await reopened.requireAvailable(snapshot);
});

test('editing a built-in expert creates a user copy without accepting stale or missing bases', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const input = {
    extensionId: 'test.library',
    expertId: WRITING_MENTOR.id,
    expectedRevision: 1,
    values: {
      name: '我的写作导师',
      description: '团队写作规范',
      prompt: '先列出摘要，再润色原文。',
      starterTasks: [],
    },
  };
  const copy = await catalog.save(input);
  assert.match(copy.id, /^user\./);
  assert.equal(copy.revision, 1);
  assert.deepEqual((await store.getManifest('test.library')).experts, [WRITING_MENTOR]);
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, copy]);
  await assert.rejects(catalog.save({ ...input, expectedRevision: 2 }), /revision/i);
  await assert.rejects(catalog.save({ ...input, expertId: 'missing' }), /no longer available/i);
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, copy]);
});

test('older expert editors preserve catalog classification when copying or revising an expert', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  const classified = {
    ...WRITING_MENTOR,
    expertType: 'role' as const,
    category: '内容创作',
    listingType: 'expert' as const,
  };
  await store.install(await buildArchive(directory, [classified]));
  await store.setEnabled('test.library', true);
  const legacyValues = {
    name: '我的写作导师',
    description: '兼容旧编辑器',
    prompt: '保留分类并更新角色说明。',
    starterTasks: [],
  };
  const copy = await catalog.save({
    extensionId: 'test.library',
    expertId: classified.id,
    expectedRevision: 1,
    values: legacyValues,
  });
  assert.deepEqual(
    {
      expertType: copy.expertType,
      category: copy.category,
      listingType: copy.listingType,
    },
    { expertType: 'role', category: '内容创作', listingType: 'expert' },
  );
  const revised = await catalog.save({
    extensionId: 'test.library',
    expertId: copy.id,
    expectedRevision: 1,
    values: { ...legacyValues, prompt: '第二版角色说明。' },
  });
  assert.equal(revised.revision, 2);
  assert.equal(revised.expertType, 'role');
  assert.equal(revised.category, '内容创作');
  assert.equal(revised.listingType, 'expert');
  const cleared = await catalog.save({
    extensionId: 'test.library',
    expertId: copy.id,
    expectedRevision: 2,
    values: {
      ...legacyValues,
      expertType: 'platform',
      category: null,
      prompt: '平台专家不设置业务大类。',
    },
  });
  assert.equal(cleared.revision, 3);
  assert.equal(cleared.expertType, 'platform');
  assert.equal(cleared.category, undefined);
  assert.equal(cleared.listingType, 'expert');
});

test('copying or editing a built-in platform expert preserves its package capability guide', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  const platformExpert = {
    ...WRITING_MENTOR,
    id: 'feishu-office-suite',
    expertType: 'platform' as const,
    skillRef: 'lark-base',
    capabilityGuide: {
      groups: [
        {
          id: 'base',
          label: '多维表格',
          actions: [
            {
              id: 'create-base',
              label: '新建多维表格',
              requiredConnectorIds: ['feishu-docs'],
              promptTemplate: '请新建一个飞书多维表格。',
            },
          ],
        },
      ],
    },
  };
  await store.install(
    await buildArchive(directory, [platformExpert], '0.8.0', 'test.library', [
      {
        id: 'feishu-docs',
        adapter: 'feishu-cli',
        name: '飞书',
        description: '飞书官方 CLI 连接器。',
      },
    ]),
  );
  await store.setEnabled('test.library', true);
  const copy = await catalog.save({
    extensionId: 'test.library',
    expertId: platformExpert.id,
    expectedRevision: 1,
    values: {
      name: '我的飞书办公套件专家',
      description: '保留包提供的受控能力入口。',
      prompt: '使用当前会话授权的飞书能力完成任务。',
      starterTasks: [],
      skillRef: 'lark-base',
    },
  });
  assert.deepEqual(copy.capabilityGuide, platformExpert.capabilityGuide);
  const revised = await catalog.save({
    extensionId: 'test.library',
    expertId: copy.id,
    expectedRevision: 1,
    values: {
      name: copy.name,
      description: copy.description,
      prompt: '第二版平台专家提示词。',
      starterTasks: [],
      skillRef: 'lark-base',
    },
  });
  assert.deepEqual(revised.capabilityGuide, platformExpert.capabilityGuide);
  const converted = await catalog.save({
    extensionId: 'test.library',
    expertId: copy.id,
    expectedRevision: 2,
    values: {
      name: copy.name,
      description: copy.description,
      prompt: '改为普通岗位专家。',
      starterTasks: [],
      expertType: 'role',
    },
  });
  assert.deepEqual(converted.capabilityGuide, platformExpert.capabilityGuide);
});

test('editing a user expert increments its revision without mutating an old session snapshot', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = {
    name: '团队助手',
    description: '',
    prompt: '第一版角色',
    starterTasks: [],
    skillRef: 'existing-skill',
  };
  const created = await catalog.save({ extensionId: 'test.library', values });
  const ref = { extensionId: 'test.library', expertId: created.id, revision: 1 };
  const oldSnapshot = await catalog.resolve(ref);
  const originalSnapshot = structuredClone(oldSnapshot);
  const updatedValues = {
    name: values.name,
    description: '',
    prompt: '第二版角色',
    starterTasks: [],
  };
  const update = {
    extensionId: 'test.library',
    expertId: created.id,
    expectedRevision: 1,
    values: updatedValues,
  };
  const revised = await catalog.save(update);
  assert.deepEqual(revised, { ...updatedValues, id: created.id, revision: 2 });
  await catalog.requireAvailable(oldSnapshot);
  assert.deepEqual(oldSnapshot, originalSnapshot);
  await assert.rejects(catalog.save(update), /revision/i);
  await assert.rejects(catalog.resolve(ref), /revision/i);
  assert.deepEqual((await catalog.resolve({ ...ref, revision: 2 })).expert, revised);
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, revised]);
});

test('deleting a user expert preserves its definition but removes availability and rejects stale deletes', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = {
    name: '保留历史',
    description: '',
    prompt: '保留这份用户定义',
    starterTasks: [],
  };
  const created = await catalog.save({ extensionId: 'test.library', values });
  const ref = { extensionId: 'test.library', expertId: created.id, revision: 1 };
  const snapshot = await catalog.resolve(ref);
  const beforeDelete = structuredClone(snapshot);
  await assert.rejects(catalog.delete({ ...ref, revision: 2 }), /revision/i);
  await assert.rejects(catalog.delete({ ...ref, expertId: WRITING_MENTOR.id }), /built-in/i);
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, created]);
  await catalog.delete(ref);
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR]);
  await assert.rejects(catalog.resolve(ref), /no longer available/i);
  await assert.rejects(catalog.requireAvailable(snapshot), /no longer available/i);
  await assert.rejects(catalog.delete(ref), /no longer available/i);
  await assert.rejects(
    catalog.save({
      extensionId: ref.extensionId,
      expertId: ref.expertId,
      expectedRevision: 1,
      values,
    }),
    /no longer available/i,
  );
  assert.deepEqual(snapshot, beforeDelete);
  const stored = await fs.readFile(path.join(userDataRoot, 'test.library', 'experts.json'), 'utf8');
  assert.ok(stored.includes(values.prompt));
  assert.deepEqual(await new SpaceExpertCatalog(store, userDataRoot).list('test.library'), [
    WRITING_MENTOR,
  ]);
});

test('concurrent catalog instances preserve all creations and accept only one edit of a revision', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = { name: '并发专家', description: '', prompt: '先核实资料', starterTasks: [] };
  const created = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      new SpaceExpertCatalog(store, userDataRoot).save({
        extensionId: 'test.library',
        values: { ...values, name: `并发专家 ${index}` },
      }),
    ),
  );
  const listedIds = (await catalog.list('test.library')).map((expert) => expert.id).sort();
  assert.deepEqual(listedIds, [WRITING_MENTOR.id, ...created.map((expert) => expert.id)].sort());
  const expertId = created[0]!.id;
  const edited = await Promise.allSettled(
    ['第一位编辑', '第二位编辑'].map((prompt) =>
      new SpaceExpertCatalog(store, userDataRoot).save({
        extensionId: 'test.library',
        expertId,
        expectedRevision: 1,
        values: { ...values, prompt },
      }),
    ),
  );
  assert.equal(edited.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = edited.find((result) => result.status === 'rejected');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.match(String(rejected.reason), /revision/i);
  assert.equal(
    (await catalog.resolve({ extensionId: 'test.library', expertId, revision: 2 })).expert.revision,
    2,
  );
});

test('expert resolution preserves explicit Skill preference without loading or changing its configuration', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  const configured = { ...WRITING_MENTOR, skillRef: 'documents:review' };
  await store.install(await buildArchive(directory, [configured]));
  await store.setEnabled('test.library', true);
  for (const useSkill of [undefined, false, true]) {
    const snapshot = await catalog.resolve({
      extensionId: 'test.library',
      expertId: configured.id,
      revision: 1,
      ...(useSkill === undefined ? {} : { useSkill }),
    });
    assert.equal(snapshot.useSkill, useSkill);
    assert.deepEqual(snapshot.expert, configured);
    await catalog.requireAvailable(snapshot);
  }
  assert.deepEqual((await fs.readdir(directory)).sort(), ['experts.space-extension', 'extensions']);
});

test('user expert capacity includes deleted records and rejects overflow without losing saved data', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = { name: '专家', description: '', prompt: '检查事实', starterTasks: [] };
  const created = await Promise.all(
    Array.from({ length: 128 }, () => catalog.save({ extensionId: 'test.library', values })),
  );
  await catalog.delete({ extensionId: 'test.library', expertId: created[0]!.id, revision: 1 });
  const filePath = path.join(userDataRoot, 'test.library', 'experts.json');
  const beforeOverflow = await fs.readFile(filePath, 'utf8');
  await assert.rejects(
    catalog.save({ extensionId: 'test.library', values }),
    /record.*limit|capacity/i,
  );
  assert.equal(await fs.readFile(filePath, 'utf8'), beforeOverflow);
  assert.equal((await catalog.list('test.library')).length, 128);
});

test('UTF-8 user definitions cannot publish a file beyond the one MiB read limit', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = {
    name: '大文本专家',
    description: '',
    prompt: '知识'.repeat(3_900),
    starterTasks: [],
  };
  const savedIds: string[] = [];
  let rejection: unknown;
  let savedBytes: Buffer | undefined;
  const filePath = path.join(userDataRoot, 'test.library', 'experts.json');
  for (let index = 0; index < 80; index++) {
    try {
      const saved = await catalog.save({ extensionId: 'test.library', values });
      savedIds.push(saved.id);
      savedBytes = await fs.readFile(filePath);
    } catch (error) {
      rejection = error;
      break;
    }
  }
  assert.ok(rejection instanceof Error);
  assert.match(rejection.message, /user expert.*size limit/i);
  assert.ok(savedIds.length > 0);
  assert.deepEqual(await fs.readFile(filePath), savedBytes);
  assert.deepEqual(
    (await catalog.list('test.library')).map((expert) => expert.id),
    [WRITING_MENTOR.id, ...savedIds],
  );
});

test('disabled packages reject expert mutations and upgrades or reinstalls preserve user definitions', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  const values = {
    name: '本地专家',
    description: '',
    prompt: '独立保留用户的角色',
    starterTasks: [],
  };
  await assert.rejects(catalog.save({ extensionId: 'test.library', values }), /disabled/i);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['experts.space-extension', 'extensions']);
  await store.setEnabled('test.library', true);
  const saved = await catalog.save({ extensionId: 'test.library', values });
  const removed = await catalog.save({ extensionId: 'test.library', values });
  await catalog.delete({ extensionId: 'test.library', expertId: removed.id, revision: 1 });
  const ref = { extensionId: 'test.library', expertId: saved.id, revision: 1 };
  const snapshot = await catalog.resolve(ref);
  const filePath = path.join(userDataRoot, 'test.library', 'experts.json');
  const persisted = await fs.readFile(filePath);
  await store.setEnabled('test.library', false);
  await assert.rejects(catalog.save({ extensionId: 'test.library', values }), /disabled/i);
  await assert.rejects(catalog.delete(ref), /disabled/i);
  await assert.rejects(catalog.list('test.library'), /disabled/i);
  await assert.rejects(catalog.resolve(ref), /disabled/i);
  await assert.rejects(catalog.requireAvailable(snapshot), /disabled/i);
  assert.deepEqual(await fs.readFile(filePath), persisted);
  await store.install(await buildArchive(directory, [], '0.3.0'));
  await store.setEnabled('test.library', true);
  assert.deepEqual(await catalog.list('test.library'), [saved]);
  await catalog.requireAvailable(snapshot);
  await store.uninstall('test.library');
  assert.deepEqual(await fs.readFile(filePath), persisted);
  await assert.rejects(catalog.requireAvailable(snapshot), /not installed/i);
  await store.install(await buildArchive(directory, [], '0.4.0'));
  await store.setEnabled('test.library', true);
  assert.deepEqual(await new SpaceExpertCatalog(store, userDataRoot).list('test.library'), [saved]);
});

for (const redirected of ['root', 'extension', 'file'] as const) {
  test(`a symlinked user expert ${redirected} cannot read or mutate data outside the catalog`, async (t) => {
    const { directory, store, catalog, userDataRoot } = await fixture(t);
    await store.install(await buildArchive(directory));
    await store.setEnabled('test.library', true);
    const values = {
      name: '不跟随链接',
      description: '',
      prompt: '只用用户自己的数据',
      starterTasks: [],
    };
    const saved = await catalog.save({ extensionId: 'test.library', values });
    const ref = { extensionId: 'test.library', expertId: saved.id, revision: 1 };
    const snapshot = await catalog.resolve(ref);
    const expertDirectory = path.join(userDataRoot, 'test.library');
    const filePath = path.join(expertDirectory, 'experts.json');
    const original = await fs.readFile(filePath);
    const target =
      redirected === 'root'
        ? userDataRoot
        : redirected === 'extension'
          ? expertDirectory
          : filePath;
    const outside = path.join(directory, 'outside-data');
    await fs.rename(target, outside);
    await fs.symlink(outside, target, redirected === 'file' ? 'file' : 'dir');
    await assert.rejects(catalog.list('test.library'), /directory|symlink|regular/i);
    await assert.rejects(
      catalog.save({ extensionId: 'test.library', values }),
      /directory|symlink|regular/i,
    );
    await assert.rejects(catalog.delete(ref), /directory|symlink|regular/i);
    await assert.rejects(catalog.resolve(ref), /directory|symlink|regular/i);
    await assert.rejects(catalog.requireAvailable(snapshot), /directory|symlink|regular/i);
    const outsideFile =
      redirected === 'root'
        ? path.join(outside, 'test.library', 'experts.json')
        : redirected === 'extension'
          ? path.join(outside, 'experts.json')
          : outside;
    assert.deepEqual(await fs.readFile(outsideFile), original);
  });
}

test('path-like extension identities and malformed stored data fail without publishing new user content', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = { name: '边界', description: '', prompt: '核实资料', starterTasks: [] };
  await assert.rejects(catalog.save({ extensionId: '../outside', values }));
  await assert.rejects(
    catalog.save({ extensionId: 'missing.extension', values }),
    /not installed/i,
  );
  assert.deepEqual((await fs.readdir(directory)).sort(), ['experts.space-extension', 'extensions']);
  const saved = await catalog.save({ extensionId: 'test.library', values });
  const filePath = path.join(userDataRoot, 'test.library', 'experts.json');
  const valid = await fs.readFile(filePath);
  for (const invalid of ['{malformed', ' '.repeat(1024 * 1024 + 1)]) {
    await fs.writeFile(filePath, invalid);
    await assert.rejects(catalog.list('test.library'));
    await assert.rejects(catalog.save({ extensionId: 'test.library', values }));
    await assert.rejects(
      catalog.delete({ extensionId: 'test.library', expertId: saved.id, revision: 1 }),
    );
    assert.equal(await fs.readFile(filePath, 'utf8'), invalid);
  }
  await fs.writeFile(filePath, valid);
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, saved]);
});

test('duplicate saved expert identities cannot silently select or overwrite the wrong definition', async (t) => {
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = { name: '唯一身份', description: '', prompt: '检查身份一致性', starterTasks: [] };
  const saved = await catalog.save({ extensionId: 'test.library', values });
  const filePath = path.join(userDataRoot, 'test.library', 'experts.json');
  const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
  data.entries.push(structuredClone(data.entries[0]));
  const duplicated = JSON.stringify(data);
  await fs.writeFile(filePath, duplicated);
  await assert.rejects(catalog.list('test.library'), /duplicate|unique/i);
  await assert.rejects(
    catalog.save({
      extensionId: 'test.library',
      expertId: saved.id,
      expectedRevision: 1,
      values,
    }),
    /duplicate|unique/i,
  );
  assert.equal(await fs.readFile(filePath, 'utf8'), duplicated);
});

test('user experts remain isolated by extension identity', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.install(await buildArchive(directory, [], '0.3.0', 'other.library'));
  await store.setEnabled('test.library', true);
  await store.setEnabled('other.library', true);
  const values = {
    name: '自己的专家',
    description: '',
    prompt: '只在所属库中提供',
    starterTasks: [],
  };
  const saved = await catalog.save({ extensionId: 'test.library', values });
  assert.deepEqual(await catalog.list('other.library'), []);
  await assert.rejects(
    catalog.save({
      extensionId: 'other.library',
      expertId: saved.id,
      expectedRevision: 1,
      values,
    }),
    /no longer available/i,
  );
  await assert.rejects(
    catalog.delete({ extensionId: 'other.library', expertId: saved.id, revision: 1 }),
    /no longer available/i,
  );
  assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, saved]);
  assert.deepEqual(await catalog.list('other.library'), []);
});

test('a failed expert file replacement preserves the prior usable definition', async (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('Requires ordinary POSIX directory permissions');
    return;
  }
  const { directory, store, catalog, userDataRoot } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const values = { name: '原专家', description: '', prompt: '原来的角色', starterTasks: [] };
  const saved = await catalog.save({ extensionId: 'test.library', values });
  const expertDirectory = path.join(userDataRoot, 'test.library');
  const original = await fs.readFile(path.join(expertDirectory, 'experts.json'));
  await fs.chmod(expertDirectory, 0o500);
  try {
    await assert.rejects(
      catalog.save({
        extensionId: 'test.library',
        expertId: saved.id,
        expectedRevision: 1,
        values: { ...values, prompt: '不能提交的修改' },
      }),
      /EACCES|EPERM/,
    );
    assert.deepEqual(await fs.readFile(path.join(expertDirectory, 'experts.json')), original);
    assert.deepEqual(await catalog.list('test.library'), [WRITING_MENTOR, saved]);
  } finally {
    await fs.chmod(expertDirectory, 0o700);
  }
});

test(
  'catalog readers wait through a Windows atomic replacement gap without losing the expert',
  { timeout: 5_000 },
  async (t) => {
    const { directory, store, catalog, userDataRoot } = await fixture(t);
    await store.install(await buildArchive(directory));
    await store.setEnabled('test.library', true);
    const values = { name: '持续可用', description: '', prompt: '原来的角色', starterTasks: [] };
    const created = await catalog.save({ extensionId: 'test.library', values });
    const ref = { extensionId: 'test.library', expertId: created.id, revision: 1 };
    const snapshot = await catalog.resolve(ref);
    const target = path.join(userDataRoot, 'test.library', 'experts.json');
    const gate = pauseAtomicReplacement(target);
    const completed: string[] = [];
    let reading: Promise<PromiseSettledResult<unknown>[]> | undefined;
    const saving = catalog.save({
      extensionId: 'test.library',
      expertId: created.id,
      expectedRevision: 1,
      values: { ...values, prompt: '第二版角色' },
    });
    try {
      await Promise.race([
        gate.entered,
        saving.then(() => {
          throw new Error('Replacement gap was not entered');
        }),
      ]);
      await assert.rejects(fs.stat(target), { code: 'ENOENT' });
      reading = Promise.allSettled([
        catalog.list('test.library').finally(() => completed.push('list')),
        catalog.resolve(ref).finally(() => completed.push('resolve')),
        catalog.requireAvailable(snapshot).finally(() => completed.push('requireAvailable')),
      ]);
      await Promise.race([reading, new Promise<void>((resolve) => setTimeout(resolve, 60))]);
      assert.deepEqual(completed, [], 'all public readers must wait for the pending save');
      gate.release();
      const revised = await saving;
      assert.equal(revised.revision, 2);
      const [listed, resolved, available] = await reading;
      assert.ok(listed?.status === 'fulfilled');
      assert.deepEqual(listed.value, [WRITING_MENTOR, revised]);
      assert.ok(resolved?.status === 'rejected');
      assert.match(String(resolved.reason), /revision changed/i);
      assert.ok(available?.status === 'fulfilled');
      assert.equal(snapshot.expert.prompt, values.prompt);
    } finally {
      gate.restore();
      await Promise.allSettled([saving, ...(reading ? [reading] : [])]);
    }
  },
);

test('retired presets leave the new catalog while old snapshots and user copies remain usable', async (t) => {
  const { directory, store, catalog } = await fixture(t);
  await store.install(await buildArchive(directory));
  await store.setEnabled('test.library', true);
  const ref = { extensionId: 'test.library', expertId: WRITING_MENTOR.id, revision: 1 };
  const old = await catalog.resolve(ref);
  const copy = await catalog.save({
    extensionId: ref.extensionId,
    expertId: ref.expertId,
    expectedRevision: 1,
    values: {
      name: 'My expert',
      description: '',
      prompt: 'My preserved instructions.',
      starterTasks: [],
    },
  });
  await store.install(
    await buildArchive(directory, [{ ...WRITING_MENTOR, retired: true }], '0.3.0'),
  );
  await store.setEnabled('test.library', true);
  assert.deepEqual(
    (await catalog.list(ref.extensionId)).map((expert) => expert.id),
    [copy.id],
  );
  await catalog.requireAvailable(old);
  assert.equal(old.expert.prompt, WRITING_MENTOR.prompt);
  await assert.rejects(catalog.resolve(ref), /retired|no longer available/i);
  const selectedCopy = await catalog.resolve({ ...ref, expertId: copy.id });
  assert.equal(selectedCopy.expert.prompt, 'My preserved instructions.');
});
