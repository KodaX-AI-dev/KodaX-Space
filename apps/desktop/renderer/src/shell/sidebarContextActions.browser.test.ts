import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{LeftSidebar}from'./LeftSidebar.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';import{useToastStore}from'../store/toastStore.ts';
const session={sessionId:'s',title:'Original task',surface:'code',projectRoot:'/project',createdAt:1,lastActivityAt:1};
const project={path:'/project',name:'Project',lastUsedAt:1};
window.flags=()=>useAppStore.getState().sessionFlags.s;window.calls=[];window.fail=false;window.toasts=()=>useToastStore.getState().toasts;
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='session.list')return{ok:true,data:{sessions:[session]}};
if(channel==='session.listRunning')return{ok:true,data:{peers:[]}};
if(channel==='project.list')return{ok:true,data:{projects:[project]}};
if(channel==='session.setTitle'){if(!window.fail)session.title=input.title;return{ok:true,data:{ok:!window.fail}};}
if(channel==='project.recent.rename'){project.name=input.name;return{ok:true,data:{renamed:true}};}
if(channel==='shell.openPath')return{ok:true,data:{opened:true}};
return{ok:false,error:{message:'Unused fixture channel'}};
}};
useAppStore.setState({currentSessionId:'s',currentProjectPath:'/project',projects:[project],sessions:[session]});
createRoot(document.getElementById('root')).render(<I18nProvider><LeftSidebar onOpenSettings={()=>{}}/></I18nProvider>);
`;
test(
  'sidebar context rename opens an editor, saves on Enter and reports a rejected save',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const bundled = await build({
      stdin: {
        contents: fixture,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      jsx: 'automatic',
      logLevel: 'silent',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
      loader: { '.css': 'empty' },
      plugins: [
        {
          name: 'unused-worker',
          setup(builder) {
            builder.onResolve({ filter: /\?worker$/ }, (args) => ({
              path: args.path,
              namespace: 'unused-worker',
            }));
            builder.onLoad({ filter: /.*/, namespace: 'unused-worker' }, () => ({
              contents: 'export default class {}',
              loader: 'js',
            }));
          },
        },
      ],
    });
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://history.test/', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<style>[data-testid="conversation-scroll-container"]{height:600px;overflow:auto}</style><div id="root"></div>',
      }),
    );
    await page.goto('http://history.test/');
    await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
    await page.addScriptTag({ content: bundled.outputFiles[0].text });

    const row = page.getByTestId('sidebar-session-row');
    await page.waitForTimeout(200);
    assert.deepEqual(errors, []);
    assert.ok(await row.count(), await page.locator('body').innerText());
    await row.click({ button: 'right' });
    await page.locator('[data-menu-action="rename-session"]').click();
    const input = page.getByRole('textbox', { name: 'Rename session' });
    await input.waitFor({ timeout: 2000 });
    await input.fill('Renamed task');
    await input.press('Enter');
    await page.waitForFunction(() =>
      document
        .querySelector('[data-testid="sidebar-session-row"]')
        ?.textContent?.includes('Renamed task'),
    );
    await row.click({ button: 'right' });
    await page.locator('[data-menu-action="rename-session"]').click();
    await input.fill('Saved by blur');
    await input.press('Tab');
    await page.waitForTimeout(100);
    assert.match(
      await row.innerText(),
      /Saved by blur/,
      'clicking away should save the edited task name',
    );
    assert.equal(
      await page.evaluate("window.calls.filter(call=>call.channel==='session.setTitle').length"),
      2,
    );
    await row.click({ button: 'right' });
    await page.locator('[data-menu-action="rename-session"]').click();
    await input.fill('Cancelled title');
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    assert.equal(await input.count(), 1, 'IME confirmation must not submit a rename');
    await input.press('Escape');
    assert.equal(
      await page.evaluate("window.calls.filter(call=>call.channel==='session.setTitle').length"),
      2,
    );
    await page.evaluate('window.fail=true');
    await row.click({ button: 'right' });
    await page.locator('[data-menu-action="rename-session"]').click();
    await input.fill('Rejected title');
    await input.press('Enter');
    await page.waitForTimeout(100);
    assert.match(
      await row.innerText(),
      /Saved by blur/,
      'a rejected mutation must not change the displayed title',
    );
    assert.ok(
      (await page.evaluate<Array<{ tone: string }>>('window.toasts()')).some(
        (toast: { tone: string }) => toast.tone === 'error',
      ),
    );

    for (const action of ['pin-session', 'toggle-session-unread']) {
      await row.click({ button: 'right' });
      await page.locator('[data-menu-action="' + action + '"]').click();
      assert.equal(await page.getByRole('menu').count(), 0);
    }
    assert.deepEqual(await page.evaluate('window.flags()'), { pinned: true, unread: true });
    await row.click({ button: 'right' });
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page
        .locator('[data-menu-action="rename-session"]')
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(50);
    assert.equal(
      await row.evaluate((el) => el === document.activeElement),
      true,
      'Escape returns focus to the task',
    );
    const project = page.getByRole('button', { name: 'Project', exact: true });
    await project.click({ button: 'right' });
    await page.locator('[data-menu-action="rename-project"]').click();
    const projectInput = page.getByRole('textbox');
    await projectInput.fill('Renamed project');
    await projectInput.press('Tab');
    await page.waitForTimeout(100);
    assert.equal(
      await page.getByRole('button', { name: 'Renamed project', exact: true }).count(),
      1,
    );
    assert.deepEqual(errors, []);
  },
);
