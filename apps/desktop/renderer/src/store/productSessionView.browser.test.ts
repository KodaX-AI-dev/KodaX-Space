import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const browserPath = chromium.executablePath();
const fixture = `
import React,{useLayoutEffect} from 'react';
import{createRoot}from'react-dom/client';
import{replaceProductSessionView,productTranscriptSnapshot,useProductSessionTranscript,installProductItemContent}from'./productSessionView.ts';
window.samples=[];window.frame=0;
const tick=()=>{window.frame++;requestAnimationFrame(tick)};requestAnimationFrame(tick);
const items=Array.from({length:120},(_,index)=>({id:'body-'+index,type:'assistant',text:'tail',textOffset:4,totalTextLength:8,outputState:'committed',textRevision:0}));
function Transcript(){const snapshot=useProductSessionTranscript('session');const completed=snapshot?.items.filter(item=>item.text==='headtail').length??0;
useLayoutEffect(()=>{window.samples.push({frame:window.frame,completed})},[snapshot]);return <output id="completed">{completed}</output>}
createRoot(document.getElementById('root')).render(<Transcript/>);
window.complete=async()=>{replaceProductSessionView({sessionId:'session',runtimeId:'runtime',revision:1,items});
await Promise.all(items.map(item=>new Promise(resolve=>setTimeout(resolve,0)).then(()=>installProductItemContent('session',item,'text','headtail'))));
return productTranscriptSnapshot('session').items.filter(item=>item.text==='headtail').length;};
`;

test(
  'concurrent full-body replies update the transcript immediately without repeated renders in one frame',
  {
    skip: !existsSync(browserPath),
  },
  async (t) => {
    const bundle = await build({
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
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    });
    const browser = await chromium.launch({ executablePath: browserPath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => document.getElementById('completed'));
    assert.equal(await page.evaluate('window.complete()'), 120);
    await page.waitForFunction(() => document.getElementById('completed')?.textContent === '120');
    const samples = (await page.evaluate('window.samples')) as {
      frame: number;
      completed: number;
    }[];
    const frames = new Map<number, Set<number>>();
    for (const sample of samples.filter((sample) => sample.completed > 0)) {
      const counts = frames.get(sample.frame) ?? new Set<number>();
      counts.add(sample.completed);
      frames.set(sample.frame, counts);
    }
    assert.ok(frames.size > 0);
    assert.ok(
      [...frames.values()].every((counts) => counts.size === 1),
      'body replies should coalesce before painting',
    );
    assert.deepEqual(errors, []);
  },
);
