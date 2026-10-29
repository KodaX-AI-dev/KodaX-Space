import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const SOURCE_JOBS = {
  'ci.yml': [
    'windows-latest / E2E shard 1/2',
    'windows-latest / E2E shard 2/2',
    'ubuntu-latest / E2E shard 1/2',
    'ubuntu-latest / E2E shard 2/2',
    'CI gate',
  ],
  'build.yml': [
    'Smoke build (windows-latest)',
    'Smoke build (macos-latest)',
    'Smoke build (macos-15-intel)',
    'Smoke build (ubuntu-latest)',
    'Static checks',
    'Build gate',
  ],
};

function matchesSource(run, workflow, repository, sha) {
  return (
    run.head_sha === sha &&
    run.head_repository?.full_name === repository &&
    run.path === `.github/workflows/${workflow}` &&
    (run.event === 'workflow_dispatch' || (run.event === 'push' && run.head_branch === 'main'))
  );
}

async function completedJobs(request, repository, run) {
  const jobs = [];
  for (let page = 1; ; page++) {
    const result = await request(
      `/repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100&page=${page}`,
    );
    jobs.push(...result.jobs);
    if (jobs.length >= result.total_count) return jobs;
    if (result.jobs.length === 0) throw new Error('Incomplete source job response');
  }
}

async function hasRequiredJobs(request, repository, workflow, run) {
  const jobs = await completedJobs(request, repository, run);
  return SOURCE_JOBS[workflow].every((name) =>
    jobs.some((job) => job.name === name && job.conclusion === 'success'),
  );
}

async function qualifyWorkflow(
  { repository, sha, ref, request, wait = delay, maxPolls = 120 },
  workflow,
) {
  let dispatched = false;
  for (let poll = 0; poll < maxPolls; poll++) {
    const result = await request(
      `/repos/${repository}/actions/workflows/${workflow}/runs?head_sha=${sha}&per_page=100`,
    );
    const run = result.workflow_runs
      .filter((item) => matchesSource(item, workflow, repository, sha))
      .sort((a, b) => b.id - a.id)[0];
    let needsFullRun = !run;
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success')
        throw new Error(
          `${workflow} failed: ${run.conclusion}; rerun the failed checks explicitly`,
        );
      needsFullRun = !(await hasRequiredJobs(request, repository, workflow, run));
      if (!needsFullRun) return { workflow, id: run.id, attempt: run.run_attempt };
    }
    if (needsFullRun && !dispatched) {
      // Manual dispatch bypasses the documentation shortcut. Never rerun a failed
      // suite automatically or accept another SHA if this ref moves meanwhile.
      if (!ref) throw new Error('A candidate ref is required to dispatch source checks');
      await request(`/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref }),
      });
      dispatched = true;
    }
    if (poll + 1 < maxPolls) await wait(30_000);
  }
  throw new Error(`${workflow} timed out waiting for complete source coverage at ${sha}`);
}

export async function qualifySource(options) {
  const runs = await Promise.all(
    Object.keys(SOURCE_JOBS).map((workflow) => qualifyWorkflow(options, workflow)),
  );
  return { repository: options.repository, sha: options.sha, runs };
}

export async function verifySourceEvidence({ evidence, repository, sha, request }) {
  if (evidence.repository !== repository || evidence.sha !== sha)
    throw new Error('Source evidence identity / SHA mismatch');
  if (evidence.runs?.length !== Object.keys(SOURCE_JOBS).length)
    throw new Error('Incomplete source evidence');
  for (const workflow of Object.keys(SOURCE_JOBS)) {
    const proof = evidence.runs.find((item) => item.workflow === workflow);
    if (!proof) throw new Error(`Missing ${workflow} evidence`);
    const run = await request(`/repos/${repository}/actions/runs/${proof.id}`);
    if (!matchesSource(run, workflow, repository, sha))
      throw new Error('Unexpected source run identity');
    if (run.run_attempt !== proof.attempt)
      throw new Error('Source run attempt changed; requalify the candidate');
    if (
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      !(await hasRequiredJobs(request, repository, workflow, run))
    )
      throw new Error('Source gate no longer passes');
  }
}

async function githubRequest(route, options = {}) {
  const response = await fetch(
    `${process.env.GITHUB_API_URL || 'https://api.github.com'}${route}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${route}`);
  return response.status === 204 ? undefined : response.json();
}

async function main() {
  const [mode, evidencePath = 'source-checks.json'] = process.argv.slice(2);
  const options = {
    repository: process.env.GITHUB_REPOSITORY,
    sha: process.env.GITHUB_SHA,
    ref: process.env.GITHUB_REF,
    request: githubRequest,
    wait: delay,
  };
  if (
    !options.repository ||
    !/^[a-f0-9]{40}$/.test(options.sha || '') ||
    !process.env.GITHUB_TOKEN
  ) {
    throw new Error('GitHub repository, exact SHA and token are required');
  }
  if (mode === 'verify') {
    await verifySourceEvidence({
      ...options,
      evidence: JSON.parse(await readFile(evidencePath, 'utf8')),
    });
  } else if (mode === 'qualify') {
    await writeFile(evidencePath, `${JSON.stringify(await qualifySource(options), null, 2)}\n`);
  } else throw new Error('Usage: ci-source-gate.mjs qualify|verify [evidence.json]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
