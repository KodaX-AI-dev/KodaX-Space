import { expect, test, type Locator } from '@playwright/test';
import {
  createLocalSdkProvider,
  currentSdkSession,
  launchRealSdkSpace,
  sendSdkPrompt,
  waitSdkIdle,
} from './sdk-provider-fixture.js';

test.setTimeout(150_000);

const PROMPT = 'LIVE_RENDER_CHAIN';

async function tallies(cluster: Locator): Promise<string[]> {
  return cluster
    .getByTestId('tool-cluster-tallies')
    .locator('[data-family]')
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          `${node.getAttribute('data-family')} ${node.querySelector('b')?.textContent}` +
          (node.classList.contains('is-running') ? ' running' : ''),
      ),
    );
}

test('a follow-up streams thinking, tools and the answer without losing or doubling its query', async () => {
  const provider = await createLocalSdkProvider();
  const { space } = await launchRealSdkSpace(`render-chain-${Date.now()}`, provider.url);
  const { page } = space;
  const shot = (name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  try {
    await sendSdkPrompt(space, 'WARMUP');
    await expect(page.getByText('SDK_REPLY:WARMUP')).toBeVisible({ timeout: 20_000 });
    const sessionId = await currentSdkSession(space);
    await waitSdkIdle(space, sessionId);

    // Sample every DOM change and frame: once the query bubble shows, it must never vanish or double.
    await page.evaluate((prompt) => {
      const state = {
        seen: false,
        shown: false,
        gaps: 0,
        dupes: 0,
        dims: 0,
        misplaced: 0,
        samples: 0,
      };
      const sample = () => {
        const bubbles = [
          ...document.querySelectorAll('[data-testid="user-message-bubble"]'),
        ].filter((node) => node.textContent?.includes(prompt));
        state.samples++;
        if (bubbles.length > 0) state.seen = true;
        else if (state.seen) state.gaps++;
        if (bubbles.length > 1) state.dupes++;
        const bubble = bubbles[0];
        if (!bubble) return;
        // The bubble must not fade back in once fully shown (a remount replays its reveal).
        const body = bubble.closest('.conversation-message-body') ?? bubble;
        const opacity = Number(getComputedStyle(body).opacity);
        if (opacity >= 0.99) state.shown = true;
        else if (state.shown && opacity < 0.9) state.dims++;
        // The WARMUP turn has no thinking, so any thinking receipt above the query is misplaced.
        const thinking = document.querySelector('[data-testid="process-receipt-thinking"]');
        if (thinking && bubble.compareDocumentPosition(thinking) & Node.DOCUMENT_POSITION_PRECEDING)
          state.misplaced++;
      };
      new MutationObserver(sample).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      const frame = () => {
        sample();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      Object.assign(window, { __renderChain: state });
    }, PROMPT);

    await sendSdkPrompt(space, PROMPT);
    const stream = page.getByTestId('conversation-stream');
    await stream
      .getByTestId('process-receipt-thinking')
      .locator('.tool-pulse-think.is-on')
      .getByText('planning which files to read')
      .waitFor({ timeout: 20_000 });
    await shot('1-thinking-live');

    provider.release('LIVE_TOOLS');
    const cluster = stream.getByTestId('process-receipt-tool_cluster').last();
    await cluster
      .locator('.tool-pulse-think.is-on')
      .getByText('the check failed, writing the answer')
      .waitFor({ timeout: 20_000 });
    await expect
      .configure({ soft: true })
      .poll(() => tallies(cluster))
      .toEqual(['read 2', 'run 1', 'fail 1']);
    await expect(cluster.getByTestId('tool-cluster-live-stats')).toBeVisible();
    await shot('2-tools-live');

    provider.release('LIVE_ANSWER');
    await expect(stream.getByText('LIVE_CHAIN_ANSWER')).toBeVisible({ timeout: 20_000 });
    await waitSdkIdle(space, sessionId);
    await expect(cluster.getByTestId('tool-cluster-live-stats')).toHaveCount(0);
    expect.soft(await tallies(cluster)).toEqual(['read 2', 'run 1', 'fail 1']);
    await expect(stream.getByTestId('process-receipt-tool_cluster')).toHaveCount(1);
    await shot('3-settled');

    const chain = await page.evaluate(
      () => (window as unknown as { __renderChain: Record<string, number> }).__renderChain,
    );
    expect(chain.samples).toBeGreaterThan(10);
    expect(chain).toMatchObject({ seen: true, gaps: 0, dupes: 0, dims: 0, misplaced: 0 });
    expect(provider.errors).toEqual([]);
  } finally {
    await provider.close();
    await space.close();
  }
});
