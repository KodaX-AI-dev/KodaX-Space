import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = [
  chromium.executablePath(),
  ...(process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : []),
].find(existsSync);

test(
  'host-signalled Base tasks auto-open once despite broad refreshes and later task stages',
  { skip: !browserPath },
  async (t) => {
    const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {PartnerBaseTaskAutoOpener} from './PartnerBaseTaskAutoOpener.tsx';
import {PartnerRemoteRecordsProvider,usePartnerRemoteRecords} from '../extensions/usePartnerRemoteRecords.ts';
import {useAppStore} from '../../store/appStore.ts';
import {useSurfaceStore} from '../../store/surface.ts';
function RemoteRecordsProbe(){usePartnerRemoteRecords();return null;}
const owner={sessionId:'session-1',projectRoot:'/project',extensionId:'kodax.partner-library',connectorId:'feishu-docs',connectionId:'b6c4724a-979d-4267-9968-8ce67653c880',connectionRevision:1,folderUrl:'https://test.feishu.cn/drive/folder/Folder1',baseName:'项目台账',tableName:'任务',fields:[{type:'text',name:'事项'}],timeZone:'Asia/Shanghai',inputHash:'a'.repeat(64),scopeHash:'b'.repeat(64)};
const old={...owner,id:'785fc824-c17a-48c2-a360-e515028869b5',status:'succeeded',baseToken:'baseOld',tableId:'tblOld',url:'https://www.feishu.cn/base/baseOld',createdAt:'2026-09-01T09:00:00.000Z',updatedAt:'2026-09-01T09:00:01.000Z'};
const preparing={...owner,id:'985fc824-c17a-48c2-a360-e515028869b5',status:'preparing',createdAt:'2026-09-01T10:00:00.000Z',updatedAt:'2026-09-01T10:00:00.000Z'};
const second={...owner,id:'a85fc824-c17a-48c2-a360-e515028869b5',baseName:'客户跟进',status:'preparing',createdAt:'2026-09-01T10:01:00.000Z',updatedAt:'2026-09-01T10:01:00.000Z'};
const late={...owner,id:'b85fc824-c17a-48c2-a360-e515028869b5',baseName:'待办台账',status:'preparing',createdAt:'2026-09-01T10:02:00.000Z',updatedAt:'2026-09-01T10:02:00.000Z'};
const interleavedA={...owner,id:'c85fc824-c17a-48c2-a360-e515028869b5',baseName:'并发任务 A',status:'preparing',createdAt:'2026-09-01T10:03:00.000Z',updatedAt:'2026-09-01T10:03:00.000Z'};
const interleavedB={...owner,id:'d85fc824-c17a-48c2-a360-e515028869b5',baseName:'并发任务 B',status:'preparing',createdAt:'2026-09-01T10:04:00.000Z',updatedAt:'2026-09-01T10:04:00.000Z'};
window.records={sources:[],proposals:[],receipts:[],baseTasks:[old]};window.targets=[];window.calls=0;window.listeners={};window.holdRecords=false;window.recordWaiters=[];
window.kodaxSpace={platform:'darwin',on:(channel,listener)=>{window.listeners[channel]=listener;return()=>{};},invoke:async(channel)=>{if(channel==='partner.connectors.records'){window.calls+=1;if(window.holdRecords)await new Promise(resolve=>window.recordWaiters.push(resolve));return {ok:true,data:window.records};}return {ok:false,error:{code:'ERR_TEST',message:channel}};}};
useSurfaceStore.getState().setSurface('partner');useAppStore.getState().setCurrentProject('/project');useAppStore.getState().setCurrentSession('session-1');
window.startInterleaved=()=>{window.holdRecords=true;window.records={...window.records,baseTasks:[old,interleavedA,interleavedB]};window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',baseTaskId:interleavedA.id});window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',baseTaskId:interleavedB.id});window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',baseTaskId:interleavedA.id});};
window.releaseRecords=()=>{window.holdRecords=false;for(const resolve of window.recordWaiters.splice(0))resolve();};
window.startBase=()=>{window.records={...window.records,baseTasks:[old,preparing]};window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',baseTaskId:preparing.id});window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',extensionId:'kodax.partner-library'});};
window.finishBase=()=>{const succeeded={...preparing,status:'succeeded',baseToken:'baseNew',tableId:'tblNew',url:'https://www.feishu.cn/base/baseNew',updatedAt:'2026-09-01T10:00:01.000Z'};window.records={...window.records,baseTasks:[old,succeeded]};window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',baseTaskId:succeeded.id});};
window.startSecond=()=>{window.records={...window.records,baseTasks:[...window.records.baseTasks,second]};window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',baseTaskId:second.id});};
window.signalLate=()=>{window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',baseTaskId:late.id});};
window.revealLate=()=>{window.records={...window.records,baseTasks:[...window.records.baseTasks,late]};window.listeners['partner.connectors.changed']({sessionId:'session-1',projectRoot:'/project',extensionId:'kodax.partner-library'});};
createRoot(document.getElementById('root')).render(<PartnerRemoteRecordsProvider><PartnerBaseTaskAutoOpener onOpenDetail={(target)=>window.targets.push(target)}/><RemoteRecordsProbe/><RemoteRecordsProbe/></PartnerRemoteRecordsProvider>);
`;
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
      define: { 'import.meta.env': '{}', 'import.meta.url': '"about:blank"' },
      loader: { '.png': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(3_000);
    await page.route('**/*', (route) =>
      route.fulfill({ body: '<div id="root"></div>', contentType: 'text/html' }),
    );
    await page.goto('https://partner-base-task.test/');
    await page.addScriptTag({ content: bundled.outputFiles[0]!.text });
    await page.waitForFunction(() => Reflect.get(window, 'calls') > 0);
    assert.equal(await page.evaluate(() => Reflect.get(window, 'calls')), 1);
    assert.deepEqual(await page.evaluate(() => Reflect.get(window, 'targets')), []);

    await page.evaluate(() => Reflect.get(window, 'startInterleaved')());
    await page.waitForFunction(() => Reflect.get(window, 'calls') >= 4);
    await page.evaluate(() => Reflect.get(window, 'releaseRecords')());
    await page.waitForFunction(() => Reflect.get(window, 'targets').length === 2);
    assert.deepEqual(
      await page.evaluate(() =>
        Reflect.get(window, 'targets').map(
          (target: { readonly task: { readonly baseName: string } }) => target.task.baseName,
        ),
      ),
      ['并发任务 B', '并发任务 A'],
    );

    await page.evaluate(() => Reflect.get(window, 'startBase')());
    await page.waitForFunction(() => Reflect.get(window, 'targets').length === 3);
    const taskTarget = await page.evaluate(() => Reflect.get(window, 'targets')[2]);
    assert.equal(taskTarget.kind, 'baseTask');
    assert.equal(taskTarget.task.status, 'preparing');

    const callsBeforeFinish = await page.evaluate(() => Reflect.get(window, 'calls'));
    await page.evaluate(() => Reflect.get(window, 'finishBase')());
    await page.waitForFunction(
      (minimum) => Reflect.get(window, 'calls') > minimum,
      callsBeforeFinish,
    );
    assert.equal(await page.evaluate(() => Reflect.get(window, 'targets').length), 3);

    await page.evaluate(() => Reflect.get(window, 'startSecond')());
    await page.waitForFunction(() => Reflect.get(window, 'targets').length === 4);
    assert.equal(
      await page.evaluate(() => Reflect.get(window, 'targets')[3].task.baseName),
      '客户跟进',
    );

    const callsBeforeLate = await page.evaluate(() => Reflect.get(window, 'calls'));
    await page.evaluate(() => Reflect.get(window, 'signalLate')());
    await page.waitForFunction(
      (minimum) => Reflect.get(window, 'calls') > minimum,
      callsBeforeLate,
    );
    assert.equal(await page.evaluate(() => Reflect.get(window, 'targets').length), 4);
    await page.evaluate(() => Reflect.get(window, 'revealLate')());
    await page.waitForFunction(() => Reflect.get(window, 'targets').length === 5);
    assert.equal(
      await page.evaluate(() => Reflect.get(window, 'targets')[4].task.baseName),
      '待办台账',
    );
  },
);
