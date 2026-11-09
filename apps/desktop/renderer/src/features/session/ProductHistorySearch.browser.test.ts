import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{ProductHistorySearch}from'./ProductHistorySearch.tsx';
import{I18nProvider}from'../../i18n/I18nProvider.tsx';
window.calls=[];window.locates=[];window.locateMode='located';window.holdLocate=false;window.holdBody=false;
window.kodaxSpace={platform:'win32',on:()=>()=>{},invoke:async(channel,input)=>{
window.calls.push({channel,input});
if(channel==='settings.get')return{ok:true,data:{languageMode:'en-US',effectiveLocale:'en-US'}};
if(channel==='session.productSearch')return{ok:true,data:{revision:'r',hits:[{itemId:input.sessionId+'-'+input.query,entryIndex:1,role:'user',snippet:input.query+' result'}]}};
if(channel==='session.productItem'){
if(window.holdBody)await new Promise(resolve=>window.releaseBody=resolve);
const text='Original '+input.itemId;
return{ok:true,data:{id:input.itemId,text,offset:0,totalLength:text.length}};
}
return{ok:false,error:{message:'Unexpected '+channel}};
}};
function App(){const[context,setContext]=useState({sessionId:'s',query:'needle'});window.setContext=setContext;
return <ProductHistorySearch {...context} onLocate={async(id,signal)=>{
window.locates.push({id,signal});
if(window.holdLocate)await new Promise(resolve=>window.releaseLocate=resolve);
if(window.locateMode==='failed')throw new Error('Location unavailable');
return window.locateMode;
}}/>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);
`;

const browserAvailable = existsSync(chromium.executablePath());
const bundle = browserAvailable
  ? await build({
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
    })
  : undefined;

async function openSearch(t: TestContext) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://search.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('https://search.test/');
  await page.evaluate(() => localStorage.setItem('kodax-space.languageMode', 'en-US'));
  await page.addScriptTag({ content: bundle!.outputFiles[0].text });
  await page.getByTestId('sdk-history-search-result').waitFor();
  return { page, errors };
}

test(
  'opening a saved result locates its context in one action without reading its full original',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openSearch(t);
    await page.getByTestId('sdk-history-search-result').click();
    await page.waitForFunction('window.locates.length === 1');
    assert.equal(await page.evaluate('window.locates[0].id'), 's-needle');
    assert.deepEqual(
      await page.evaluate("window.calls.filter(call=>call.channel==='session.productItem')"),
      [],
    );
    await page.getByTestId('sdk-history-search-result').waitFor();
    assert.deepEqual(errors, []);
  },
);

test(
  'unavailable context falls back to the original and returns focus to the chosen result',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openSearch(t);
    await page.evaluate("window.locateMode='missing'");
    await page.getByTestId('sdk-history-search-result').click();
    await page.getByTestId('sdk-history-search-body').waitFor();
    assert.equal(
      await page.getByTestId('sdk-history-search-body').textContent(),
      'Original s-needle',
    );
    await page
      .getByText('Only the original record is available for this result.', { exact: true })
      .waitFor();
    assert.equal(await page.evaluate('window.locates.length'), 1);
    await page.getByRole('button', { name: 'Back to results', exact: true }).click();
    await page.waitForFunction(
      "document.activeElement?.getAttribute('data-hit-id') === 's-needle'",
    );
    await page.getByRole('button', { name: 'Read original', exact: true }).click();
    await page.getByTestId('sdk-history-search-body').waitFor();
    assert.equal(
      await page.evaluate('window.locates.length'),
      1,
      'explicit original reading skips location',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'expired results keep the query available for retry without reading an expired original',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openSearch(t);
    await page.evaluate("window.locateMode='stale'");
    await page.getByTestId('sdk-history-search-result').click();
    await page
      .getByRole('status')
      .filter({ hasText: 'This result changed. Search again to find its current position.' })
      .waitFor();
    assert.equal(
      await page.evaluate("window.calls.filter(call=>call.channel==='session.productItem').length"),
      0,
    );
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByTestId('sdk-history-search-result').waitFor();
    assert.equal(
      await page.getByTestId('sdk-history-search-result').textContent(),
      'needle result',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'a failed location still exposes the original and reports the location failure',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openSearch(t);
    await page.evaluate("window.locateMode='failed'");
    await page.getByTestId('sdk-history-search-result').click();
    await page.getByTestId('sdk-history-search-body').waitFor();
    await page.getByText('Could not load conversation history', { exact: true }).waitFor();
    assert.equal(
      await page.getByTestId('sdk-history-search-body').textContent(),
      'Original s-needle',
    );
    assert.deepEqual(errors, []);
  },
);

test(
  'changing the query or session cancels a pending location and ignores its late fallback',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openSearch(t);
    await page.evaluate("window.holdLocate=true;window.locateMode='missing'");
    await page.getByTestId('sdk-history-search-result').click();
    await page.waitForFunction('window.locates.length === 1');
    await page.evaluate("window.setContext({sessionId:'other',query:'fresh'})");
    await page.getByText('fresh result', { exact: true }).waitFor();
    assert.equal(await page.evaluate('window.locates[0].signal.aborted'), true);
    await page.evaluate('window.releaseLocate()');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(
      await page.evaluate("window.calls.filter(call=>call.channel==='session.productItem').length"),
      0,
    );
    assert.equal(await page.getByTestId('sdk-history-search-body').count(), 0);
    assert.deepEqual(errors, []);
  },
);

test(
  'changing context ignores a late original read and back cancels a pending location',
  { skip: !browserAvailable },
  async (t) => {
    const { page, errors } = await openSearch(t);
    await page.evaluate('window.holdBody=true');
    await page.getByRole('button', { name: 'Read original', exact: true }).click();
    await page.waitForFunction("window.calls.some(call=>call.channel==='session.productItem')");
    await page.evaluate("window.setContext({sessionId:'other',query:'fresh'})");
    await page.getByText('fresh result', { exact: true }).waitFor();
    await page.evaluate('window.releaseBody()');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    assert.equal(await page.getByTestId('sdk-history-search-body').count(), 0);
    await page.evaluate('window.holdLocate=true');
    await page.getByTestId('sdk-history-search-result').click();
    await page.waitForFunction('window.locates.length === 1');
    await page.getByRole('button', { name: 'Back to results', exact: true }).click();
    assert.equal(await page.evaluate('window.locates[0].signal.aborted'), true);
    await page.evaluate('window.releaseLocate()');
    await page.getByText('fresh result', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  },
);
