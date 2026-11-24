// Diagnostic copy of sdk-history-navigation.spec.ts:309. Installed before the app loads, it records
// every scrollTop write on the transcript scroller, every read that returns a zero scroll size
// (with the ancestor chain's display state), attribute mutations, focus changes and scroll events.
// Branch-only: records the outcome instead of asserting it. Never merge.
import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSessionManager } from '@kodax-ai/kodax/session';
import type { KodaXMessage } from '@kodax-ai/kodax/agent';
import { createLocalSdkProvider, launchRealSdkSpace } from './sdk-provider-fixture.js';

test.setTimeout(600_000);
const SESSION = 'sdk-history-navigation';
const REPORT =
  '<agent-completed id="child-report" path="/root/review" state="completed">\n**Review report**\n\nThe checkpoint says &quot;preserve&quot;.\n</agent-completed>';

async function seedHistory(root: string): Promise<void> {
  const project = path.join(root, 'project');
  await mkdir(project, { recursive: true });
  const manager = createSessionManager({ sessionsDir: path.join(root, 'sessions'), configHome: root });
  const messages: KodaXMessage[] = [];
  for (let index = 0; index < 260; index += 1) {
    messages.push(
      { role: 'user', inputId: `input-${index}`, content: `HISTORY_QUESTION_${index}` },
      {
        role: 'assistant',
        outputId: `output-${index}`,
        content: [
          {
            type: 'text',
            text: `HISTORY_ANSWER_${index}\n\n${'Read the full report paragraph.\n\n'.repeat(6)}`,
          },
        ],
      },
    );
    if (index === 109) {
      messages.push(
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'HISTORY_THINKING_NEEDLE_109' },
            { type: 'text', text: 'HISTORY_DETAIL_CONTEXT_109' },
            { type: 'tool_use', id: 'history-read-109', name: 'read', input: { path: 'HISTORY_TOOL_NEEDLE_109' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'history-read-109', content: 'HISTORY_TOOL_RESULT_109' }],
        },
      );
    }
  }
  messages.push({ role: 'user', content: REPORT, _source: 'agent-completed' });
  await manager.storage.save(SESSION, {
    title: 'SDK_HISTORY_NAVIGATION',
    gitRoot: project,
    scope: 'user',
    runtimeInfo: { workspaceRoot: project, surface: 'repl' },
    messages,
  });
}

type Diag = { lines: string[]; t0: number; seq: number; last: string; stop: boolean; lastTick: number };

// Runs before the application scripts, so nothing the app does to the scroller is missed.
function installEarlyInstrumentation(): void {
  const w = window as unknown as { __diag: Diag };
  const diag: Diag = { lines: [], t0: performance.now(), seq: 0, last: '', stop: false, lastTick: 0 };
  w.__diag = diag;
  const at = () => Math.round(performance.now() - diag.t0);
  const describeEl = (el: Element | null | undefined) => {
    if (!el) return 'null';
    const id = el.getAttribute('data-testid');
    const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join('.') : '';
    return `${el.tagName.toLowerCase()}${id ? '#' + id : ''}${cls ? '.' + cls : ''}`;
  };
  // Bundled code is minified: file, line and column identify the call site.
  const stack = (skip = 3) =>
    (new Error().stack ?? '')
      .split('\n')
      .slice(skip, skip + 10)
      .map((frame) => frame.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '').replace(/app:\/\/space\/assets\//, ''))
      .join(' <- ');
  const isScroller = (el: Element) => el.getAttribute('data-testid') === 'conversation-scroll-container';
  const chain = (el: Element) => {
    const parts: string[] = [];
    for (let node: Element | null = el; node && parts.length < 14; node = node.parentElement) {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      parts.push(
        `${describeEl(node)}[${style.display}/${style.visibility} ${Math.round(rect.width)}x${Math.round(rect.height)}${node.hasAttribute('hidden') ? ' HIDDEN-ATTR' : ''}${node.hasAttribute('inert') ? ' INERT' : ''}]`,
      );
    }
    return parts.join(' > ');
  };

  const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    enumerable: scrollTop.enumerable,
    get: function (this: Element) {
      return scrollTop.get!.call(this);
    },
    set: function (this: Element, value: number) {
      if (isScroller(this)) {
        const before = scrollTop.get!.call(this) as number;
        scrollTop.set!.call(this, value);
        const after = scrollTop.get!.call(this) as number;
        if (after <= 0.5 || value !== before)
          diag.lines.push(
            `${at()} WRITE-SCROLLTOP value=${String(value).slice(0, 12)} before=${before.toFixed(1)} after=${after.toFixed(1)} clientHeight=${this.clientHeight} active=${describeEl(document.activeElement)}\n    ${stack(3)}\n    chain ${chain(this)}`,
          );
      } else scrollTop.set!.call(this, value);
    },
  });
  for (const property of ['scrollHeight', 'clientHeight'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, property)!;
    Object.defineProperty(Element.prototype, property, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: function (this: Element) {
        const value = descriptor.get!.call(this);
        if (isScroller(this) && value === 0 && document.body && document.body.contains(this))
          diag.lines.push(
            `${at()} ZERO-${property.toUpperCase()} active=${describeEl(document.activeElement)}\n    ${stack(3)}\n    chain ${chain(this)}`,
          );
        return value;
      },
    });
  }
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    diag.lines.push(
      `${at()} FOCUS preventScroll=${options?.preventScroll ?? false} target=${describeEl(this)} from=${describeEl(document.activeElement)}\n    ${stack(3)}`,
    );
    return focus.call(this, options);
  };
  const scrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
    diag.lines.push(`${at()} ELEMENT-SCROLL-INTO-VIEW ${describeEl(this)} ${JSON.stringify(args).slice(0, 60)}\n    ${stack(3)}`);
    return scrollIntoView.apply(this, args as Parameters<Element['scrollIntoView']>);
  };
  window.addEventListener(
    'scroll',
    (event) => {
      const el = event.target;
      if (!(el instanceof Element) || !isScroller(el)) return;
      diag.lines.push(
        `${at()} SCROLL-EVENT top=${el.scrollTop.toFixed(1)} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight} active=${describeEl(document.activeElement)}`,
      );
    },
    true,
  );
  for (const type of ['focusin', 'focusout'] as const) {
    document.addEventListener(
      type,
      (event) => {
        diag.lines.push(`${at()} ${type.toUpperCase()} ${describeEl(event.target)}`);
      },
      true,
    );
  }
  document.addEventListener(
    'keydown',
    (event) => {
      diag.lines.push(`${at()} KEYDOWN ${event.key} target=${describeEl(event.target)}`);
    },
    true,
  );
  // Style, class and hidden changes on the panes around the transcript; rows inside it are skipped.
  const interesting = (el: Element) =>
    el.closest('[data-testid="conversation-scroll-container"]') === null &&
    (el.hasAttribute('data-testid') || /center-pane|popout|workspace|shell|split|pane/i.test(typeof el.className === 'string' ? el.className : ''));
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const el = record.target;
      if (!(el instanceof Element) || !interesting(el)) continue;
      const change = record.attributeName === 'style' ? `style="${(el.getAttribute('style') ?? '').slice(0, 60)}"` : `${record.attributeName}="${(el.getAttribute(record.attributeName ?? '') ?? '').slice(0, 70)}"`;
      diag.lines.push(`${at()} ATTR ${describeEl(el)} ${change} display=${getComputedStyle(el).display}`);
    }
  });
  const start = () => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start);

  const name = (row?: Element | null) =>
    (row?.textContent ?? '').match(/HISTORY_(?:ANSWER|QUESTION)_\d+/)?.[0]
    ?? ((row?.textContent ?? '').includes('Browse history') ? 'BROWSE' : undefined)
    ?? ((row?.textContent ?? '').includes('Review report') ? 'REPORT' : undefined)
    ?? (row?.getAttribute('data-window-row') ?? '-').slice(0, 10);
  const scroller = () =>
    document.querySelector<HTMLElement>('[data-testid="conversation-scroll-container"]');
  const tick = () => {
    const now = performance.now();
    const el = scroller();
    if (el) {
      if (!el.dataset.diagId) el.dataset.diagId = String((diag.seq += 1));
      const rows = [...el.querySelectorAll('[data-window-row]')];
      const spacers = [...el.querySelectorAll('[data-window-spacer]')].map((spacer) =>
        Math.round(spacer.getBoundingClientRect().height),
      );
      const search = document.querySelector<HTMLElement>('[data-testid="transcript-search-bar"]');
      const state = [
        `#${el.dataset.diagId}`,
        `${el.scrollTop.toFixed(1)}/${(el.scrollHeight - el.clientHeight).toFixed(1)} h=${el.clientHeight}`,
        `${name(rows[0])}..${name(rows.at(-1))}(${rows.length})`,
        `spacers=${spacers.join(',')}`,
        `search=${search && !search.hidden ? 'y' : 'n'}`,
        `active=${describeEl(document.activeElement)}`,
      ].join(' ');
      if (state !== diag.last) {
        diag.last = state;
        diag.lines.push(`${at()} FRAME ${state}`);
      }
    }
    if (diag.lastTick && now - diag.lastTick > 80) diag.lines.push(`${at()} RAF-GAP ${Math.round(now - diag.lastTick)}ms`);
    diag.lastTick = now;
    if (!diag.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function mark(page: Page, label: string): Promise<void> {
  await page.evaluate((text) => {
    const diag = (window as unknown as { __diag: Diag }).__diag;
    diag.lines.push(`${Math.round(performance.now() - diag.t0)} == ${text}`);
  }, label);
}

async function flow(page: Page, step: (label: string) => Promise<void>): Promise<void> {
  const search = page.getByTestId('transcript-search-bar');
  const stream = page.getByTestId('conversation-stream');
  const query = 'HISTORY_QUESTION_109';
  await step('ctrl+f');
  await page.keyboard.press('Control+f');
  await step('fill-query');
  await search.getByRole('searchbox').fill(query);
  await step('select-scope');
  await search.getByRole('combobox').selectOption('session');
  const hit = search.getByTestId('sdk-history-search-result').filter({ hasText: query });
  await expect(hit).toHaveCount(1);
  await step('click-read-original');
  await hit.locator('..').getByRole('button', { name: 'Read original', exact: true }).click();
  await step('click-back-to-results#1');
  await search.getByRole('button', { name: 'Back to results', exact: true }).click();
  await step('press-enter');
  await search.getByRole('searchbox').press('Enter');
  await expect(stream.locator('[data-msg-id]').filter({ hasText: query }).first()).toBeInViewport();
  await step('click-back-to-results#2');
  await page.getByRole('button', { name: 'Back to results' }).click();
  let count = 2;
  for (const [needle, body] of [
    ['HISTORY_TOOL_NEEDLE_109', 'HISTORY_TOOL_RESULT_109'],
    ['HISTORY_DETAIL_CONTEXT_109', 'HISTORY_DETAIL_CONTEXT_109'],
  ]) {
    const kind = needle.includes('TOOL') ? 'tool' : 'detail';
    await step(`fill-${kind}-needle`);
    await search.getByRole('searchbox').fill(needle);
    const detailHit = search.getByTestId('sdk-history-search-result').filter({ hasText: needle });
    await expect(detailHit).toHaveCount(1);
    await step(`click-${kind}-hit`);
    await detailHit.click();
    await expect(stream.getByText(body, { exact: true })).toBeVisible();
    await expect(stream.locator('[data-source-item]:focus')).toBeInViewport();
    count += 1;
    await step(`click-back-to-results#${count}`);
    await page.getByRole('button', { name: 'Back to results' }).click();
  }
}

test('diag: search return trace', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `history-search-diag-${Date.now()}`,
    provider.url,
    seedHistory,
  );
  try {
    const page = space.page;
    await page.addInitScript(installEarlyInstrumentation);
    await page.reload();
    await page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_HISTORY_NAVIGATION' })
      .click();
    const stream = page.getByTestId('conversation-stream');
    await expect(stream).toContainText('HISTORY_ANSWER_259');
    await mark(page, 'search-open');
    let failure = '';
    try {
      await flow(page, (label) => mark(page, label));
    } catch (error) {
      failure = String(error).slice(0, 600);
    }
    await mark(page, 'before-escape');
    await page.keyboard.press('Escape');
    await mark(page, 'escape-returned');
    await page.getByTestId('transcript-search-bar').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const settled = await stream.evaluate(
      (element) => (element.textContent ?? '').includes('HISTORY_ANSWER_259'),
    );
    const geometry = await page
      .getByTestId('conversation-scroll-container')
      .evaluate((element) => {
        const el = element as HTMLElement;
        return {
          top: el.scrollTop,
          range: el.scrollHeight - el.clientHeight,
          rows: [...el.querySelectorAll('[data-window-row]')].map(
            (row) => (row.textContent ?? '').match(/HISTORY_(?:ANSWER|QUESTION)_\d+/)?.[0] ?? 'other',
          ),
        };
      });
    const lines = await page.evaluate(() => {
      const diag = (window as unknown as { __diag: Diag }).__diag;
      diag.stop = true;
      return diag.lines;
    });
    const report = [
      `SETTLED=${settled} failure=${failure || 'none'}`,
      `geometry=${JSON.stringify(geometry)}`,
      ...lines.map((line) => `  ${line}`),
    ].join('\n');
    for (const dir of ['macos-acceptance-evidence/diag', 'test-results/diag']) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `search-return-${process.env.TEST_WORKER_INDEX ?? '0'}-${Date.now()}.txt`), `${report}\n`, 'utf8');
    }
  } finally {
    await provider.close();
    await space.close();
  }
});
