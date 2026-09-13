# Issue 213: Full RepoIntel routing latency

Baseline: Space `0.1.46-beta.1`, SDK `0.7.96-rc.3`. **Cold rebuild cost remains open.**
SDK `0.7.96-rc.4` fixes prewarm reuse by populating both the Full bundle and routing caches
from the same worker result. It does not eliminate the cold TypeScript rebuild measured below.

## Repeatable measurement

From the repository root, run this PowerShell command. It invokes the installed SDK against the
current repository and prints only mode, sample, and duration. It does not send a model request;
the SDK may populate its ordinary repository-index cache.

```powershell
@'
import { performance } from 'node:perf_hooks';
import { getRepoRoutingSignals } from '@kodax-ai/kodax/coding';
const mode = process.argv[2];
if (mode !== 'full' && mode !== 'light') throw new Error('Expected full or light');
const context = { executionCwd: process.cwd(), gitRoot: process.cwd() };
for (let sample = 1; sample <= 2; sample += 1) {
  const started = performance.now();
  await getRepoRoutingSignals(context, { mode });
  process.stdout.write(JSON.stringify({
    mode, sample, elapsedMs: Math.round(performance.now() - started),
  }) + '\n');
}
'@ | node --input-type=module - full
```

Repeat the command in a fresh Node process, then change the final argument to `light`. Record
repository revision, whether its worktree changed, SDK version, and concurrent workload. A fresh
process clears process-local reuse but does not guarantee a cold persistent index. Do not delete
the user's index or rewrite repository files just to force a cold result.

## Recorded evidence — 2026-09-13

- Fresh-process Full routing: 15,837ms and 9,143ms; immediate process-local repeat: approximately 0ms.
- Light routing: 984ms. Separate capability resolution: 181ms.
- Worker execution limited the measured parent event-loop delay to approximately 24ms.
- Forced worker rebuilds: 9,721ms / 9,675ms; CPU profiling identified TypeScript program/type
  analysis as the main cost. Once the persistent index stabilized, fresh-process routing took
  1,252ms. For forced-rebuild comparisons, use a disposable repository copy and the SDK's
  `refresh: true` option; do not confuse warm-cache results with rebuild timing.

These results concern routing preparation. They do not show that each new Session necessarily
rebuilds, or that routing caused the daemon history timeout reported in Issue 214.

## Candidate-fix acceptance

Measure unchanged, changed-worktree, fresh-process, and warm-index scenarios. If the SDK adopts
a wait budget for optional routing enrichment, show that admission can proceed within that
budget, the worker finishes and warms the cache, and later requests can consume the Full result.
Explicit operations requiring complete Full results must retain their correctness contract.
Choose and document a budget from measurements; the current installed SDK routing signature
does not expose a `maxWaitMs` option, and no such change is present in this Space patch.
The SDK already bounds preturn context enrichment to two seconds. The proposed investigation
concerns the preceding unbounded routing-signals wait, not a general downgrade of Full mode.
