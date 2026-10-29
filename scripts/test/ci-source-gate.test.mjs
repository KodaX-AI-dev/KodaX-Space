import assert from 'node:assert/strict';
import { test } from 'node:test';
import { qualifySource, verifySourceEvidence, SOURCE_JOBS } from '../ci-source-gate.mjs';

const repository = 'example/space';
const sha = 'a'.repeat(40);
const ref = 'refs/tags/v1.0.0';

function fixture(overrides = {}) {
  const calls = [];
  const runs = Object.keys(SOURCE_JOBS).map((workflow, i) => ({
    id: i + 1,
    path: `.github/workflows/${workflow}`,
    head_sha: sha,
    head_repository: { full_name: repository },
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    ...overrides,
  }));
  const request = async (route, options = {}) => {
    calls.push({ route, options });
    if (route.includes('/workflows/')) {
      return { workflow_runs: runs.filter((run) => route.includes(run.path.split('/').at(-1))) };
    }
    const run = runs.find((item) => route.includes(`/runs/${item.id}`));
    if (route.includes('/jobs')) {
      const workflow = run.path.split('/').at(-1);
      return {
        total_count: SOURCE_JOBS[workflow].length,
        jobs: SOURCE_JOBS[workflow].map((name) => ({ name, conclusion: 'success' })),
      };
    }
    return run;
  };
  return { calls, runs, request };
}

test('qualifies exactly this source SHA using both workflows and all platform jobs', async () => {
  const { request, calls } = fixture();
  const evidence = await qualifySource({ repository, sha, ref, request });
  assert.equal(evidence.sha, sha);
  assert.deepEqual(
    evidence.runs.map((run) => run.id),
    [1, 2],
  );
  assert.equal(
    calls.some((call) => call.options.method === 'POST'),
    false,
  );
  await verifySourceEvidence({ evidence, repository, sha, request });
});

test('a failed source run blocks publication without rerunning it until green', async () => {
  const { request, calls } = fixture({ conclusion: 'failure' });
  await assert.rejects(qualifySource({ repository, sha, ref, request }), /failed|failure/);
  assert.equal(
    calls.some((call) => call.options.method === 'POST'),
    false,
  );
});

test('publication rejects evidence for a different SHA or repository', async () => {
  const { request } = fixture();
  const evidence = await qualifySource({ repository, sha, ref, request });
  await assert.rejects(
    verifySourceEvidence({ evidence, repository, sha: 'b'.repeat(40), request }),
    /identity|SHA/,
  );
  await assert.rejects(
    verifySourceEvidence({ evidence, repository: 'other/repo', sha, request }),
    /identity|repository/,
  );
});

test('publication rechecks run attempt, source identity, and Intel coverage', async () => {
  const { request, runs } = fixture();
  const evidence = await qualifySource({ repository, sha, ref, request });
  runs[0].run_attempt = 2;
  await assert.rejects(verifySourceEvidence({ evidence, repository, sha, request }), /attempt/);
  runs[0].run_attempt = 1;
  runs[0].head_repository.full_name = 'fork/space';
  await assert.rejects(
    verifySourceEvidence({ evidence, repository, sha, request }),
    /source|identity/,
  );
});

test('waits for an in-progress check without duplicating it', async () => {
  const { request, runs, calls } = fixture({ status: 'in_progress', conclusion: null });
  const wait = async () => {
    for (const run of runs) Object.assign(run, { status: 'completed', conclusion: 'success' });
  };
  await qualifySource({ repository, sha, ref, request, wait });
  assert.equal(
    calls.some((call) => call.options.method === 'POST'),
    false,
  );
});

test('dispatches full checks once when only another SHA or a documentation skip exists', async () => {
  const base = fixture();
  let dispatched = false;
  let ciPolls = 0;
  const request = async (route, options) => {
    if (route.endsWith('/dispatches')) {
      assert.equal(dispatched, false);
      assert.deepEqual(JSON.parse(options.body), { ref });
      dispatched = true;
      return;
    }
    if (route.includes('/workflows/ci.yml/runs')) {
      ciPolls++;
      return {
        workflow_runs:
          ciPolls < 3 ? [{ ...base.runs[0], head_sha: 'b'.repeat(40) }] : [base.runs[0]],
      };
    }
    return base.request(route, options);
  };
  await qualifySource({ repository, sha, ref, request, wait: async () => {}, maxPolls: 5 });
  assert.equal(dispatched, true);
});

test('a green workflow with skipped Intel checks is not sufficient release evidence', async () => {
  const base = fixture();
  let dispatched = 0;
  const request = async (route, options) => {
    if (route.endsWith('/dispatches')) {
      dispatched++;
      return;
    }
    const result = await base.request(route, options);
    if (route.includes('/runs/2/jobs'))
      result.jobs.find((job) => job.name.includes('intel')).conclusion = 'skipped';
    return result;
  };
  await assert.rejects(
    qualifySource({ repository, sha, ref, request, wait: async () => {}, maxPolls: 2 }),
    /timed out|coverage/,
  );
  assert.equal(dispatched, 1);
});

test('missing or stuck source checks time out instead of allowing a release', async () => {
  const { request } = fixture({ status: 'queued', conclusion: null });
  await assert.rejects(
    qualifySource({ repository, sha, ref, request, wait: async () => {}, maxPolls: 2 }),
    /timed out/,
  );
});
