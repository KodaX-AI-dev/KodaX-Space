import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('inline references stay legible, align with prose and truncate without changing their identity', async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import React, { useRef, useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ComposerEditor } from './ComposerEditor';
        function App() {
          const ref = useRef(null);
          const [value, setValue] = useState('请检查 ');
          function insert(token, at = ref.current.value.length) { ref.current.insertToken(at, at, token); }
          return <main>
            <h1>行内引用 · 中英文混排</h1>
            <div className="test-frame"><ComposerEditor ref={ref} value={value} onChange={setValue}
              onSelectionChange={()=>{}} onKeyDown={()=>{}} onPaste={()=>{}} placeholder="Message" /></div>
            <nav>
              <button onClick={()=>insert({kind:'command',label:'/review',value:'/review'},0)}>Command</button>
              <button onClick={()=>insert({kind:'file',label:'README.md',value:'@src/README.md'})}>File</button>
              <button onClick={()=>insert({kind:'skill',label:'code-review',value:'/skill:code-review'})}>Skill</button>
              <button onClick={()=>insert({kind:'file',label:'很长的文件名称-long-reference-with-distinguishing-directory-and-extra-context.ts',value:'@src/long-source.ts'})}>Long file</button>
            </nav><output>{value}</output>
          </main>;
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
  const stylesheet = (await readFile(new URL('../styles.css', import.meta.url), 'utf8'))
    .replace(/^@import.*$/gm, '')
    .replace(/^@tailwind.*$/gm, '');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 920, height: 420 } });
    await page.setContent(`<style>${stylesheet}
      body{margin:36px;background:rgb(var(--surface));color:rgb(var(--fg-primary));font-family:var(--ui)}
      h1{font-size:18px;font-weight:500;margin:0 0 20px}.test-frame{position:relative;padding:20px;border:1px solid rgb(var(--border-default));border-radius:12px}
      nav,output{display:none}
      </style><div id="root"></div>`);
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
    for (const name of ['Command', 'File', 'Skill', 'Long file']) {
      await page
        .getByRole('button', { name, exact: true, includeHidden: true })
        .dispatchEvent('click');
    }
    const editor = page.getByRole('textbox');
    await editor.focus();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('中英混排 abc 123');
    const canonical = await page.locator('output').textContent();
    assert.equal(
      canonical,
      '/review 请检查 @src/README.md /skill:code-review @src/long-source.ts 中英混排 abc 123',
    );
    await mkdir('artifacts/composer-light-references', { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(
        (next) => document.documentElement.classList.toggle('dark', next === 'dark'),
        theme,
      );
      await page.mouse.move(0, 0);
      const appearance = await editor.evaluate((node) => ({
        fontSize: getComputedStyle(node).fontSize,
        lineHeight: getComputedStyle(node).lineHeight,
        canvas: getComputedStyle(document.body).backgroundColor,
        tokens: Array.from(node.querySelectorAll<HTMLElement>('[data-composer-token]')).map(
          (token) => {
            const css = getComputedStyle(token);
            return {
              color: css.color,
              background: css.backgroundColor,
              border: css.borderTopWidth,
              fontSize: css.fontSize,
              lineHeight: css.lineHeight,
              iconColor: getComputedStyle(token, '::before').color,
            };
          },
        ),
      }));
      assert.equal(new Set(appearance.tokens.slice(0, 3).map((token) => token.color)).size, 3);
      for (const token of appearance.tokens) {
        assert.equal(token.background, 'rgba(0, 0, 0, 0)');
        assert.equal(token.border, '0px');
        assert.equal(token.fontSize, appearance.fontSize);
        assert.equal(token.lineHeight, appearance.lineHeight);
        assert.equal(token.iconColor, token.color);
        assert.ok(contrast(token.color, appearance.canvas) >= 4.5, `${theme}: ${token.color}`);
      }
      const file = editor.getByText('README.md', { exact: true });
      const before = await file.boundingBox();
      await file.hover();
      assert.notEqual(
        await file.evaluate((node) => getComputedStyle(node).backgroundColor),
        'rgba(0, 0, 0, 0)',
      );
      assert.deepEqual(await file.boundingBox(), before);
      await page.mouse.move(0, 0);
      await page
        .locator('main')
        .screenshot({ path: `artifacts/composer-light-references/reference-${theme}.png` });
      assert.equal(await page.locator('output').textContent(), canonical);
    }
    await page.setViewportSize({ width: 480, height: 420 });
    const longFile = editor.getByText(
      '很长的文件名称-long-reference-with-distinguishing-directory-and-extra-context.ts',
      { exact: true },
    );
    assert.ok(await longFile.evaluate((node) => node.scrollWidth > node.clientWidth));
    assert.equal(await longFile.getAttribute('title'), '@src/long-source.ts');
    assert.ok(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth));
    await page
      .locator('main')
      .screenshot({ path: 'artifacts/composer-light-references/reference-narrow.png' });
  } finally {
    await browser.close();
  }
});

function contrast(foreground: string, background: string): number {
  const luminance = (color: string): number => {
    const channels = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const first = luminance(foreground),
    second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
