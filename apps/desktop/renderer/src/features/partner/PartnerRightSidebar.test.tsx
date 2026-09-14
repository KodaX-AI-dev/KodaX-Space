import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PartnerFeishuBaseCreateTaskT } from '@kodax-space/space-ipc-schema';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { PartnerRemoteRecordsProvider } from '../extensions/usePartnerRemoteRecords.js';

register(new URL('./PartnerComponentTestLoader.mjs', import.meta.url));
const { PartnerRightSidebar, handlePartnerDetailTabKeyDown } =
  await import('./PartnerRightSidebar.js');

const baseTask: PartnerFeishuBaseCreateTaskT = {
  id: '785fc824-c17a-48c2-a360-e515028869b5',
  sessionId: 'session-a',
  projectRoot: '/workspace/project-a',
  extensionId: 'kodax.partner-library',
  connectorId: 'feishu-docs',
  connectionId: 'b6c4724a-979d-4267-9968-8ce67653c880',
  connectionRevision: 1,
  folderUrl: 'https://test.feishu.cn/drive/folder/Folder1',
  baseName: '项目台账',
  tableName: '任务',
  fields: [
    { type: 'text', name: '事项' },
    { type: 'checkbox', name: '完成' },
  ],
  timeZone: 'Asia/Shanghai',
  inputHash: 'a'.repeat(64),
  scopeHash: 'b'.repeat(64),
  status: 'submitting',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:01.000Z',
};

function withProviders(children: JSX.Element): JSX.Element {
  return (
    <I18nProvider>
      <PartnerRemoteRecordsProvider>{children}</PartnerRemoteRecordsProvider>
    </I18nProvider>
  );
}

test('Partner detail tabs own uniquely labelled tab panels', () => {
  const html = renderToStaticMarkup(
    withProviders(
      <PartnerRightSidebar open openRequest={{ revision: 7, target: { kind: 'materials' } }} />,
    ),
  );
  const tabMarkup = html.match(/<button[^>]*role="tab"[^>]*>/)?.[0];

  assert.ok(tabMarkup);
  const tabId = tabMarkup.match(/\sid="([^"]+)"/)?.[1];
  const panelId = tabMarkup.match(/\saria-controls="([^"]+)"/)?.[1];
  assert.ok(tabId);
  assert.ok(panelId);
  assert.notEqual(tabId, panelId);
  assert.match(
    html,
    new RegExp(`<div[^>]*id="${panelId}"[^>]*role="tabpanel"[^>]*aria-labelledby="${tabId}"`),
  );
});

test('Partner detail tabs keep close controls out of the tab order and support Delete', () => {
  const html = renderToStaticMarkup(
    withProviders(
      <PartnerRightSidebar open openRequest={{ revision: 7, target: { kind: 'materials' } }} />,
    ),
  );
  const closeButtonMarkup = html.match(/<button[^>]*aria-label="Close [^"]+"[^>]*>/)?.[0];

  assert.ok(closeButtonMarkup);
  assert.match(closeButtonMarkup, /tabindex="-1"/);

  let prevented = false;
  let propagationStopped = false;
  let closeCount = 0;
  const handled = handlePartnerDetailTabKeyDown(
    {
      key: 'Delete',
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        propagationStopped = true;
      },
    },
    () => {
      closeCount += 1;
    },
  );

  assert.equal(handled, true);
  assert.equal(prevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(closeCount, 1);
});

test('Partner detail launcher contains office-friendly viewers and no terminal entry', () => {
  const html = renderToStaticMarkup(withProviders(<PartnerRightSidebar open />));

  assert.match(html, /data-testid="partner-detail-open-files"/);
  assert.match(html, /data-testid="partner-detail-open-browser"/);
  assert.doesNotMatch(html, /partner-detail-open-terminal/);
  assert.doesNotMatch(html, />Terminal</);
});

test('a Base task opens a structured local panel without fabricating a resource URL', () => {
  const html = renderToStaticMarkup(
    withProviders(
      <PartnerRightSidebar
        open
        openRequest={{ revision: 8, target: { kind: 'baseTask', task: baseTask } }}
      />,
    ),
  );

  assert.match(html, /data-testid="partner-feishu-base-task"/);
  assert.match(html, /项目台账/);
  assert.match(html, /任务/);
  assert.match(html, /事项/);
  assert.match(html, /完成/);
  assert.match(html, /Submitting to Feishu/);
  assert.doesNotMatch(html, /https:\/\/www\.feishu\.cn\/base\//);
});

test('a verified successful Base task renders its real resource in the same named tab', () => {
  const url = 'https://www.feishu.cn/base/baseProjectLedger';
  const succeeded: PartnerFeishuBaseCreateTaskT = {
    ...baseTask,
    status: 'succeeded',
    baseToken: 'baseProjectLedger',
    tableId: 'tblTasks',
    url,
    updatedAt: '2026-09-01T10:00:02.000Z',
  };
  const html = renderToStaticMarkup(
    withProviders(
      <PartnerRightSidebar
        open
        openRequest={{ revision: 9, target: { kind: 'baseTask', task: succeeded } }}
      />,
    ),
  );

  assert.match(html, /data-testid="partner-browser-panel"/);
  assert.match(html, /role="tab"[^>]*>[\s\S]*项目台账/);
  assert.match(html, new RegExp(`value="${url}"`));
  assert.match(html, new RegExp(`src="${url}"`));
  assert.doesNotMatch(html, /data-testid="partner-feishu-base-task"/);
});
