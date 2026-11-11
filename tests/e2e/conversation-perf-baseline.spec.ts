// F144 ticket 1 baseline: long saved Sessions through the real SDK reader, measured in the real
// renderer. Opt-in only (`npm run test:perf-baseline`); never part of the default e2e suite.
import { errors, expect, test, type CDPSession, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSessionManager } from '@kodax-ai/kodax/session';
import { createLocalSdkProvider, launchRealSdkSpace } from './sdk-provider-fixture.js';
import { type SpaceInstance } from './fixtures.js';
import { buildPerfCorpus } from './helpers/perfCorpus.js';
import { summarize } from './helpers/perfStats.js';
import { HISTORY_LOAD_MEASURE_PREFIX } from '../../apps/desktop/renderer/src/lib/historyLoadDiagnostics.js';

test.skip(
  process.env.SPACE_E2E_PERF_BASELINE !== '1',
  'Opt-in F144 baseline: run `npm run test:perf-baseline` (sets SPACE_E2E_PERF_BASELINE=1).',
);

interface PerfCorpusSpec {
  readonly id: string;
  readonly surface: 'code' | 'partner';
  readonly turns: number;
  readonly seed: number;
  readonly giantBodyChars?: number;
  readonly giantToolCalls?: number;
  /** Newer pages appended from the search-located oldest window; reported when capped. */
  readonly maxAppends: number;
}

// Turn counts are calibrated to ~1k / 10k / 30k render rows when fully paged in.
const CORPORA: readonly PerfCorpusSpec[] = [
  { id: 'coder-1k', surface: 'code', turns: 420, seed: 1001, maxAppends: 100 },
  { id: 'coder-10k', surface: 'code', turns: 3800, seed: 1010, maxAppends: 25 },
  { id: 'coder-30k', surface: 'code', turns: 11400, seed: 1030, maxAppends: 25 },
  {
    id: 'coder-giant',
    surface: 'code',
    turns: 120,
    seed: 1099,
    giantBodyChars: 1_000_000,
    giantToolCalls: 300,
    maxAppends: 100,
  },
  { id: 'partner-10k', surface: 'partner', turns: 3800, seed: 2010, maxAppends: 25 },
];
const PREPEND_BUDGET_MS = 75 * 60_000;
const PAGE_WAIT_MS = 60_000;
const SETTLE_FRAMES = 40;
const SCROLL_STEP_PX = 1500;
const MAX_SCROLL_FRAMES = 120;
const IPC_PROBE_PAGES = 30;
// Outside test-results/, which Playwright empties per run, so corpora can be run separately.
const RESULTS_DIR = path.resolve('artifacts/perf-baselines/f144');
const SCROLLER = '[data-testid="conversation-scroll-container"]';
const ROW = '[data-testid="conversation-render-row"]';
// F144 acceptance: mounted rows stay bounded however much history is loaded.
const MAX_MOUNTED_ROWS = 500;
const PHASES = ['ipc', 'install', 'commit', 'layout', 'paint'] as const;

declare global {
  interface Window {
    __perfClick?: { clickAt: number; doneAt: number };
  }
}

interface HistorySplitSample {
  readonly seq: number;
  readonly kind: string;
  readonly items: number;
  readonly ipc: number;
  readonly install: number;
  readonly commit: number;
  readonly layout: number;
  readonly paint: number;
  readonly total: number;
}

interface PageStep {
  readonly split: HistorySplitSample | null;
  readonly driftPx: number | null;
  readonly rows: number;
}

async function settle(page: Page, frames = SETTLE_FRAMES): Promise<void> {
  await page.evaluate(async (count) => {
    for (let frame = 0; frame < count; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, frames);
}

function mountedRows(page: Page): Promise<number> {
  return page.evaluate((selector) => document.querySelectorAll(selector).length, ROW);
}

async function heapMb(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  const usage = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number };
  return Math.round((usage.usedSize / 1_048_576) * 10) / 10;
}

/** All finished history loads (one per `kodax.history.paint`) with seq greater than `after`. */
async function readSplits(page: Page, after: number): Promise<HistorySplitSample[]> {
  const entries = await page.evaluate(
    (prefix) =>
      performance
        .getEntriesByType('measure')
        .filter((entry) => entry.name.startsWith(prefix))
        .map((entry) => ({
          phase: entry.name.slice(prefix.length),
          ms: Math.round(entry.duration * 10) / 10,
          detail: (entry as PerformanceMeasure).detail as {
            seq: number;
            kind: string;
            items: number;
          },
        })),
    HISTORY_LOAD_MEASURE_PREFIX,
  );
  const bySeq = new Map<number, { kind: string; items: number; phases: Map<string, number> }>();
  for (const { phase, ms, detail } of entries) {
    if (detail.seq <= after) continue;
    const load = bySeq.get(detail.seq) ?? {
      kind: detail.kind,
      items: detail.items,
      phases: new Map(),
    };
    load.phases.set(phase, ms);
    bySeq.set(detail.seq, load);
  }
  return [...bySeq.entries()]
    .filter(([, load]) => load.phases.has('paint'))
    .sort(([left], [right]) => left - right)
    .map(([seq, { kind, items, phases }]) => {
      const [ipc, install, commit, layout, paint] = PHASES.map(
        (phase) => phases.get(phase) ?? 0,
      ) as [number, number, number, number, number];
      const total = Math.round((ipc + install + commit + layout + paint) * 10) / 10;
      return { seq, kind, items, ipc, install, commit, layout, paint, total };
    });
}

async function lastSeq(page: Page): Promise<number> {
  return (await readSplits(page, 0)).at(-1)?.seq ?? 0;
}

async function waitForLoad(
  page: Page,
  after: number,
  kind: string,
): Promise<HistorySplitSample | null> {
  try {
    await page.waitForFunction(
      ({ after, kind }) =>
        performance.getEntriesByName('kodax.history.paint').some((entry) => {
          const detail = (entry as PerformanceMeasure).detail as { seq: number; kind: string };
          return detail.seq > after && detail.kind === kind;
        }),
      { after, kind },
      { timeout: PAGE_WAIT_MS, polling: 50 },
    );
  } catch (error) {
    // No load in time is a reported stop reason (`no-load`), not a hidden failure.
    if (error instanceof errors.TimeoutError) return null;
    throw error;
  }
  return (await readSplits(page, after)).find((split) => split.kind === kind) ?? null;
}

/** Top of the first row visible at the viewport top (or the given row when it is mounted). */
function anchorTop(page: Page, id?: string): Promise<{ id: string | null; top: number }> {
  return page.evaluate(
    ({ selector, id }) => {
      const scroller = document.querySelector(selector)!;
      const viewportTop = scroller.getBoundingClientRect().top;
      const rows = [...scroller.querySelectorAll('[data-msg-id]')];
      const row = id
        ? rows.find((candidate) => candidate.getAttribute('data-msg-id') === id)
        : rows.find((candidate) => candidate.getBoundingClientRect().bottom > viewportTop + 1);
      return {
        id: row?.getAttribute('data-msg-id') ?? null,
        top: row?.getBoundingClientRect().top ?? 0,
      };
    },
    { selector: SCROLLER, id },
  );
}

function edgeRowsInclude(page: Page, marker: string, edge: 'first' | 'last'): Promise<boolean> {
  return page.evaluate(
    ({ marker, edge }) => {
      const rows = [
        ...document.querySelectorAll('[data-testid="conversation-stream"] [data-msg-id]'),
      ];
      const slice = edge === 'first' ? rows.slice(0, 3) : rows.slice(-3);
      return slice.some((row) => row.textContent?.includes(marker));
    },
    { marker, edge },
  );
}

/** Starts a frame timer on the next click; done once `marker` is in the tail rows at the bottom for 3 frames. */
async function armClickTimer(page: Page, marker: string): Promise<void> {
  await page.evaluate(
    ({ marker, selector }) => {
      const state = { clickAt: 0, doneAt: 0 };
      window.__perfClick = state;
      const ready = () => {
        const scroller = document.querySelector(selector);
        if (!scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 2)
          return false;
        const rows = scroller.querySelectorAll('[data-msg-id]');
        return [...rows].slice(-3).some((row) => row.textContent?.includes(marker));
      };
      document.addEventListener(
        'click',
        () => {
          state.clickAt = performance.now();
          let streak = 0;
          let streakStart = 0;
          const poll = (time: number) => {
            streak = ready() ? streak + 1 : 0;
            if (streak === 1) streakStart = time;
            if (streak >= 3) state.doneAt = Math.max(streakStart, state.clickAt);
            else requestAnimationFrame(poll);
          };
          requestAnimationFrame(poll);
        },
        { capture: true, once: true },
      );
    },
    { marker, selector: SCROLLER },
  );
}

async function clickTimerMs(page: Page): Promise<number> {
  await page.waitForFunction(() => (window.__perfClick?.doneAt ?? 0) > 0, null, {
    timeout: PAGE_WAIT_MS,
    polling: 50,
  });
  return page.evaluate(
    () => Math.round((window.__perfClick!.doneAt - window.__perfClick!.clickAt) * 10) / 10,
  );
}

/** One page toward `direction`, or null when `edgeMarker` is already at that edge. */
async function pageStep(
  page: Page,
  direction: 'older' | 'newer',
  edgeMarker: string,
): Promise<PageStep | null> {
  const scroller = page.locator(SCROLLER);
  const seq = await lastSeq(page);
  await scroller.evaluate((element, direction) => {
    element.scrollTop = direction === 'older' ? 0 : element.scrollHeight;
  }, direction);
  // Checked at the edge: transcript windowing mounts only the rows near the viewport.
  await settle(page, 3);
  if (await edgeRowsInclude(page, edgeMarker, direction === 'older' ? 'first' : 'last'))
    return null;
  const before = await anchorTop(page);
  await scroller.hover();
  await page.mouse.wheel(0, direction === 'older' ? -120 : 120);
  const split = await waitForLoad(page, seq, direction);
  await settle(page);
  const after = before.id ? await anchorTop(page, before.id) : null;
  return {
    split,
    driftPx: after?.id ? Math.round((after.top - before.top) * 10) / 10 : null,
    rows: await mountedRows(page),
  };
}

/** What the paging UI showed when a wheel produced no page, so a stop is explainable. */
function noLoadEvidence(page: Page) {
  return page.evaluate((selector) => {
    const scroller = document.querySelector(selector)!;
    const text = (id: string) =>
      document.querySelector(`[data-testid="${id}"]`)?.textContent?.trim() ?? null;
    return {
      pagingStatus: text('history-paging-status'),
      pagingError: text('history-paging-error'),
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
    };
  }, SCROLLER);
}

async function prependToOldest(page: Page, cdp: CDPSession) {
  const steps: PageStep[] = [];
  const heap: { rows: number; heapMb: number }[] = [];
  const started = Date.now();
  let stop: 'oldest' | 'budget' | 'no-load' = 'oldest';
  for (;;) {
    if (Date.now() - started > PREPEND_BUDGET_MS) {
      stop = 'budget';
      break;
    }
    const step = await pageStep(page, 'older', 'PERF_Q_0 ');
    if (!step) break;
    if (!step.split) {
      stop = 'no-load';
      break;
    }
    steps.push(step);
    if (steps.length % 25 === 0) heap.push({ rows: step.rows, heapMb: await heapMb(cdp) });
  }
  const evidence = stop === 'no-load' ? await noLoadEvidence(page) : null;
  return { steps, heap, stop, evidence, wallMs: Date.now() - started };
}

async function appendToNewest(page: Page, corpus: PerfCorpusSpec) {
  const steps: PageStep[] = [];
  let stop: 'newest' | 'cap' | 'no-load' = 'cap';
  for (let index = 0; index < corpus.maxAppends; index++) {
    const step = await pageStep(page, 'newer', `PERF_A_${corpus.turns - 1}`);
    if (!step) {
      stop = 'newest';
      break;
    }
    if (!step.split) {
      stop = 'no-load';
      break;
    }
    steps.push(step);
  }
  return { steps, stop, evidence: stop === 'no-load' ? await noLoadEvidence(page) : null };
}

/** Programmatic fixed-speed scroll across the mounted transcript; rAF deltas + long tasks. */
function longScroll(page: Page) {
  return page.locator(SCROLLER).evaluate(
    async (element, { step, maxFrames }) => {
      const longTasks: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      observer.observe({ type: 'longtask', buffered: false });
      element.scrollTop = 0;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const range = element.scrollHeight - element.clientHeight;
      const frames = Math.min(maxFrames, Math.ceil(range / step));
      const deltas: number[] = [];
      let previous = performance.now();
      for (let frame = 1; frame <= frames; frame++) {
        element.scrollTop = frame * step;
        const time = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
        deltas.push(time - previous);
        previous = time;
      }
      observer.disconnect();
      return { scrollHeight: element.scrollHeight, distancePx: frames * step, deltas, longTasks };
    },
    { step: SCROLL_STEP_PX, maxFrames: MAX_SCROLL_FRAMES },
  );
}

async function locateOldest(
  page: Page,
): Promise<{ split: HistorySplitSample | null; rows: number }> {
  const seq = await lastSeq(page);
  await page.keyboard.press('Control+f');
  const search = page.getByTestId('transcript-search-bar');
  await search.getByRole('searchbox').fill('PERF_Q_0');
  await search.getByRole('combobox').selectOption('session');
  await search
    .getByTestId('sdk-history-search-result')
    .filter({ hasText: 'PERF_Q_0 ' })
    .first()
    .click();
  const split = await waitForLoad(page, seq, 'around');
  await expect(page.getByTestId('conversation-stream')).toContainText('PERF_Q_0 ', {
    timeout: PAGE_WAIT_MS,
  });
  // Keep the search bar open: closing it restores the newest window.
  await settle(page);
  return { split, rows: await mountedRows(page) };
}

/** Giant-turn costs: lazy body to its end marker, and frame cost of bringing the tool round in. */
async function giantTimings(page: Page, giantAt: number) {
  return page.locator(SCROLLER).evaluate(
    async (scroller, { giantAt }) => {
      const rows = () => [...scroller.querySelectorAll('[data-msg-id]')];
      const find = (marker: string) => rows().find((row) => row.textContent?.includes(marker));
      const frameRun = async (until: () => boolean, limitMs: number) => {
        const deltas: number[] = [];
        const started = performance.now();
        let previous = started;
        while (!until() && performance.now() - started < limitMs) {
          const time = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
          deltas.push(time - previous);
          previous = time;
        }
        return { ms: Math.round((performance.now() - started) * 10) / 10, done: until(), deltas };
      };
      const body = find(`PERF_A_${giantAt}`);
      body?.scrollIntoView({ block: 'start' });
      const bodyRun = await frameRun(
        () => body?.textContent?.includes('PERF_GIANT_BODY_END') ?? false,
        30_000,
      );
      const toolQuestion = find(`PERF_Q_${giantAt + 1} giant-tool`);
      toolQuestion?.scrollIntoView({ block: 'start' });
      let frames = 0;
      const toolRun = await frameRun(() => ++frames > 30, 30_000);
      const all = rows();
      const from = toolQuestion ? all.indexOf(toolQuestion) : -1;
      const to = all.findIndex((row) => row.textContent?.includes('PERF_GIANT_TOOL_END'));
      return {
        bodyChars: body?.textContent?.length ?? 0,
        bodyFound: Boolean(body),
        bodyToEndMarkerMs: bodyRun.ms,
        bodyEndMarkerRendered: bodyRun.done,
        bodyMaxFrameMs: Math.round(Math.max(0, ...bodyRun.deltas)),
        toolFound: Boolean(toolQuestion),
        toolMessageRows: from >= 0 && to >= 0 ? to - from : null,
        toolFirst30FramesMaxMs: Math.round(Math.max(0, ...toolRun.deltas)),
        toolFirst30FramesTotalMs: toolRun.ms,
      };
    },
    { giantAt },
  );
}

/** Direct `session.history` page walk: SDK reader + projection + structured clone, no React. */
function ipcProbe(page: Page, sessionId: string, surface: 'code' | 'partner') {
  return page.evaluate(
    async ({ sessionId, surface, limit }) => {
      const pages: { ms: number; bytes: number; items: number }[] = [];
      let previous: { nextCursor?: string; revision?: string; sourceRevision?: string } | undefined;
      for (let index = 0; index < limit; index++) {
        const started = performance.now();
        const result = await window.kodaxSpace!.invoke('session.history', {
          sessionId,
          requestId: crypto.randomUUID(),
          expectedSurface: surface,
          ...(previous?.nextCursor
            ? {
                cursor: previous.nextCursor,
                revision: previous.revision,
                sourceRevision: previous.sourceRevision,
              }
            : {}),
        });
        const ms = performance.now() - started;
        if (!result.ok || result.data.page?.outcome !== 'ready') break;
        pages.push({
          ms,
          bytes: JSON.stringify(result.data).length,
          items: result.data.productItems?.length ?? 0,
        });
        previous = result.data.page;
        if (!previous.nextCursor) break;
      }
      return pages;
    },
    { sessionId, surface, limit: IPC_PROBE_PAGES },
  );
}

interface DiagnosticLine {
  readonly timestamp: string;
  readonly component: string;
  readonly event: string;
  readonly data?: Record<string, number>;
}

async function readMainTimings(space: SpaceInstance, from: number, to: number) {
  const userData = await space.app.evaluate(({ app }) => app.getPath('userData'));
  const directory = path.join(userData, 'diagnostics');
  const lines: DiagnosticLine[] = [];
  for (const name of await readdir(directory)) {
    if (!/^space-main(\.\d+)?\.jsonl$/.test(name)) continue;
    for (const line of (await readFile(path.join(directory, name), 'utf8')).split('\n'))
      if (line.trim()) lines.push(JSON.parse(line) as DiagnosticLine);
  }
  const records = lines.filter((line) => {
    const time = Date.parse(line.timestamp);
    return line.component === 'session-history' && time >= from && time <= to;
  });
  const field = (event: string, key: string) =>
    summarize(
      records.filter((line) => line.event === event).map((line) => Number(line.data?.[key])),
    );
  return {
    handlerMs: field('handler', 'handlerMs'),
    viewMs: field('page_read', 'viewMs'),
    sdkReadMs: field('page_read', 'sdkReadMs'),
    projectMs: field('page_read', 'projectMs'),
    items: field('page_read', 'items'),
  };
}

function splitSummary(splits: readonly (HistorySplitSample | null)[]) {
  const present = splits.filter((split): split is HistorySplitSample => split !== null);
  const pick = (key: keyof HistorySplitSample) =>
    summarize(present.map((split) => Number(split[key])));
  return {
    loads: present.length,
    items: pick('items'),
    total: pick('total'),
    ipc: pick('ipc'),
    install: pick('install'),
    commit: pick('commit'),
    layout: pick('layout'),
    paint: pick('paint'),
  };
}

function stepSummary(steps: readonly PageStep[]) {
  const drift = steps.flatMap((step) => (step.driftPx === null ? [] : [Math.abs(step.driftPx)]));
  return {
    ...splitSummary(steps.map((step) => step.split)),
    absDriftPx: summarize(drift),
    nonZeroDrift: drift.filter((value) => value > 1).length,
    rowsAfter: steps.at(-1)?.rows ?? null,
  };
}

async function seedCorpus(root: string, corpus: PerfCorpusSpec) {
  const project = path.join(root, 'project');
  await mkdir(project, { recursive: true });
  const sessionsDir = path.join(root, 'sessions');
  const manager = createSessionManager({ sessionsDir, configHome: root });
  const messages = buildPerfCorpus(corpus);
  const started = performance.now();
  await manager.storage.save(corpus.id, {
    title: `PERF_${corpus.id}`,
    gitRoot: project,
    scope: 'user',
    runtimeInfo: { workspaceRoot: project, surface: 'repl' },
    ...(corpus.surface === 'partner' ? { tag: 'partner' } : {}),
    messages,
  });
  const writeMs = Math.round(performance.now() - started);
  let bytes = 0;
  for (const name of await readdir(sessionsDir, { recursive: true }))
    if (name.endsWith('.jsonl')) bytes += (await stat(path.join(sessionsDir, name))).size;
  return { messages: messages.length, writeMs, bytes };
}

async function environment(space: SpaceInstance) {
  const versions = await space.app.evaluate(() => ({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  }));
  return {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1_073_741_824),
    node: process.version,
    ...versions,
    window: '1280x900 content',
    packaged: process.env.SPACE_E2E_EXECUTABLE !== undefined,
  };
}

async function idleFrameMs(page: Page) {
  const deltas = await page.evaluate(async () => {
    const values: number[] = [];
    let previous = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    for (let frame = 0; frame < 60; frame++) {
      const time = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      values.push(time - previous);
      previous = time;
    }
    return values;
  });
  return summarize(deltas);
}

async function waitRuntimeReady(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const result = await window.kodaxSpace!.invoke('runtime.profileSnapshot', undefined);
          return result.ok ? result.data.connection.state : 'unavailable';
        }),
      { timeout: PAGE_WAIT_MS },
    )
    .toBe('ready');
}

async function openSession(space: SpaceInstance, corpus: PerfCorpusSpec, cdp: CDPSession) {
  const page = space.page;
  await waitRuntimeReady(page);
  if (corpus.surface === 'partner' && !(await page.getByTestId('partner-workspace').isVisible())) {
    await page.getByRole('button', { name: 'Partner', exact: true }).click();
    await expect(page.getByTestId('partner-workspace')).toBeVisible({ timeout: 10_000 });
  }
  await armClickTimer(page, `PERF_A_${corpus.turns - 1}`);
  await page
    .getByTestId('sidebar-session-row')
    .filter({ hasText: `PERF_${corpus.id}` })
    .click();
  const firstPaintMs = await clickTimerMs(page);
  await settle(page);
  return {
    firstPaintMs,
    rows: await mountedRows(page),
    heapMb: await heapMb(cdp),
    idleFrameMs: await idleFrameMs(page),
    splits: await readSplits(page, 0),
  };
}

async function jumpToBottom(page: Page, cdp: CDPSession, corpus: PerfCorpusSpec) {
  const rowsBefore = await mountedRows(page);
  await page.locator(SCROLLER).evaluate((element) => {
    element.scrollTop = 0;
  });
  await settle(page, 10);
  const button = page.getByRole('button', { name: 'Jump to bottom', exact: true });
  // Not offered when the mounted window already ends at the newest saved page.
  if ((await button.count()) === 0) return null;
  await armClickTimer(page, `PERF_A_${corpus.turns - 1}`);
  await button.click();
  const jumpMs = await clickTimerMs(page);
  await settle(page);
  return { jumpMs, rowsBefore, rowsAfter: await mountedRows(page), heapMb: await heapMb(cdp) };
}

async function browseFromNewest(page: Page, corpus: PerfCorpusSpec) {
  const seq = await lastSeq(page);
  await page
    .getByTestId('conversation-stream')
    .getByRole('button', { name: 'Browse history messages', exact: true })
    .click();
  await expect
    .poll(() => edgeRowsInclude(page, `PERF_A_${corpus.turns - 1}`, 'last'), {
      timeout: PAGE_WAIT_MS,
    })
    .toBe(true);
  await settle(page);
  return { rows: await mountedRows(page), splits: await readSplits(page, seq) };
}

/**
 * A cold-opened large Session can answer its first older page with "Saved history changed"
 * (a product finding, recorded as `staleFirstAttempt`). The user's recovery is "Return to
 * newest messages"; the baseline does the same once, then browses again.
 */
async function recoverStaleBrowse(page: Page, corpus: PerfCorpusSpec) {
  await page.getByRole('button', { name: 'Return to newest messages', exact: true }).click();
  await expect(page.getByTestId('history-paging-error')).toHaveCount(0, { timeout: PAGE_WAIT_MS });
  await settle(page);
  return browseFromNewest(page, corpus);
}

/** Browse saved history from the newest page and prepend every older page. */
async function prependPhase(page: Page, cdp: CDPSession, corpus: PerfCorpusSpec) {
  let browse = await browseFromNewest(page, corpus);
  let prepend = await prependToOldest(page, cdp);
  const staleFirstAttempt =
    prepend.stop === 'no-load' && prepend.evidence?.pagingError?.includes('changed')
      ? { loads: prepend.steps.length, evidence: prepend.evidence }
      : null;
  if (staleFirstAttempt) {
    browse = await recoverStaleBrowse(page, corpus);
    prepend = await prependToOldest(page, cdp);
  }
  const atMax = { rows: await mountedRows(page), heapMb: await heapMb(cdp) };
  const giant = corpus.giantBodyChars
    ? await giantTimings(page, Math.floor(corpus.turns / 2))
    : null;
  const scroll = await longScroll(page);
  return {
    browse,
    staleFirstAttempt,
    prepend: {
      stop: prepend.stop,
      evidence: prepend.evidence,
      wallMs: prepend.wallMs,
      heap: prepend.heap,
      ...stepSummary(prepend.steps),
    },
    atMax,
    giant,
    longScroll: {
      scrollHeight: scroll.scrollHeight,
      distancePx: scroll.distancePx,
      frameMs: summarize(scroll.deltas),
      framesOver50ms: scroll.deltas.filter((value) => value > 50).length,
      longTasks: scroll.longTasks.length,
      longTaskTotalMs: Math.round(scroll.longTasks.reduce((sum, value) => sum + value, 0)),
    },
    jumpFromMax: await jumpToBottom(page, cdp, corpus),
    rawSteps: prepend.steps,
  };
}

/** Fresh renderer, search-locate the oldest question, then append newer pages from there. */
async function appendPhase(space: SpaceInstance, cdp: CDPSession, corpus: PerfCorpusSpec) {
  await space.page.reload();
  await expect(space.page.getByTestId('composer-input')).toBeEditable({ timeout: 30_000 });
  const reopened = await openSession(space, corpus, cdp);
  const located = await locateOldest(space.page);
  const append = await appendToNewest(space.page, corpus);
  return {
    reopened,
    located,
    append: { stop: append.stop, evidence: append.evidence, ...stepSummary(append.steps) },
    jumpFromAppended: await jumpToBottom(space.page, cdp, corpus),
    rawSteps: append.steps,
  };
}

async function probePhase(space: SpaceInstance, corpus: PerfCorpusSpec) {
  const from = Date.now();
  const pages = await ipcProbe(space.page, corpus.id, corpus.surface);
  const to = Date.now();
  await space.page.waitForTimeout(500); // the structured logger appends asynchronously
  return {
    pages: pages.length,
    ms: summarize(pages.map((entry) => entry.ms)),
    kb: summarize(pages.map((entry) => entry.bytes / 1024)),
    items: summarize(pages.map((entry) => entry.items)),
    main: await readMainTimings(space, from, to),
  };
}

async function runCorpus(corpus: PerfCorpusSpec) {
  let seed: Awaited<ReturnType<typeof seedCorpus>> | undefined;
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(
    `perf-${corpus.id}-${Date.now()}`,
    provider.url,
    async (root) => {
      seed = await seedCorpus(root, corpus);
    },
  );
  const pageErrors: string[] = [];
  space.page.on('pageerror', (error) => pageErrors.push(error.message));
  const consoleProblems: string[] = [];
  space.page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()) && consoleProblems.length < 50)
      consoleProblems.push(`${message.type()}: ${message.text().slice(0, 400)}`);
  });
  try {
    const browserWindow = await space.app.browserWindow(space.page);
    await browserWindow.evaluate((window) => window.setContentSize(1280, 900));
    const cdp = await space.page.context().newCDPSession(space.page);
    const uiFrom = Date.now();
    const opened = await openSession(space, corpus, cdp);
    const { rawSteps: rawPrependSteps, ...older } = await prependPhase(space.page, cdp, corpus);
    const { rawSteps: rawAppendSteps, ...newer } = await appendPhase(space, cdp, corpus);
    const uiMain = await readMainTimings(space, uiFrom, Date.now());
    const result = {
      corpus,
      environment: await environment(space),
      seed,
      opened,
      ...older,
      ...newer,
      ipcProbe: await probePhase(space, corpus),
      uiMain,
      rawPrependSteps,
      rawAppendSteps,
      errors: pageErrors,
      consoleProblems,
      modelRequests: provider.requests.length,
    };
    await mkdir(RESULTS_DIR, { recursive: true });
    const body = JSON.stringify(result, null, 2);
    const name = `${corpus.id}${result.environment.packaged ? '-packaged' : ''}.json`;
    await writeFile(path.join(RESULTS_DIR, name), body);
    await test.info().attach(name, { body, contentType: 'application/json' });
    await cdp.detach();
    expect(pageErrors).toEqual([]);
    expect(provider.requests).toEqual([]);
    const mounted = [...rawPrependSteps, ...rawAppendSteps, older.atMax].map((step) => step.rows);
    expect(Math.max(...mounted)).toBeLessThanOrEqual(MAX_MOUNTED_ROWS);
  } finally {
    await space.close();
    await provider.close();
  }
}

for (const corpus of CORPORA) {
  test(`F144 baseline ${corpus.id}`, async () => {
    test.setTimeout(150 * 60_000);
    await runCorpus(corpus);
  });
}
