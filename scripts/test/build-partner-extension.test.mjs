import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import JSZip from 'jszip';
import { buildPartnerExtension } from '../build-partner-extension.mjs';

const migratedScenes = [
  [
    'document-processing',
    '文档处理',
    '报告、文书、资料整理与综合',
    '请使用已添加的资料，为【目标受众】完成一份【总结、改写或新建】文档。保留关键事实，标明使用的资料与不确定性，并交付一份可编辑的最终文档和简明摘要。',
  ],
  [
    'deep-research',
    '深度研究',
    '行业、竞品、主题与证据研究',
    '请围绕【研究问题】，为【决策或目标受众】开展研究。结合已添加的资料与可靠来源，对比不同证据，区分事实与假设，引用重要结论，并交付研究发现、风险和建议的下一步。',
  ],
  [
    'data-analysis',
    '数据分析及可视化',
    '表格、指标、图表与分析结论',
    '请分析已添加的数据并回答【核心问题】。检查数据质量，说明假设，计算关键指标，识别有意义的趋势，并交付简洁结论以及必要的表格、图表或文件。',
  ],
  [
    'presentation',
    '幻灯片',
    'PPT、演示大纲、讲稿与叙事结构',
    '请为【目标受众】制作一份帮助其完成【决策或行动】的演示文稿。建立清晰叙事，设计页面结构和视觉表达，引用支撑资料，并交付可编辑的幻灯片与讲稿。',
  ],
  [
    'finance',
    '金融服务',
    '市场、公司、财务与投研分析',
    '请分析【公司、市场或财务问题】，支持【目标决策】。区分事实、假设、情景和风险，展示关键计算与证据，并交付可用于决策的分析备忘；必要时附表格或工作簿。',
  ],
  [
    'product-management',
    '产品管理',
    'PRD、需求、路线图与产品决策',
    '请为【目标用户】定义【产品问题或功能】。说明问题、目标、范围、取舍、指标、风险和验收标准，并交付可进入实施的产品方案或 PRD。',
  ],
  [
    'design',
    '设计',
    '设计方案、原型、评审与视觉方向',
    '请为【使用场景与目标受众】创建或评审设计。使用提供的参考资料，说明层级与交互决策，识别可用性和无障碍风险，并交付真实可实现的设计方案、原型或评审及交接说明。',
  ],
  [
    'email-editing',
    '邮件编辑',
    '邮件、公告、汇报与干系人沟通',
    '请为【目标受众】起草或修改一封关于【主题】的邮件。使用【语气】，明确行动要求与截止时间，保留关键事实，并提供简洁主题和可直接发送的正文。',
  ],
];

test('builds an independently installable, self-contained Partner library archive', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-extension-build-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  const result = await buildPartnerExtension({ outDir });
  assert.equal(path.extname(result.archivePath), '.space-extension');
  assert.equal(path.dirname(result.archivePath), outDir);
  const bytes = await fs.readFile(result.archivePath);
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  const zip = await JSZip.loadAsync(bytes);
  assert.deepEqual(Object.keys(zip.files).sort(), ['manifest.json', 'ui/index.html']);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const html = await zip.file('ui/index.html').async('string');
  assert.equal(manifest.id, 'kodax.partner-library');
  assert.equal(manifest.hostApiVersion, 4);
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(manifest.requiredHostCapabilities, [
    'partnerNativeDocumentDeliveryV1',
    'partnerExpertWorkflowsV1',
  ]);
  assert.equal(manifest.experts.length, 21);
  assert.equal(manifest.experts[0].id, 'writing-mentor');
  assert.equal(manifest.experts[0].revision, 3);
  assert.ok(manifest.experts[0].prompt.length > 0);
  assert.equal(manifest.experts[0].skillRef, 'copywriting');
  assert.deepEqual(manifest.connectors.slice(0, 1), [
    {
      id: 'feishu-docs',
      adapter: 'feishu-cli',
      name: '飞书',
      description:
        '连接飞书文档与多维表格；读取指定资料，直接新建文档，受审追加既有文档，并可在个人空间或授权文件夹中新建 Base。',
    },
  ]);
  assert.deepEqual(
    manifest.connectors.map(({ id, adapter, name }) => [id, adapter, name]),
    [
      ['feishu-docs', 'feishu-cli', '飞书'],
      ['tencent-docs', 'tencent-docs-mcp', '腾讯文档'],
      ['netease-mail', 'netease-mail-imap', '网易邮箱'],
      ['qq-mail', 'qq-mail-imap', 'QQ邮箱'],
      ['wecom', 'wecom-cli', '企业微信'],
      ['dingtalk', 'dingtalk-cli', '钉钉'],
      ['tencent-meeting', 'tencent-meeting-cli', '腾讯会议'],
      ['notion', 'notion-mcp', 'Notion'],
      ['airtable', 'airtable-mcp', 'Airtable'],
      ['atlassian', 'atlassian-mcp', 'Atlassian'],
      ['slack', 'slack-mcp', 'Slack'],
      ['zoom', 'zoom-mcp', 'Zoom'],
      ['github', 'github-api', 'GitHub'],
    ],
  );
  const netease = manifest.connectors.find((connector) => connector.id === 'netease-mail');
  const qq = manifest.connectors.find((connector) => connector.id === 'qq-mail');
  assert.match(netease.description, /163\.com/);
  assert.match(qq.description, /qq\.com/);
  assert.doesNotMatch(netease.description + qq.description, /126|yeah|foxmail/i);
  assert.equal(manifest.ui.sha256, createHash('sha256').update(html).digest('hex'));
  assert.match(html, /专家/);
  assert.equal([...html.matchAll(/data:image\/jpeg;base64,/g)].length, 16);
  assert.doesNotMatch(html, /__EXPERT_PRESENTATION__/);
  assert.match(html, /专家设置与提示词/);
  assert.match(html, /连接器/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /岗位专家/);
  assert.match(html, /任务专家/);
  assert.doesNotMatch(html, /data-expert-type="platform"|<option value="platform"/);
  assert.deepEqual(
    manifest.experts
      .filter((expert) => !expert.retired)
      .map((expert) => expert.id)
      .sort(),
    [
      'call-preparation',
      'customer-support',
      'data-analysis',
      'deep-research',
      'email-editing',
      'interview-design',
      'knowledge-synthesis',
      'meeting-minutes',
      'new-hire-onboarding',
      'presentation-html',
      'process-documentation',
      'product-management',
      'project-management',
      'status-report',
      'user-research',
      'writing-mentor',
    ],
  );
  assert.match(html, /专家团/);
  const embeddedLogos = [...html.matchAll(/data:image\/png;base64,([A-Za-z0-9+/=]+)/g)];
  assert.equal(embeddedLogos.length, 6, 'Each PNG provider has its own offline brand');
  for (const [index, brand] of [
    'feishu',
    'wecom',
    'dingtalk',
    'tencent-meeting',
    'netease-mail',
    'qq-mail',
  ].entries()) {
    assert.deepEqual(
      Buffer.from(embeddedLogos[index][1], 'base64'),
      await fs.readFile(new URL(`../../resources/brands/${brand}.png`, import.meta.url)),
    );
  }
  const embeddedSvgLogos = [...html.matchAll(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g)];
  assert.equal(
    embeddedSvgLogos.length,
    6,
    'Redistributable remote-provider brands are embedded for offline use',
  );
  for (const [index, brand] of [
    'notion',
    'airtable',
    'atlassian',
    'github',
    'zoom',
    'tencent-docs',
  ].entries()) {
    assert.deepEqual(
      Buffer.from(embeddedSvgLogos[index][1], 'base64'),
      await fs.readFile(new URL(`../../resources/brands/${brand}.svg`, import.meta.url)),
    );
  }
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["'](?:https?:|\/\/)|\bimport\s*\(/i);
  assert.doesNotMatch(html, /window\.kodaxSpace|require\(['"]electron/);
});

test('the library contains eight stable scene experts with original tasks and retains the writing mentor', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-scene-experts-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  const { manifest } = await buildPartnerExtension({ outDir });
  assert.equal(manifest.version, '0.1.0');
  assert.deepEqual(
    manifest.experts.slice(0, 10).map((expert) => expert.id),
    ['writing-mentor', ...migratedScenes.map(([id]) => id), 'feishu-office-suite'],
  );
  for (const [id, name, description, starterTask] of migratedScenes) {
    const expert = manifest.experts.find((candidate) => candidate.id === id);
    assert.equal(expert.name, name);
    assert.equal(expert.description, description);
    assert.equal(
      expert.revision,
      ['product-management', 'deep-research', 'data-analysis', 'email-editing'].includes(id)
        ? 3
        : 2,
    );
    assert.deepEqual(expert.starterTasks, [starterTask]);
    assert.match(expert.prompt, /你是/);
    assert.doesNotMatch(expert.prompt, /【|】/);
    assert.notEqual(expert.prompt, starterTask);
    assert.equal(
      expert.skillRef,
      id === 'product-management'
        ? 'partner-product-management'
        : id === 'deep-research'
          ? 'partner-deep-research'
          : id === 'data-analysis'
            ? 'partner-data-analysis'
            : id === 'email-editing'
              ? 'partner-business-communication'
              : undefined,
    );
  }
  assert.equal(manifest.experts[0].revision, 3);
  assert.equal(manifest.experts[0].skillRef, 'copywriting');
  assert.deepEqual(
    manifest.experts
      .slice(0, 10)
      .map(({ id, expertType, category, listingType }) => [id, expertType, category, listingType]),
    [
      ['writing-mentor', 'role', '内容创作', 'expert'],
      ['document-processing', 'task', '文档办公', 'expert'],
      ['deep-research', 'task', '研究分析', 'expert'],
      ['data-analysis', 'task', '数据分析', 'expert'],
      ['presentation', 'task', '内容创作', 'expert'],
      ['finance', 'role', '投资分析', 'expert'],
      ['product-management', 'role', '产品设计', 'expert'],
      ['design', 'role', '产品设计', 'expert'],
      ['email-editing', 'task', '内容创作', 'expert'],
      ['feishu-office-suite', 'platform', undefined, 'expert'],
    ],
  );
});

test('the first formal platform expert combines prompt, Skill, connector guide and real tasks', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-platform-expert-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  const { manifest } = await buildPartnerExtension({ outDir });
  const expert = manifest.experts.find((candidate) => candidate.id === 'feishu-office-suite');
  assert.ok(expert);
  assert.equal(expert.revision, 3);
  assert.equal(expert.expertType, 'platform');
  assert.equal(expert.category, undefined);
  assert.equal(expert.listingType, 'expert');
  assert.equal(expert.skillRef, 'feishu-office-suite');
  const builtinLock = JSON.parse(
    await fs.readFile(new URL('../../resources/builtin-skills.lock.json', import.meta.url), 'utf8'),
  );
  assert.ok(
    builtinLock.skills.some(({ name }) => name === expert.skillRef),
    'The formal expert Skill must be shipped in the builtin snapshot',
  );
  assert.match(expert.prompt, /连接器|授权/);
  assert.match(expert.prompt, /直接创建/);
  assert.match(expert.prompt, /追加.*待审核/);
  assert.deepEqual(
    expert.capabilityGuide.groups.map((group) => [
      group.id,
      group.label,
      group.actions.map((action) => action.id),
    ]),
    [
      ['documents', '飞书文档', ['create-document', 'summarize-document', 'append-document']],
      ['base', '多维表格', ['create-base']],
    ],
  );
  for (const group of expert.capabilityGuide.groups) {
    for (const action of group.actions) {
      assert.deepEqual(action.requiredConnectorIds, ['feishu-docs']);
      assert.ok(action.promptTemplate.length > 0);
    }
  }
  const skill = await fs.readFile(
    new URL('../../resources/first-party-skills/feishu-office-suite/SKILL.md', import.meta.url),
    'utf8',
  );
  assert.match(skill, /partner_feishu_document_create/);
  assert.match(skill, /partner_connector_propose/);
  assert.match(skill, /append/u);
});
