// 原型自查截图：node docs/design/live-work-motion/capture.mjs [outDir]
// 用页面暴露的 window.__seek(ms) 跳到确定的虚拟时间点，三种主题/画质各截几帧。
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? join(here, 'previews');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(join(here, 'index.html')).href);
await page.evaluate(() => document.fonts.ready);

const events = await page.evaluate(() => window.__events.map((e) => ({ at: e.at, kind: e.kind, name: e.p?.name ?? e.p?.tool?.name })));
const first = (kind, name) => events.find((e) => e.kind === kind && (!name || e.name === name)).at;
const shots = {
  '1-thinking': first('thinkDelta') + 1000,
  '2-parallel': first('toolStart', 'read') + 300,
  '3-edit-streaming': first('toolStart', 'edit') + 700,
  '4-bash-running': first('toolStart', 'bash') + 1500,
  '5-settled': first('runEnd') + 900,
};

for (const theme of ['dark', 'light']) {
  await page.click(`[data-ctl="theme"] [data-v="${theme}"]`);
  for (const [name, ms] of Object.entries(shots)) {
    if (theme === 'light' && !['2-parallel', '4-bash-running'].includes(name)) continue;
    await page.click('#pause'); // 暂停时钟，避免截图时继续推进
    await page.evaluate((t) => window.__seek(t), ms);
    await page.waitForTimeout(700); // 让入场动画走完
    await page.screenshot({ path: join(out, `${theme}-${name}.png`) });
    await page.click('#pause');
  }
}
console.log(JSON.stringify({ shots, errors }, null, 1));
await browser.close();
