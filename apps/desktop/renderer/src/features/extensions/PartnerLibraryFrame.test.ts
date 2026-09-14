import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';
import { buildRestrictedExtensionDocument } from './extensionViewPolicy.js';
import { parseExtensionFrameRequest, type ExtensionFrameRequest } from './extensionFrameBridge.js';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find((path) => existsSync(path));
const preset: SpaceExpertDefinitionT = {
  id: 'writing-mentor',
  revision: 1,
  name: '写作导师',
  description: '帮助写作',
  prompt: 'Help with writing.',
  starterTasks: ['请检查这份提纲'],
};

function luminance(color: string): number {
  const channels = color
    .match(/[\d.]+/g)!
    .slice(0, 3)
    .map(Number)
    .map((value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

async function waitForConfigureRequests(
  requests: ExtensionFrameRequest[],
  count: number,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (requests.filter((request) => request.method === 'connector.configure').length >= count)
      return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`Timed out waiting for ${count} connector.configure requests`);
}

async function openLibrary(
  t: TestContext,
  initialExperts: SpaceExpertDefinitionT[] = [preset],
  initialTab: 'experts' | 'connectors' = 'experts',
  options: { twoConnectors?: boolean; allProviders?: boolean; holdConfiguration?: boolean } = {},
) {
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(2000);
  const requests: ExtensionFrameRequest[] = [];
  let experts = initialExperts;
  let connected = false;
  let finishConfiguration: (() => void) | undefined;
  await page.exposeFunction('partnerTestHost', (data: unknown) => {
    const request = parseExtensionFrameRequest(data);
    if (!request) throw new Error('Unbounded package request');
    requests.push(request);
    if (request.method === 'catalog.list') return { experts };
    if (request.method === 'connector.catalog')
      return {
        connectedIds: connected ? ['feishu-docs'] : [],
        connectors: options.allProviders
          ? [
              {
                id: 'feishu-docs',
                adapter: 'feishu-cli',
                name: '飞书',
                description: 'Read documents',
              },
              {
                id: 'tencent-docs',
                adapter: 'tencent-docs-mcp',
                name: '腾讯文档',
                description: 'Read authorized resources',
              },
              {
                id: 'netease-mail',
                adapter: 'netease-mail-imap',
                name: '网易邮箱',
                description: 'Read authorized resources',
              },
              {
                id: 'qq-mail',
                adapter: 'qq-mail-imap',
                name: 'QQ邮箱',
                description: 'Read authorized resources',
              },
              {
                id: 'wecom',
                adapter: 'wecom-cli',
                name: '企业微信',
                description: 'Read bot documents',
              },
              {
                id: 'dingtalk',
                adapter: 'dingtalk-cli',
                name: '钉钉',
                description: 'Read permitted documents',
              },
              {
                id: 'tencent-meeting',
                adapter: 'tencent-meeting-cli',
                name: '腾讯会议',
                description: 'Read a selected meeting',
              },
              {
                id: 'notion',
                adapter: 'notion-mcp',
                name: 'Notion',
                description: 'Read selected pages',
              },
              {
                id: 'airtable',
                adapter: 'airtable-mcp',
                name: 'Airtable',
                description: 'Read selected tables',
              },
              {
                id: 'atlassian',
                adapter: 'atlassian-mcp',
                name: 'Atlassian',
                description: 'Read selected Jira or Confluence resources',
              },
              {
                id: 'slack',
                adapter: 'slack-mcp',
                name: 'Slack',
                description: 'Requires a product app',
              },
              {
                id: 'github',
                adapter: 'github-api',
                name: 'GitHub',
                description: 'Read selected repository, Issue or PR.',
              },
              {
                id: 'zoom',
                adapter: 'zoom-mcp',
                name: 'Zoom',
                description: 'Requires a product app',
              },
            ]
          : Array.from({ length: options.twoConnectors ? 2 : 1 }, (_, index) => ({
              id: index === 0 ? 'feishu-docs' : 'feishu-secondary',
              adapter: 'feishu-cli',
              name: index === 0 ? '飞书' : '飞书备用',
              description: '连接飞书文档，读取指定资料；新建和追加内容审核后提交。',
            })),
      };
    if (request.method === 'connector.configure' && options.holdConfiguration)
      return new Promise((resolve) => {
        finishConfiguration = () => resolve({ configured: true });
      });
    if (request.method === 'expert.save') {
      const { category, workflow, ...draftValues } = request.values;
      const saved: SpaceExpertDefinitionT = {
        ...draftValues,
        ...(workflow ? { workflow } : {}),
        ...(category === null || category === undefined ? {} : { category }),
        id: request.expertId?.startsWith('user.') ? request.expertId : 'user.created',
        revision: request.expertId?.startsWith('user.') ? request.expectedRevision! + 1 : 1,
      };
      experts = [...experts.filter((entry) => entry.id !== saved.id), saved];
      return { expert: saved };
    }
    if (request.method === 'expert.delete') {
      experts = experts.filter((entry) => entry.id !== request.expertId);
      return { ok: true };
    }
    return { selected: true };
  });
  await page.setContent(
    '<iframe title="Partner library" sandbox="allow-scripts" style="width:1100px;height:1200px"></iframe>',
  );
  const html = await readFile(
    new URL('../../../../../../extensions/partner-library/ui/index.html', import.meta.url),
    'utf8',
  );
  await page.evaluate(
    ({ documentHtml, initialTab }) => {
      const frame = document.querySelector('iframe')!;
      window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow) return;
        if (event.data?.type === 'space-extension.ready.v1') {
          frame.contentWindow!.postMessage(
            { type: 'space-extension.init.v1', token: 'test-frame', initialTab },
            '*',
          );
        } else if (event.data?.type === 'space-extension.request.v1') {
          const request = event.data as { requestId: string; token: string };
          const host = (window as unknown as { partnerTestHost(data: unknown): Promise<unknown> })
            .partnerTestHost;
          void host(event.data).then((data) =>
            frame.contentWindow!.postMessage(
              {
                type: 'space-extension.response.v1',
                requestId: request.requestId,
                token: request.token,
                ok: true,
                data,
              },
              '*',
            ),
          );
        }
      });
      frame.srcdoc = documentHtml;
    },
    { documentHtml: buildRestrictedExtensionDocument(html), initialTab },
  );
  const frame = page.frameLocator('iframe');
  await frame
    .getByRole('heading', {
      name: initialTab === 'connectors' ? '飞书' : '写作导师',
      exact: true,
    })
    .waitFor();
  return {
    frame,
    requests,
    setTheme: (colorScheme: 'light' | 'dark') => page.emulateMedia({ colorScheme }),
    finishConfiguration: () => finishConfiguration?.(),
    resize: async (width: number) => {
      await page.locator('iframe').evaluate((element, width) => {
        element.style.width = `${width}px`;
      }, width);
    },
    changeConnected: async () => {
      connected = true;
      await page.evaluate(() =>
        document
          .querySelector('iframe')!
          .contentWindow!.postMessage(
            { type: 'space-extension.connectors.changed.v1', token: 'test-frame' },
            '*',
          ),
      );
    },
  };
}

test(
  'each implemented provider has its own offline brand and exact trusted configure action',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests } = await openLibrary(t, [preset], 'connectors', {
      allProviders: true,
    });
    for (const [name, id, width] of [
      ['飞书', 'feishu-docs', 700],
      ['企业微信', 'wecom', 48],
      ['钉钉', 'dingtalk', 200],
      ['腾讯会议', 'tencent-meeting', 128],
      ['腾讯文档', 'tencent-docs', 48],
      ['网易邮箱', 'netease-mail', 48],
      ['QQ邮箱', 'qq-mail', 96],
    ] as const) {
      const card = frame
        .getByRole('article')
        .filter({ has: frame.getByRole('heading', { name, exact: true }) });
      const logo = card.locator('img');
      await logo.evaluate((image: HTMLImageElement) => image.decode());
      assert.equal(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth), width);
      await card.getByRole('button', { name: `连接 ${name}`, exact: true }).click();
      await frame.getByText('请在连接弹窗中继续。', { exact: true }).waitFor();
      assert.equal(
        requests.filter((request) => request.method === 'connector.configure').at(-1)?.connectorId,
        id,
      );
    }
  },
);

test(
  'remote and credential connectors open trusted configuration without remote asset requests',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests } = await openLibrary(t, [preset], 'connectors', {
      allProviders: true,
    });
    for (const [index, name] of ['Notion', 'Airtable', 'Atlassian'].entries()) {
      const card = frame
        .getByRole('article')
        .filter({ has: frame.getByRole('heading', { name, exact: true }) });
      const logo = card.locator('img');
      await logo.evaluate((image: HTMLImageElement) => image.decode());
      assert.match((await logo.getAttribute('src')) ?? '', /^data:image\/svg\+xml;base64,/u);
      await card.getByRole('button', { name: `连接 ${name}`, exact: true }).click();
      await waitForConfigureRequests(requests, index + 1);
    }
    assert.deepEqual(
      requests
        .filter((request) => request.method === 'connector.configure')
        .map((request) => request.connectorId),
      ['notion', 'airtable', 'atlassian'],
    );
    for (const [index, name] of ['Slack', 'Zoom', 'GitHub'].entries()) {
      const card = frame
        .getByRole('article')
        .filter({ has: frame.getByRole('heading', { name, exact: true }) });
      await card.getByRole('button', { name: `连接 ${name}`, exact: true }).click();
      await waitForConfigureRequests(requests, index + 4);
    }
    const slackCard = frame
      .getByRole('article')
      .filter({ has: frame.getByRole('heading', { name: 'Slack', exact: true }) });
    assert.equal(await slackCard.locator('img').count(), 0);
    assert.equal(await slackCard.locator('svg[data-connector-fallback="true"]').count(), 1);
  },
);

test(
  'redistributable monochrome remote logos stay visible in the standalone dark theme',
  { skip: !browserPath },
  async (t) => {
    const { frame, setTheme } = await openLibrary(t, [preset], 'connectors', {
      allProviders: true,
    });
    await setTheme('dark');
    for (const name of ['Notion', 'Airtable', 'Atlassian', 'Zoom', 'GitHub'] as const) {
      const card = frame
        .getByRole('article')
        .filter({ has: frame.getByRole('heading', { name, exact: true }) });
      assert.equal(
        await card.locator('img').evaluate((image) => getComputedStyle(image).filter),
        'invert(1)',
      );
    }
    const feishuCard = frame
      .getByRole('article')
      .filter({ has: frame.getByRole('heading', { name: '飞书', exact: true }) });
    assert.equal(
      await feishuCard.locator('img').evaluate((image) => getComputedStyle(image).filter),
      'none',
    );
  },
);

test(
  'standalone connector actions include the provider in their accessible names',
  { skip: !browserPath },
  async (t) => {
    const { frame, changeConnected } = await openLibrary(t, [preset], 'connectors', {
      allProviders: true,
    });
    await frame.getByRole('button', { name: '连接 Notion', exact: true }).waitFor();
    await frame.getByRole('button', { name: '连接 Slack', exact: true }).waitFor();
    await changeConnected();
    await frame.getByRole('button', { name: '管理连接 飞书', exact: true }).waitFor();
  },
);

test(
  'the independent connector card opens only trusted configuration and never receives secrets or document content',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests, changeConnected, setTheme } = await openLibrary(
      t,
      [preset],
      'connectors',
    );
    assert.equal(
      await frame.getByRole('tab', { name: '连接器' }).getAttribute('aria-selected'),
      'true',
    );
    await frame.getByRole('heading', { name: '飞书', exact: true }).waitFor();
    await frame.getByText('未连接', { exact: true }).waitFor();
    await frame.getByRole('button', { name: '连接 飞书', exact: true }).waitFor();
    await frame.getByRole('article').click();
    await frame.getByText('请在连接弹窗中继续。', { exact: true }).waitFor();
    await changeConnected();
    await frame.getByText('已连接', { exact: true }).waitFor();
    await frame.getByRole('button', { name: '管理连接 飞书', exact: true }).waitFor();
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(theme);
      const colors = await frame.getByText('已连接', { exact: true }).evaluate((element) => ({
        foreground: getComputedStyle(element).color,
        background: getComputedStyle(element.closest('article')!).backgroundColor,
      }));
      const foreground = luminance(colors.foreground);
      const background = luminance(colors.background);
      const contrast =
        (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      assert.ok(contrast >= 4.5, `${theme} connected status contrast: ${contrast}`);
    }
    assert.deepEqual(
      requests
        .filter((item) => item.method === 'connector.configure')
        .map((item) => Object.keys(item).sort()),
      [['connectorId', 'method', 'requestId', 'token', 'type']],
    );
    assert.equal(await frame.locator('#connectors-panel input').count(), 0);
    assert.equal(
      requests.some((item) => item.method === 'expert.select'),
      false,
    );
  },
);

test(
  'connector cards are horizontal, responsive, offline-branded, and open only configuration with an accessible action',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests, resize, finishConfiguration } = await openLibrary(
      t,
      [preset],
      'connectors',
      {
        twoConnectors: true,
        holdConfiguration: true,
      },
    );
    const card = frame
      .getByRole('article')
      .filter({ has: frame.getByRole('heading', { name: '飞书', exact: true }) });
    const nextCard = frame
      .getByRole('article')
      .filter({ has: frame.getByRole('heading', { name: '飞书备用', exact: true }) });
    const wide = await card.boundingBox();
    const nextWide = await nextCard.boundingBox();
    assert.ok(wide && nextWide);
    assert.ok(wide.width >= 400 && wide.width <= 460, `Desktop card width: ${wide.width}`);
    assert.ok(wide.height >= 112 && wide.height <= 136, `Desktop card height: ${wide.height}`);
    assert.equal(wide.y, nextWide.y, 'Cards share a row when two columns fit');
    assert.ok(nextWide.x >= wide.x + wide.width);
    const logo = card.locator('img');
    await logo.evaluate((image: HTMLImageElement) => image.decode());
    assert.equal(await logo.evaluate((image: HTMLImageElement) => image.naturalWidth), 700);
    assert.match((await logo.getAttribute('src')) ?? '', /^data:image\/png;base64,/);
    const logoBox = await logo.boundingBox();
    const headingBox = await card.getByRole('heading').boundingBox();
    const action = card.getByRole('button', { name: '连接 飞书', exact: true });
    const actionBox = await action.boundingBox();
    assert.ok(logoBox && headingBox && actionBox);
    assert.equal(logoBox.width, 32);
    assert.ok(logoBox.x < headingBox.x && headingBox.x < actionBox.x);
    assert.ok(Math.abs(logoBox.y + logoBox.height / 2 - (actionBox.y + actionBox.height / 2)) <= 1);
    assert.equal(await action.locator('svg').count(), 1);
    assert.equal(requests.filter((request) => request.method === 'connector.configure').length, 0);
    await resize(390);
    const narrow = await card.boundingBox();
    const nextNarrow = await nextCard.boundingBox();
    assert.ok(narrow && nextNarrow);
    assert.ok(narrow.width <= 354);
    assert.equal(narrow.x, nextNarrow.x);
    assert.ok(nextNarrow.y >= narrow.y + narrow.height);
    await action.focus();
    assert.equal(await action.evaluate((element) => element.matches(':focus-visible')), true);
    await action.press('Enter');
    assert.equal(await action.isDisabled(), true);
    assert.equal(requests.filter((request) => request.method === 'connector.configure').length, 1);
    finishConfiguration();
    await frame.getByText('请在连接弹窗中继续。', { exact: true }).waitFor();
    assert.equal(await action.isDisabled(), false);
    assert.equal(
      requests.some(
        (request) =>
          !['catalog.list', 'connector.catalog', 'connector.configure'].includes(request.method),
      ),
      false,
    );
  },
);

test(
  'experts use two discovery views while legacy platform copies remain discoverable',
  { skip: !browserPath },
  async (t) => {
    type ClassifiedExpert = SpaceExpertDefinitionT & {
      expertType: 'role' | 'task' | 'platform';
      category?: string;
      listingType?: 'expert' | 'team';
    };
    const classifiedExperts: ClassifiedExpert[] = [
      { ...preset, expertType: 'role', category: '内容创作' },
      {
        ...preset,
        id: 'finance',
        name: '投资分析师',
        expertType: 'role',
        category: '投资分析',
      },
      {
        ...preset,
        id: 'content-team',
        name: '内容创作团队',
        expertType: 'role',
        category: '内容创作',
        listingType: 'team',
      },
      {
        ...preset,
        id: 'document-processing',
        name: '文档处理',
        expertType: 'task',
        category: '文档办公',
      },
      {
        ...preset,
        id: 'feishu-office',
        name: '飞书协同办公',
        expertType: 'platform',
      },
    ];
    const { frame, requests, setTheme } = await openLibrary(t, classifiedExperts);

    assert.equal(
      await frame.getByRole('button', { name: /岗位专家/ }).getAttribute('aria-pressed'),
      'true',
    );
    await frame.getByRole('heading', { name: '写作导师', exact: true }).waitFor();
    await frame.getByRole('heading', { name: '投资分析师', exact: true }).waitFor();
    assert.equal(await frame.getByRole('heading', { name: '文档处理', exact: true }).count(), 0);
    for (const category of ['全部', '内容创作', '投资分析', '专家团'])
      await frame.getByRole('button', { name: category, exact: true }).waitFor();
    const hierarchyStyles = await frame.locator('body').evaluate(() => {
      const panel = getComputedStyle(document.querySelector('.expert-panel')!);
      const tabs = getComputedStyle(document.querySelector('.tabs')!);
      const selectedTab = getComputedStyle(document.querySelector('.tab[aria-selected="true"]')!);
      const type = getComputedStyle(document.querySelector('.expert-type-tab')!);
      const category = getComputedStyle(document.querySelector('.expert-category-tab')!);
      const card = getComputedStyle(document.querySelector('.expert-card')!);
      return {
        panelBorder: panel.borderTopWidth,
        tabRule: tabs.borderBottomWidth,
        selectedTabRule: selectedTab.borderBottomWidth,
        typeBorder: type.borderTopWidth,
        categoryBorder: category.borderTopWidth,
        cardBorder: card.borderTopWidth,
        typeSize: Number.parseFloat(type.fontSize),
        categorySize: Number.parseFloat(category.fontSize),
      };
    });
    assert.deepEqual(
      {
        panelBorder: hierarchyStyles.panelBorder,
        tabRule: hierarchyStyles.tabRule,
        selectedTabRule: hierarchyStyles.selectedTabRule,
        typeBorder: hierarchyStyles.typeBorder,
        categoryBorder: hierarchyStyles.categoryBorder,
        cardBorder: hierarchyStyles.cardBorder,
      },
      {
        panelBorder: '0px',
        tabRule: '1px',
        selectedTabRule: '2px',
        typeBorder: '0px',
        categoryBorder: '0px',
        cardBorder: '1px',
      },
    );
    assert.ok(hierarchyStyles.typeSize > hierarchyStyles.categorySize);
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(theme);
      for (const selector of [
        '.expert-type-tab[aria-pressed="true"]',
        '.expert-category-tab[aria-pressed="true"]',
      ]) {
        const colors = await frame.locator(selector).evaluate((element) => ({
          foreground: getComputedStyle(element).color,
          background: getComputedStyle(element).backgroundColor,
        }));
        const foreground = luminance(colors.foreground);
        const background = luminance(colors.background);
        const contrast =
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        assert.ok(contrast >= 4.5, `${theme} selected filter contrast: ${contrast}`);
      }
    }

    const teamFilter = frame.getByRole('button', { name: '专家团', exact: true });
    await teamFilter.focus();
    await teamFilter.press('Enter');
    await frame.getByRole('heading', { name: '内容创作团队', exact: true }).waitFor();
    assert.equal(
      await teamFilter.evaluate((element) => element.ownerDocument.activeElement === element),
      true,
    );
    assert.equal(await frame.getByRole('heading', { name: '写作导师', exact: true }).count(), 0);

    await frame.getByRole('button', { name: /任务专家/ }).click();
    await frame.getByRole('heading', { name: '文档处理', exact: true }).waitFor();
    await frame.getByRole('button', { name: '文档办公', exact: true }).waitFor();
    assert.equal(await frame.getByRole('button', { name: '内容创作', exact: true }).count(), 0);

    assert.equal(await frame.getByRole('button', { name: /平台专家/ }).count(), 0);
    await frame.getByRole('button', { name: /岗位专家/ }).click();
    await frame.getByRole('heading', { name: '飞书协同办公', exact: true }).waitFor();
    assert.equal(requests.filter((request) => request.method === 'catalog.list').length, 1);
    assert.equal(
      requests.some((request) => request.method.startsWith('expert.')),
      false,
    );
  },
);

test(
  'an expert type without entries keeps only all and team filters and shows a truthful empty state',
  { skip: !browserPath },
  async (t) => {
    const { frame } = await openLibrary(t);
    await frame.getByRole('button', { name: /任务专家/ }).click();
    await frame.getByText('当前还没有任务专家。', { exact: true }).waitFor();
    assert.deepEqual(await frame.locator('#expert-category-tabs button').allTextContents(), [
      '全部',
      '专家团',
    ]);
  },
);

test(
  'editing can explicitly clear a broad category and reserved filter names are rejected locally',
  { skip: !browserPath },
  async (t) => {
    const classified = {
      ...preset,
      expertType: 'role' as const,
      category: '内容创作',
      listingType: 'expert' as const,
    };
    const { frame, requests } = await openLibrary(t, [classified]);
    await frame.getByRole('button', { name: '查看 写作导师 详情', exact: true }).click();
    await frame.getByText('专家设置与提示词', { exact: true }).click();
    await frame.getByRole('button', { name: '修改副本', exact: true }).click();
    const editor = frame.getByRole('form', { name: '修改预置副本' });
    for (const reservedCategory of ['专家团', 'all', 'team']) {
      await editor.getByLabel('分类（可选）', { exact: true }).fill(reservedCategory);
      await editor.getByRole('button', { name: '保存为我的副本', exact: true }).click();
      await editor.getByText('这个名称是保留筛选名称，请换一个分类。', { exact: true }).waitFor();
      assert.equal(requests.filter((request) => request.method === 'expert.save').length, 0);
    }

    await editor.getByLabel('专家类型', { exact: true }).selectOption('task');
    await editor.getByLabel('分类（可选）', { exact: true }).fill('');
    await editor.getByRole('button', { name: '保存为我的副本', exact: true }).click();
    await frame
      .getByText('已保存。需要重新选择专家，才会在会话中应用新版本。', { exact: true })
      .waitFor();
    const save = requests.find((request) => request.method === 'expert.save');
    assert.equal(save?.values.expertType, 'task');
    assert.equal(save?.values.category, null);
    await frame.getByRole('heading', { name: '写作导师', exact: true }).waitFor();
    assert.deepEqual(await frame.locator('#expert-category-tabs button').allTextContents(), [
      '全部',
      '专家团',
    ]);
  },
);

test(
  'the independent package creates an expert with explicit fields without selecting it or sending a prompt',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests } = await openLibrary(t);
    await frame.getByRole('button', { name: '新建专家', exact: true }).click();
    const editor = frame.getByRole('form', { name: '新建专家' });
    await editor.getByLabel('专家名称', { exact: true }).fill('我的编辑');
    await editor.getByLabel('说明', { exact: true }).fill('校对文档');
    await editor.getByLabel('专家类型', { exact: true }).selectOption('task');
    await editor.getByLabel('分类（可选）', { exact: true }).fill('文档办公');
    await editor.getByLabel('专家提示词', { exact: true }).fill('请帮我校对文档。');
    await editor.getByLabel('示例任务 1', { exact: true }).fill('检查这份提纲');
    await editor.getByLabel('Skill 名称（可选）', { exact: true }).fill('document-processing');
    await editor.getByLabel('需要的资料（可选，每行一项）', { exact: true }).fill('原稿');
    await editor.getByLabel('交付物（每行一项）', { exact: true }).fill('修订稿');
    await editor.getByLabel('交付检查（每行一项）', { exact: true }).fill('保留关键事实');
    await editor.locator('#editor-need-read').selectOption('optional');
    await editor.getByLabel('读取资料的用途', { exact: true }).fill('读取原文');
    await frame.getByRole('button', { name: '保存专家', exact: true }).click();
    await frame
      .getByText('已保存。需要重新选择专家，才会在会话中应用新版本。', { exact: true })
      .waitFor();
    assert.equal(
      await frame.getByRole('button', { name: /任务专家/ }).getAttribute('aria-pressed'),
      'true',
    );
    await frame.getByRole('heading', { name: '我的编辑', exact: true }).waitFor();
    const saves = requests.filter((request) => request.method === 'expert.save');
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0]?.values, {
      name: '我的编辑',
      description: '校对文档',
      expertType: 'task',
      category: '文档办公',
      prompt: '请帮我校对文档。',
      starterTasks: ['检查这份提纲'],
      skillRef: 'document-processing',
      workflow: {
        inputs: ['原稿'],
        deliverables: ['修订稿'],
        qualityChecks: ['保留关键事实'],
        connectorNeeds: [{ operation: 'read', required: false, reason: '读取原文' }],
      },
    });
    assert.equal(saves[0]?.expertId, undefined);
    assert.equal(
      requests.some((request) => request.method === 'expert.select'),
      false,
    );
  },
);

test(
  'editing a preset saves a user copy, and editing that copy retains its revision identity',
  { skip: !browserPath },
  async (t) => {
    const { frame, requests } = await openLibrary(t);
    await frame.getByRole('button', { name: '查看 写作导师 详情', exact: true }).click();
    await frame.getByText('专家设置与提示词', { exact: true }).click();
    await frame.getByRole('button', { name: '修改副本', exact: true }).click();
    await frame
      .getByText('预置专家不会被修改；保存后会创建一个属于你的副本。', { exact: true })
      .waitFor();
    assert.equal(await frame.getByLabel('专家提示词', { exact: true }).inputValue(), preset.prompt);
    await frame.getByLabel('专家名称', { exact: true }).fill('写作导师副本');
    await frame.getByRole('button', { name: '保存为我的副本', exact: true }).click();
    const userCard = frame
      .getByRole('article')
      .filter({ has: frame.getByRole('heading', { name: '写作导师副本', exact: true }) });
    await userCard.getByRole('button').click();
    await frame.getByText('专家设置与提示词', { exact: true }).click();
    await frame.getByRole('dialog').getByRole('button', { name: '编辑', exact: true }).click();
    await frame.getByLabel('说明', { exact: true }).fill('<b>这只是文本</b>');
    await frame.getByRole('button', { name: '保存新版本', exact: true }).click();
    await userCard.getByText('<b>这只是文本</b>', { exact: true }).waitFor();
    const saves = requests.filter((request) => request.method === 'expert.save');
    assert.deepEqual(
      saves.map((save) => ({ id: save.expertId, revision: save.expectedRevision })),
      [
        { id: 'writing-mentor', revision: 1 },
        { id: 'user.created', revision: 1 },
      ],
    );
    assert.equal(
      requests.some((request) => request.method === 'expert.select'),
      false,
    );
    assert.equal(await frame.getByRole('heading', { name: '写作导师', exact: true }).count(), 1);
  },
);

test(
  'only configured experts offer prompt-only selection before a Skill can be resolved',
  { skip: !browserPath },
  async (t) => {
    const configured = {
      ...preset,
      id: 'user.skill',
      name: '文档专家',
      skillRef: 'document-processing',
    };
    const { frame, requests } = await openLibrary(t, [preset, configured]);
    await frame.getByRole('button', { name: '查看 文档专家 详情', exact: true }).click();
    await frame.getByRole('dialog').getByLabel('使用默认方法').uncheck();
    await frame.getByRole('dialog').getByRole('button', { name: '使用专家', exact: true }).click();
    await frame.getByText('专家已选择，请在 Partner 中继续对话。', { exact: true }).waitFor();
    const selection = requests.find((request) => request.method === 'expert.select');
    assert.deepEqual(
      selection && {
        id: selection.expertId,
        revision: selection.revision,
        useSkill: selection.useSkill,
      },
      { id: 'user.skill', revision: 1, useSkill: false },
    );
  },
);

test(
  'only user experts expose deletion and the package sends the exact revision to host confirmation',
  { skip: !browserPath },
  async (t) => {
    const custom = { ...preset, id: 'user.custom', name: '我的专家', revision: 3 };
    const { frame, requests } = await openLibrary(t, [preset, custom]);
    await frame.getByRole('button', { name: '查看 我的专家 详情', exact: true }).click();
    await frame.getByText('专家设置与提示词', { exact: true }).click();
    assert.equal(await frame.getByRole('button', { name: '删除', exact: true }).count(), 1);
    await frame.getByRole('button', { name: '删除', exact: true }).click();
    await frame.getByText('已删除专家。历史会话中的专家快照仍会保留。', { exact: true }).waitFor();
    assert.equal(await frame.getByRole('heading', { name: '我的专家', exact: true }).count(), 0);
    const deletion = requests.find((request) => request.method === 'expert.delete');
    assert.ok(deletion && deletion.method === 'expert.delete');
    assert.deepEqual(deletion && { id: deletion.expertId, revision: deletion.revision }, {
      id: 'user.custom',
      revision: 3,
    });
  },
);

test(
  'expert briefing closes with Escape and fits a narrow viewport',
  { skip: !browserPath },
  async (t) => {
    const { frame, resize } = await openLibrary(t);
    await resize(375);
    const open = frame.getByRole('button', { name: '查看 写作导师 详情' });
    await open.focus();
    await open.press('Enter');
    const dialog = frame.getByRole('dialog');
    assert.equal(await dialog.getByLabel('使用默认方法').count(), 0);
    const fits = await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth);
    assert.equal(fits, true);
    await dialog.getByRole('button', { name: '关闭专家详情' }).press('Escape');
    assert.equal(await dialog.count(), 0);
    assert.equal(await open.evaluate((element) => element === document.activeElement), true);
  },
);

test(
  'expert cards open an accessible briefing before explicit selection',
  { skip: !browserPath },
  async (t) => {
    const expert = {
      ...preset,
      skillRef: 'copywriting',
      workflow: {
        inputs: ['产品事实与目标读者'],
        deliverables: ['可编辑文案'],
        qualityChecks: ['不编造卖点'],
        connectorNeeds: [],
      },
    };
    const { frame, requests } = await openLibrary(t, [expert]);
    const card = frame.getByRole('article');
    assert.equal(await card.getByRole('button').count(), 1);
    await card.getByRole('button', { name: '查看 写作导师 详情' }).click();
    const dialog = frame.getByRole('dialog', { name: '写作导师' });
    await dialog.getByText('可编辑文案', { exact: true }).waitFor();
    await dialog.getByText('产品事实与目标读者', { exact: true }).waitFor();
    assert.equal(
      requests.some((request) => request.method === 'expert.select'),
      false,
    );
    await dialog.getByLabel('使用默认方法').uncheck();
    await dialog.getByRole('button', { name: '使用专家', exact: true }).click();
    await frame.getByText('专家已选择，请在 Partner 中继续对话。', { exact: true }).waitFor();
    const selection = requests.find((request) => request.method === 'expert.select');
    assert.ok(selection?.method === 'expert.select');
    assert.equal(selection.useSkill, false);
    assert.equal(selection.revision, expert.revision);
  },
);
