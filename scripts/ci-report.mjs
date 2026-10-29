import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function testsIn(suites, parentFile = '') {
  return suites.flatMap((suite) => {
    const file = suite.file || parentFile;
    return [
      ...(suite.specs || []).flatMap((spec) =>
        spec.tests.map((test) => ({
          title: spec.title,
          file,
          status: test.status,
          results: test.results,
        })),
      ),
      ...testsIn(suite.suites || [], file),
    ];
  });
}

export function summarizeTests(report) {
  const tests = testsIn(report.suites || []);
  const executed = tests.filter((test) => test.status !== 'skipped');
  const slowest = executed
    .map((test) => ({
      title: test.title,
      file: test.file,
      durationMs: test.results.reduce((sum, result) => sum + result.duration, 0),
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
  const sorted = slowest.map((item) => item.durationMs).sort((a, b) => a - b);
  const quantile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return {
    total: tests.length,
    failed: tests.filter((test) => test.status === 'unexpected').length,
    flaky: tests.filter((test) => test.status === 'flaky').length,
    skipped: tests.length - executed.length,
    firstPassRate: executed.length
      ? executed.filter((test) => test.status === 'expected' && test.results.length === 1).length /
        executed.length
      : null,
    p50Ms: quantile(0.5),
    p95Ms: quantile(0.95),
    slowest: slowest.slice(0, 10),
  };
}

async function main() {
  const reportPath = process.argv[2] || 'test-results/playwright.json';
  if (!existsSync(reportPath)) {
    process.stderr.write(`Playwright report was not produced: ${reportPath}\n`);
    return;
  }
  const summary = {
    sha: process.env.GITHUB_SHA,
    platform: process.env.RUNNER_OS,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    ...summarizeTests(JSON.parse(await readFile(reportPath, 'utf8'))),
  };
  await writeFile(`${reportPath}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rate =
      summary.firstPassRate === null ? 'n/a' : `${(summary.firstPassRate * 100).toFixed(1)}%`;
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `### E2E results\n\nFirst-attempt pass rate: ${rate}; flaky: ${summary.flaky}; failed: ${summary.failed}; skipped: ${summary.skipped}.\n\nTest duration including retries: p50 ${summary.p50Ms}ms, p95 ${summary.p95Ms}ms. Full metrics and slowest tests are in the evidence artifact.\n`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
