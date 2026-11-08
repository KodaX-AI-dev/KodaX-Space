import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { AgentsFileMeta } from '@kodax-space/space-ipc-schema';

const projectRule: AgentsFileMeta = {
  path: 'C:/project/.kodax/rules/style.md',
  content: 'KEEP_RULE_FRAGMENT',
  scope: 'project',
};
const projectAgents: AgentsFileMeta = {
  path: 'C:/project/AGENTS.md',
  content: 'KEEP_PROJECT_AGENTS',
  scope: 'project',
  editableScope: 'project',
};
const globalRule: AgentsFileMeta = {
  path: 'C:/profile/rules/personal.md',
  content: 'KEEP_GLOBAL_FRAGMENT',
  scope: 'global',
};
const globalAgents: AgentsFileMeta = {
  path: 'C:/profile/AGENTS.md',
  content: 'KEEP_GLOBAL_AGENTS',
  scope: 'global',
  editableScope: 'global',
};

const PANEL_FIXTURE = `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {AgentsMdPanel} from './AgentsMdPanel.tsx';
      import {useAppStore} from '../../store/appStore.ts';
      import {I18nProvider} from '../../i18n/I18nProvider.tsx';
      window.saves=[];
      window.kodaxSpace={invoke:async(channel,args)=>{
        if(channel==='settings.get')return {ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
        if(channel==='session.agentsMd')return {ok:true,data:{files:window.contextFiles}};
        if(channel==='session.agentsMd.save'){window.saves.push(args);return {ok:true,data:{ok:true,path:'/project/AGENTS.md'}};}
        throw Error(channel);
      }};
      useAppStore.setState({currentSessionId:'rules-session',currentProjectPath:'C:/project'});
      createRoot(document.getElementById('root')).render(<I18nProvider><AgentsMdPanel/></I18nProvider>);
    `;

async function openPanel(t: TestContext, files: readonly AgentsFileMeta[]) {
  const bundle = await build({
    stdin: {
      contents: PANEL_FIXTURE,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('http://fixture.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<div id="root"></div>',
    }),
  );
  await page.goto('http://fixture.test/');
  await page.evaluate((files) => Reflect.set(window, 'contextFiles', files), files);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByText(files[0]!.content, { exact: true }).waitFor();
  return page;
}

const browserOptions = { skip: !existsSync(chromium.executablePath()) };

test(
  'rule fragments remain read-only and cannot become the AGENTS.md edit draft',
  browserOptions,
  async (t) => {
    const page = await openPanel(t, [projectRule]);
    assert.equal(await page.getByRole('button', { name: /Edit$/ }).count(), 0);
    await page.getByRole('button', { name: '+ Project', exact: true }).click();
    const editor = page.locator('textarea');
    assert.equal(await editor.inputValue(), '# AGENTS.md (project)\n\n');
    await editor.fill('NEW_PROJECT_AGENTS');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction('window.saves.length === 1');
    assert.deepEqual(await page.evaluate('window.saves'), [
      { sessionId: 'rules-session', scope: 'project', content: 'NEW_PROJECT_AGENTS' },
    ]);
  },
);

test(
  'mixed global and project context keeps AGENTS.md editable and each fragment distinct',
  browserOptions,
  async (t) => {
    const page = await openPanel(t, [globalRule, globalAgents, projectRule, projectAgents]);
    for (const file of [globalRule, projectRule]) {
      await page
        .getByRole('button')
        .and(page.getByTitle(file.path, { exact: true }))
        .click();
      assert.equal(await page.getByRole('button', { name: /Edit$/ }).count(), 0);
      assert.match(
        await page
          .getByRole('button')
          .and(page.getByTitle(file.path, { exact: true }))
          .innerText(),
        /\.md/,
      );
    }
    for (const file of [globalAgents, projectAgents]) {
      await page
        .getByRole('button')
        .and(page.getByTitle(file.path, { exact: true }))
        .click();
      await page.getByRole('button', { name: /Edit$/ }).click();
      assert.equal(await page.locator('textarea').inputValue(), file.content);
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    assert.equal(await page.getByRole('button', { name: '+ Global', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '+ Project', exact: true }).count(), 0);
  },
);
