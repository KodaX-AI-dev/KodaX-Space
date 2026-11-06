import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('composer keeps canonical input through atomic deletion, undo, copy and external restore', async () => {
  const bundle = await build({
    stdin: {
      contents: `
      import React, { useRef, useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ComposerEditor } from './ComposerEditor';
      function App() {
        const [value, setValue] = useState('Please inspect ');
        const [readOnly, setReadOnly] = useState(false);
        const ref = useRef(null);
        return <><ComposerEditor ref={ref} value={value} onChange={setValue} onSelectionChange={()=>{}}
          placeholder="Message" readOnly={readOnly} onKeyDown={(event)=>{if(event.key==='Enter' && !event.shiftKey) event.preventDefault();}} onPaste={()=>{}} />
          <button onClick={()=>ref.current.insertToken(15,15,{kind:'file', label:'demo.ts', value:'@src/demo.ts'})}>Insert</button>
          <button onClick={()=>setValue('')}>Clear</button>
          <button onClick={()=>setValue('Please inspect @src/demo.ts ')}>Restore</button>
          <button onClick={()=>setReadOnly((value)=>!value)}>Read only</button>
          <button onClick={()=>ref.current.insertToken(0,0,{kind:'command',label:'/help',value:'/help'})}>Command</button>
          <button onClick={()=>ref.current.insertToken(0,0,{kind:'skill',label:'/review',value:'/skill:review',detail:'/skills/review/SKILL.md'})}>Skill</button>
          <button onClick={()=>setValue('/rev argument')}>Prefix</button>
          <button onClick={()=>ref.current.insertToken(0,4,{kind:'command',label:'/review',value:'/review'})}>Accept command</button>
          <button onClick={()=>ref.current.insertToken(ref.current.value.length,ref.current.value.length,{kind:'file',label:'demo.ts',value:'@tests/demo.ts'})}>Other file</button>
          <output>{value}</output></>;
      }
      createRoot(document.getElementById('root')).render(<App/>);`,
      loader: 'tsx',
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    bundle: true,
    write: false,
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"' },
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    if (process.env.COMPOSER_COVERAGE)
      await page.coverage.startJSCoverage({ reportAnonymousScripts: true });
    await page.setContent(
      '<style>.relative{position:relative}.composer-token-details{position:absolute;bottom:100%;background:white}</style><div id="root" style="margin-top:200px"></div>',
    );
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    await page.getByText('Insert', { exact: true }).click();
    const editor = page.getByRole('textbox');
    await editor.focus();
    assert.equal(await page.locator('output').textContent(), 'Please inspect @src/demo.ts ');
    assert.equal(await editor.locator('[data-composer-token]').textContent(), 'demo.ts');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('output').textContent(), 'Please inspect @src/demo.ts ');
    await page.keyboard.press('Control+a');
    const copied = await editor.evaluate((element) => {
      const data = new DataTransfer();
      element.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
      );
      return Object.fromEntries(data.types.map((type) => [type, data.getData(type)]));
    });
    assert.equal(copied['text/plain'], 'Please inspect @src/demo.ts ');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('output').textContent(), 'Please inspect ');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(
      () => document.querySelector('output')?.textContent === 'Please inspect @src/demo.ts ',
    );
    await page.getByText('Clear', { exact: true }).click();
    assert.equal(await editor.textContent(), '');
    await page.getByText('Restore', { exact: true }).click();
    await page.waitForSelector('[data-composer-token]');
    await editor.focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('output').textContent(), '');
    await page.keyboard.type('next');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('line');
    assert.equal(await page.locator('output').textContent(), 'next\nline');
    await page.getByText('Clear', { exact: true }).click();
    await editor.focus();
    await editor.evaluate((element, formats) => {
      const data = new DataTransfer();
      for (const [type, value] of Object.entries(formats)) data.setData(type, value);
      element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, copied);
    await page.waitForFunction(
      () => document.querySelector('output')?.textContent === 'Please inspect @src/demo.ts ',
    );
    assert.equal(await page.locator('output').textContent(), 'Please inspect @src/demo.ts ');
    assert.equal(await editor.locator('[data-composer-token]').count(), 1);
    await page.getByText('Read only', { exact: true }).click();
    await editor.focus();
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    assert.equal(await page.locator('output').textContent(), 'Please inspect @src/demo.ts ');
    await page.getByText('Read only', { exact: true }).click();
    await editor.focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('one two');
    await page.keyboard.press('Control+Backspace');
    assert.equal(await page.locator('output').textContent(), 'one ');
    await page.getByText('Clear', { exact: true }).click();
    await page.getByText('Command', { exact: true }).click();
    assert.equal(await page.locator('output').textContent(), '/help ');
    await page.keyboard.press('Home');
    await page.keyboard.press('Delete');
    assert.equal(await editor.locator('[data-composer-token]').count(), 0);
    await page.getByText('Clear', { exact: true }).click();
    await page.getByText('Skill', { exact: true }).click();
    assert.equal(await editor.locator('[data-composer-token="skill"]').textContent(), '/review');
    assert.equal(await page.locator('output').textContent(), '/skill:review ');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');
    assert.equal(await page.locator('output').textContent(), '/skill:review');
    await page.keyboard.type(' ');
    await page.keyboard.press('Backspace');
    assert.equal(await editor.locator('[data-composer-token="skill"]').count(), 1);
    assert.equal(await page.locator('output').textContent(), '/skill:review');
    await editor.locator('[data-composer-token="skill"]').click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    assert.equal(await editor.locator('[data-composer-token]').count(), 0);
    await page.getByText('Prefix', { exact: true }).click();
    await page.getByText('Accept command', { exact: true }).click();
    assert.equal(await page.locator('output').textContent(), '/review argument');
    await page.getByText('Clear', { exact: true }).click();
    await page.getByText('Insert', { exact: true }).click();
    await page.getByText('Other file', { exact: true }).click();
    assert.deepEqual(await editor.locator('[data-composer-token="file"]').allTextContents(), [
      'src/demo.ts',
      'tests/demo.ts',
    ]);
    assert.equal(await page.locator('output').textContent(), '@src/demo.ts @tests/demo.ts ');
    if (process.env.COMPOSER_COVERAGE) await recordCoverage(page);
  } finally {
    await browser.close();
  }
});

async function recordCoverage(page: Page): Promise<void> {
  const entries = await page.coverage.stopJSCoverage();
  const report: Record<string, number> = {};
  let total = 0,
    coveredTotal = 0;
  for (const entry of entries) {
    const source = entry.source ?? '';
    const modules = [...source.matchAll(/^ {2}\/\/ (.+)$/gm)];
    const ranges = entry.functions.flatMap((fn) => fn.ranges);
    for (let m = 0; m < modules.length; m++) {
      const name = modules[m]![1]!;
      if (
        !/shell\/(ComposerEditor|ComposerTokenNode|composerEditorProjection|useComposerEditor)\.tsx?$/.test(
          name,
        )
      )
        continue;
      const start = modules[m]!.index!,
        end = modules[m + 1]?.index ?? source.length;
      const points = [
        ...new Set([
          start,
          end,
          ...ranges
            .flatMap((r) => [r.startOffset, r.endOffset])
            .filter((p) => p > start && p < end),
        ]),
      ].sort((a, b) => a - b);
      let covered = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const left = points[i]!,
          right = points[i + 1]!;
        const active = ranges
          .filter((r) => r.startOffset <= left && r.endOffset >= right)
          .sort((a, b) => a.endOffset - a.startOffset - (b.endOffset - b.startOffset))[0];
        if (active?.count) covered += right - left;
      }
      report[name] = Math.round((covered / (end - start)) * 10000) / 100;
      coveredTotal += covered;
      total += end - start;
    }
  }
  report.total = total ? Math.round((coveredTotal / total) * 10000) / 100 : 0;
  await mkdir('artifacts/composer', { recursive: true });
  await writeFile('artifacts/composer/browser-coverage.json', JSON.stringify(report, null, 2));
  assert.ok(report.total >= 80, JSON.stringify(report));
}
