import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';

// The project list is one manual order owned by main (projects.json); the sidebar shows it as
// returned, never re-sorting by added time or recent use. Sessions hide archived rows behind one toggle.
const fixture = `
import React from 'react';import{createRoot}from'react-dom/client';
import{LeftSidebar}from'./LeftSidebar.tsx';import{I18nProvider}from'../i18n/I18nProvider.tsx';
import{useAppStore}from'../store/appStore.ts';
const projects=[
{path:'/p/charlie',name:'charlie',addedAt:3,lastUsedAt:5},
{path:'/p/alpha',name:'alpha',addedAt:1,lastUsedAt:1},
{path:'/p/bravo',name:'bravo',addedAt:2,lastUsedAt:9}];
const meta=(sessionId,lastActivityAt,createdAt=1,extra={})=>({sessionId,title:sessionId,surface:'code',projectRoot:'/p/alpha',createdAt,lastActivityAt,...extra});
const sessions=[meta('live',2),meta('shelved',3),meta('runOld',100,10),meta('runNew',50,20),meta('forked',60,5,{parentSessionId:'live'}),meta('partnerTask',70,1,{surface:'partner'})];
const outsideWindow=[meta('farAway',1,1,{projectRoot:'/p/bravo'})];
window.store=useAppStore;window.fixtureSessions=sessions;window.idLookups=[];
window.flagCalls=[];window.archiveCalls=[];window.pinCalls=[];
window.kodaxSpace={platform:'linux',rendererReady:()=>{},on:()=>()=>{},invoke:async(channel,input)=>{
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='project.list')return{ok:true,data:{projects:[...projects]}};
if(channel==='project.pinned.set'){const pins=input.pinned.map((p)=>p.split(String.fromCharCode(92)).join('/'));window.pinCalls.push(pins);for(let i=0;i<projects.length;i++){const{pinnedIndex,...rest}=projects[i];const at=pins.indexOf(rest.path);projects[i]=at<0?rest:{...rest,pinnedIndex:at};}return{ok:true,data:{}};}
if(channel==='project.recent.setArchived'){window.archiveCalls.push(input);const i=projects.findIndex((p)=>p.path===input.path);projects[i]={...projects[i],archived:input.archived};return{ok:true,data:{ok:true}};}
if(channel==='session.list'){if(input?.sessionIds){window.idLookups.push(input);return{ok:true,data:{sessions:outsideWindow.filter((s)=>input.sessionIds.includes(s.sessionId))}};}return{ok:true,data:{sessions}};}
if(channel==='session.listRunning')return{ok:true,data:{peers:[]}};
if(channel==='session.flags.set'){window.flagCalls.push(input);const flags={};for(const[id,f]of Object.entries(useAppStore.getState().sessionFlags)){const{unread,...kept}=f??{};if(Object.keys(kept).length)flags[id]=kept;}return{ok:true,data:{flags}};}
return{ok:false,error:{message:'Unused fixture channel: '+channel}};
}};
useAppStore.setState({projects,expandedProjects:{'/p/alpha':true},sessions,sessionFlags:{shelved:{archivedAt:1}},pendingSendBySession:{runOld:true,runNew:true}});
createRoot(document.getElementById('root')).render(<I18nProvider><div style={{width:280,height:600,display:'flex',flexDirection:'column'}}><LeftSidebar onOpenSettings={()=>{}}/></div></I18nProvider>);
`;

function bundleFixture() {
  return build({
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
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env': '{}',
      'import.meta.glob': '__testAssetGlob',
    },
    banner: { js: 'const __testAssetGlob=()=>({});' },
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
    plugins: [
      {
        name: 'vite-assets',
        setup(builder) {
          builder.onResolve({ filter: /\?(?:url|inline|worker)$/ }, (args) => ({
            path: args.path,
            namespace: 'asset',
          }));
          builder.onLoad({ filter: /.*/, namespace: 'asset' }, (args) => ({
            contents: args.path.endsWith('?worker')
              ? 'export default class {}'
              : 'export default ""',
            loader: 'js',
          }));
        },
      },
    ],
  });
}

async function openFixture(t: TestContext): Promise<{ page: Page; errors: string[] }> {
  const bundle = await bundleFixture();
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
  page.setDefaultTimeout(2500);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://sidebar.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://sidebar.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
  await page.getByRole('button', { name: 'alpha', exact: true }).waitFor();
  return { page, errors };
}

const projectNames = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('button[aria-expanded]'))
      .map((button) => button.textContent?.trim() ?? '')
      .filter((name) => ['alpha', 'bravo', 'charlie'].includes(name)),
  );

const menuActions = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-menu-action]')).map(
      (item) => item.dataset.menuAction ?? '',
    ),
  );

test(
  'projects show in the saved order, regardless of added time or recent use',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    assert.deepEqual(await projectNames(page), ['charlie', 'alpha', 'bravo']);
    assert.deepEqual(errors, []);
  },
);

test(
  'running tasks stay first in a stable created-time order; forks list flat',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.getByRole('button', { name: /^live/ }).waitFor();
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="sidebar-session-row"]')).map(
        (row) => ({ id: row.dataset.sessionId, indent: row.style.paddingLeft }),
      ),
    );
    // runOld was active more recently, but running rows keep their created-time order.
    assert.deepEqual(
      rows.map((row) => row.id),
      ['runNew', 'runOld', 'forked', 'live'],
    );
    assert.equal(new Set(rows.map((row) => row.indent)).size, 1);
    assert.deepEqual(errors, []);
  },
);

test(
  'task rows pin and archive from hover buttons without opening the task',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const live = page.locator('[data-session-id="live"]');
    await live.hover();
    await page.getByRole('button', { name: 'Pin task: live' }).click();
    await page.getByRole('button', { name: 'Unpin task: live' }).waitFor();
    await live.hover();
    await page.getByRole('button', { name: 'Archive: live' }).click();
    await live.waitFor({ state: 'detached' });
    assert.deepEqual(await page.evaluate('window.flagCalls'), [
      { sessionId: 'live', pinned: true },
      { sessionId: 'live', archived: true },
    ]);
    // The buttons act on the row without opening the task.
    assert.equal(
      await page.locator('[data-testid="sidebar-session-row"][aria-current="page"]').count(),
      0,
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'archive comes before delete: live tasks archive, archived tasks unarchive or delete',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.locator('[data-session-id="live"]').click({ button: 'right' });
    const liveActions = await menuActions(page);
    assert.ok(liveActions.includes('archive-session'));
    assert.ok(!liveActions.includes('delete-session'));
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Show archived sessions' }).click();
    await page.locator('[data-session-id="shelved"]').click({ button: 'right' });
    assert.deepEqual(await menuActions(page), ['unarchive-session', 'delete-session']);
    assert.deepEqual(errors, []);
  },
);

test(
  'archived sessions stay hidden until the archived toggle is on',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.getByRole('button', { name: /^live/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /^shelved/ }).count(), 0);

    const toggle = page.getByRole('button', { name: 'Show archived sessions' });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await toggle.click();
    const shelved = page.getByRole('button', { name: /^shelved/ });
    await shelved.waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    // Archived rows stay recognisable among the active ones.
    assert.match((await shelved.getAttribute('class')) ?? '', /\bopacity-60\b/);
    // The old filter / group / sort menu is gone.
    assert.equal(await page.getByRole('button', { name: 'Filter projects / sessions' }).count(), 0);
    assert.deepEqual(errors, []);
  },
);

test(
  'projects archive first, remove only once archived, and unarchive back to their place',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const alpha = page.getByRole('button', { name: 'alpha', exact: true });
    await alpha.click({ button: 'right' });
    const liveActions = await menuActions(page);
    assert.ok(liveActions.includes('archive-project'));
    assert.ok(!liveActions.includes('remove-project'));
    await page.locator('[data-menu-action="archive-project"]').click();
    await alpha.waitFor({ state: 'detached' });
    assert.deepEqual(await projectNames(page), ['charlie', 'bravo']);

    await page.getByRole('button', { name: /^Archived/ }).click();
    await alpha.click({ button: 'right' });
    assert.deepEqual(await menuActions(page), ['unarchive-project', 'remove-project']);
    await page.locator('[data-menu-action="unarchive-project"]').click();
    await page.getByRole('button', { name: /^Archived/ }).waitFor({ state: 'detached' });
    assert.deepEqual(await projectNames(page), ['charlie', 'alpha', 'bravo']);
    assert.deepEqual(await page.evaluate('window.archiveCalls'), [
      { path: '/p/alpha', archived: true },
      { path: '/p/alpha', archived: false },
    ]);
    assert.deepEqual(errors, []);
  },
);

const sessionRowIds = (page: Page, inPinnedArea: boolean): Promise<string[]> =>
  page.evaluate(
    (pinned) =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-testid="sidebar-session-row"]'))
        .filter((row) => (row.closest('[data-testid="sidebar-pinned-tasks"]') !== null) === pinned)
        .map((row) => row.dataset.sessionId ?? ''),
    inPinnedArea,
  );

test(
  'pinned tasks sit above the projects, newest pin first, and leave their project list',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.evaluate(() =>
      (window as unknown as { store: { setState(s: object): void } }).store.setState({
        sessionFlags: {
          shelved: { archivedAt: 1 },
          live: { pinnedAt: 5 },
          runOld: { pinnedAt: 9 },
          farAway: { pinnedAt: 7 },
          partnerTask: { pinnedAt: 8 },
        },
      }),
    );
    // farAway is outside the loaded window, so the pinned area fetches it by id.
    await page
      .locator('[data-testid="sidebar-pinned-tasks"] [data-session-id="farAway"]')
      .waitFor();
    assert.deepEqual(await sessionRowIds(page, true), ['runOld', 'farAway', 'live']);
    assert.deepEqual(await sessionRowIds(page, false), ['runNew', 'forked']);
    assert.deepEqual(await page.evaluate('window.idLookups'), [
      { surface: 'code', sessionIds: ['farAway'] },
    ]);

    const pinned = page.locator('[data-testid="sidebar-pinned-tasks"]');
    await pinned.locator('[data-session-id="runOld"]').hover();
    await page.getByRole('button', { name: 'Unpin task: runOld' }).click();
    await page.locator('[data-testid="sidebar-pinned-tasks"] [data-session-id="runOld"]').waitFor({
      state: 'detached',
    });
    assert.deepEqual(await sessionRowIds(page, false), ['runNew', 'runOld', 'forked']);

    await pinned.locator('[data-session-id="live"]').hover();
    await page.getByRole('button', { name: 'Archive: live' }).click();
    await page.locator('[data-session-id="live"]').waitFor({ state: 'detached' });
    assert.deepEqual(await sessionRowIds(page, true), ['farAway']);
    assert.deepEqual(errors, []);
  },
);

const projectNamesIn = (page: Page, pinnedArea: boolean): Promise<string[]> =>
  page.evaluate(
    (pinned) =>
      Array.from(document.querySelectorAll<HTMLElement>('button[aria-expanded]'))
        .filter(
          (button) =>
            (button.closest('[data-testid="sidebar-pinned-projects"]') !== null) === pinned,
        )
        .map((button) => button.textContent?.trim() ?? '')
        .filter((name) => ['alpha', 'bravo', 'charlie'].includes(name)),
    pinnedArea,
  );

test(
  'pinned projects sit under pinned tasks, newest pin on top, and unpin back to their place',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const pin = async (name: string): Promise<void> => {
      await page.getByRole('button', { name, exact: true }).click({ button: 'right' });
      await page.locator('[data-menu-action="pin-project"]').click();
    };
    await pin('bravo');
    await page.locator('[data-testid="sidebar-pinned-projects"]').waitFor();
    await pin('charlie');
    await page.waitForFunction(
      () => (window as unknown as { pinCalls: unknown[] }).pinCalls.length === 2,
    );
    assert.deepEqual(await projectNamesIn(page, true), ['charlie', 'bravo']);
    assert.deepEqual(await projectNamesIn(page, false), ['alpha']);

    await page.getByRole('button', { name: 'bravo', exact: true }).click({ button: 'right' });
    const unpin = page.locator('[data-menu-action="pin-project"]');
    assert.equal((await unpin.textContent())?.trim(), 'Unpin project');
    await unpin.click();
    await page.waitForFunction(
      () => (window as unknown as { pinCalls: unknown[] }).pinCalls.length === 3,
    );
    assert.deepEqual(await projectNamesIn(page, true), ['charlie']);
    assert.deepEqual(await projectNamesIn(page, false), ['alpha', 'bravo']);
    assert.deepEqual(await page.evaluate('window.pinCalls'), [
      ['/p/bravo'],
      ['/p/charlie', '/p/bravo'],
      ['/p/charlie'],
    ]);

    // Pinned tasks come first, then pinned projects, then the main list.
    await page.evaluate(() =>
      (window as unknown as { store: { setState(s: object): void } }).store.setState({
        sessionFlags: { live: { pinnedAt: 5 } },
      }),
    );
    const tasks = page.locator('[data-testid="sidebar-pinned-tasks"]');
    await tasks.waitFor();
    const projectsFollowTasks = await tasks.evaluate(
      (el) =>
        (el.compareDocumentPosition(
          document.querySelector('[data-testid="sidebar-pinned-projects"]')!,
        ) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    );
    assert.equal(projectsFollowTasks, true);
    assert.deepEqual(errors, []);
  },
);

test(
  'the "Show all" picker leaves pinned tasks out, like the project list',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    await page.evaluate(() => {
      const w = window as unknown as {
        fixtureSessions: object[];
        store: { getState(): { sessions: object[] }; setState(s: object): void };
      };
      const filler = Array.from({ length: 20 }, (_, i) => ({
        sessionId: `filler${i}`,
        title: `filler${i}`,
        surface: 'code',
        projectRoot: '/p/alpha',
        createdAt: 1,
        lastActivityAt: 30 + i,
      }));
      w.fixtureSessions.push(...filler);
      w.store.setState({
        sessions: [...w.store.getState().sessions, ...filler],
        sessionFlags: { shelved: { archivedAt: 1 }, live: { pinnedAt: 5 } },
      });
    });
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Show more' }).click();
    await page.getByRole('button', { name: /^Browse all/ }).click();
    const picker = page.getByRole('dialog', { name: 'Sessions in alpha' });
    await picker.getByText('filler0', { exact: true }).waitFor();
    const titles = await picker.locator('li button span.truncate').allTextContents();
    assert.equal(titles.includes('live'), false);
    assert.equal(titles.includes('runOld'), true);
    assert.deepEqual(errors, []);
  },
);

test(
  'the pinned area has its own "Pinned" heading above the "Projects" heading',
  { skip: !existsSync(chromium.executablePath()) },
  async (t) => {
    const { page, errors } = await openFixture(t);
    const area = page.locator('[data-testid="sidebar-pinned-area"]');
    assert.equal(await area.count(), 0);

    await page.evaluate(() =>
      (window as unknown as { store: { setState(s: object): void } }).store.setState({
        sessionFlags: { live: { pinnedAt: 5 } },
      }),
    );
    await area.locator('[data-session-id="live"]').waitFor();
    const headings = await page.evaluate(() => {
      const sidebar = document.querySelector('[data-testid="left-sidebar"]')!;
      return Array.from(sidebar.querySelectorAll('span'))
        .map((span) => span.textContent?.trim() ?? '')
        .filter((text) => text === 'Pinned' || text === 'Projects');
    });
    assert.deepEqual(headings, ['Pinned', 'Projects']);
    assert.equal(await page.getByRole('region', { name: 'Pinned' }).count(), 1);
    assert.deepEqual(errors, []);
  },
);
