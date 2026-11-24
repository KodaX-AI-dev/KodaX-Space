// Diagnostic copy of sdk-history-navigation.spec.ts:309 with a per-frame scroll trace and
// stack captures of every scrollTop write, focus() and scrollIntoView() on the page.
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

async function installSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __diag: Diag };
    const diag: Diag = { lines: [], t0: performance.now(), seq: 0, last: '', stop: false, lastTick: 0 };
    w.__diag = diag;
    const at = () => Math.round(performance.now() - diag.t0);
    const describeEl = (el: Element | null | undefined) => {
      if (!el) return 'null';
      const id = el.getAttribute('data-testid');
      const cls = typeof el.className === 'string' ? el.className.split(' ').slice(0, 2).join('.') : '';
      return `${el.tagName.toLowerCase()}${id ? '#' + id : ''}${cls ? '.' + cls : ''}`;
    };
    // Bundled code is minified: file, line and column identify the call site.
    const stack = (skip = 3) =>
      (new Error().stack ?? '')
        .split('\n')
        .slice(skip, skip + 9)
        .map((frame) => frame.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '').replace(/\?t=\d+/, ''))
        .join(' <- ');
    const name = (row?: Element | null) =>
      (row?.textContent ?? '').match(/HISTORY_(?:ANSWER|QUESTION)_\d+/)?.[0]
      ?? ((row?.textContent ?? '').includes('Browse history') ? 'BROWSE' : undefined)
      ?? ((row?.textContent ?? '').includes('Review report') ? 'REPORT' : undefined)
      ?? (row?.getAttribute('data-window-row') ?? '-').slice(0, 10);
    const scroller = () =>
      document.querySelector<HTMLElement>('[data-testid="conversation-scroll-container"]');

    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    const patchScroller = (el: HTMLElement) => {
      if (el.dataset.diagId) return;
      el.dataset.diagId = String((diag.seq += 1));
      Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => scrollTop.get!.call(el),
        set: (value: number) => {
          const before = scrollTop.get!.call(el) as number;
          scrollTop.set!.call(el, value);
          const after = scrollTop.get!.call(el) as number;
          if (after <= 0.5 || value !== before)
            diag.lines.push(
              `${at()} WRITE-SCROLLTOP #${el.dataset.diagId} value=${String(value).slice(0, 12)} before=${before.toFixed(1)} after=${after.toFixed(1)} scrollHeight=${el.scrollHeight}\n    ${stack()}`,
            );
        },
      });
      for (const method of ['scrollTo', 'scrollBy', 'scroll', 'scrollIntoView'] as const) {
        const original = el[method] as (...args: unknown[]) => unknown;
        (el as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
          diag.lines.push(`${at()} CALL-${method.toUpperCase()} #${el.dataset.diagId} ${JSON.stringify(args).slice(0, 80)}\n    ${stack()}`);
          return original.apply(el, args);
        };
      }
    };
    const focus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
      const active = document.activeElement;
      diag.lines.push(
        `${at()} FOCUS preventScroll=${options?.preventScroll ?? false} target=${describeEl(this)} from=${describeEl(active)}\n    ${stack(4)}`,
      );
      return focus.call(this, options);
    };
    const scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
      diag.lines.push(`${at()} ELEMENT-SCROLL-INTO-VIEW ${describeEl(this)} ${JSON.stringify(args).slice(0, 60)}\n    ${stack(4)}`);
      return scrollIntoView.apply(this, args as Parameters<Element['scrollIntoView']>);
    };
    const selection = () => {
      const current = document.getSelection();
      if (!current) return 'none';
      const node = current.anchorNode;
      const element = node instanceof Element ? node : node?.parentElement;
      return current.isCollapsed
        ? `collapsed@${describeEl(element)}`
        : `range@${describeEl(element)}:${String(current.toString()).slice(0, 24)}`;
    };
    window.addEventListener(
      'scroll',
      (event) => {
        const el = scroller();
        if (!el || event.target !== el) return;
        diag.lines.push(
          `${at()} SCROLL-EVENT #${el.dataset.diagId} top=${el.scrollTop.toFixed(1)} scrollHeight=${el.scrollHeight} clientHeight=${el.clientHeight} children=${el.firstElementChild?.firstElementChild?.childElementCount ?? '-'} active=${describeEl(document.activeElement)} selection=${selection()}`,
        );
      },
      true,
    );
    for (const type of ['focusin', 'focusout'] as const) {
      document.addEventListener(type, (event) => {
        diag.lines.push(`${at()} ${type.toUpperCase()} ${describeEl(event.target)}`);
      }, true);
    }
    document.addEventListener(
      'keydown',
      (event) => {
        diag.lines.push(`${at()} KEYDOWN ${event.key} target=${describeEl(event.target)} trusted=${event.isTrusted}`);
      },
      true,
    );
    let mutations = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) mutations += record.addedNodes.size + record.removedNodes.size;
    });
    const tick = () => {
      const now = performance.now();
      const el = scroller();
      if (el) {
        patchScroller(el);
        if (!el.dataset.diagObserved) {
          el.dataset.diagObserved = '1';
          observer.observe(el, { childList: true, subtree: true, attributes: true });
        }
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
          rows[0]
            ? `firstTop=${(rows[0].getBoundingClientRect().top - el.getBoundingClientRect().top).toFixed(0)}`
            : 'firstTop=-',
          `search=${search && !search.hidden ? 'y' : 'n'}`,
          `back=${[...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Back to results') ? 'y' : 'n'}`,
          `jump=${document.querySelector('[aria-label="Jump to bottom"]') ? 'y' : 'n'}`,
          `active=${describeEl(document.activeElement)}`,
          `mutations=${mutations}`,
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
    diag.lines.push(
      `${at()} window ${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio} platform=${navigator.platform}`,
    );
  });
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
    await step(`fill-${needle.includes('TOOL') ? 'tool' : 'detail'}-needle`);
    await search.getByRole('searchbox').fill(needle);
    const detailHit = search.getByTestId('sdk-history-search-result').filter({ hasText: needle });
    await expect(detailHit).toHaveCount(1);
    await step(`click-${needle.includes('TOOL') ? 'tool' : 'detail'}-hit`);
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
  const consoleLines: string[] = [];
  try {
    const page = space.page;
    page.on('console', (message) => {
      if (consoleLines.length < 200 && message.type() !== 'debug')
        consoleLines.push(`${message.type()}: ${message.text().slice(0, 200)}`);
    });
    page.on('pageerror', (error) => consoleLines.push(`pageerror: ${String(error).slice(0, 300)}`));
    await page
      .getByTestId('sidebar-session-row')
      .filter({ hasText: 'SDK_HISTORY_NAVIGATION' })
      .click();
    const stream = page.getByTestId('conversation-stream');
    await expect(stream).toContainText('HISTORY_ANSWER_259');
    await installSampler(page);
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
      ...consoleLines.map((line) => `  console ${line}`),
    ].join('\n');
    console.log(`DIAG-REPORT\n${report}`);
    for (const dir of ['macos-acceptance-evidence/diag', 'test-results/diag']) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, `search-return-${process.env.TEST_WORKER_INDEX ?? '0'}-${Date.now()}.txt`), `${report}\n`, 'utf8');
    }
  } finally {
    await provider.close();
    await space.close();
  }
});
