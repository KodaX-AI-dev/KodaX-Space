// F144 baseline: the opt-in perf spec on the same isolated e2e runner (never in the default suite).
// Extra Playwright arguments pass through, e.g. `npm run test:perf-baseline -- --grep coder-1k`.
process.env.SPACE_E2E_PERF_BASELINE = '1';
process.argv.splice(2, 0, 'tests/e2e/conversation-perf-baseline.spec.ts');
await import('./e2e-run.mjs');
