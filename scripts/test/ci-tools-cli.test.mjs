import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { SOURCE_JOBS } from '../ci-source-gate.mjs';

const execute = promisify(execFile);
const scripts = fileURLToPath(new URL('../', import.meta.url));
const sha = 'a'.repeat(40);
const environment = {
  ...process.env,
  GITHUB_REPOSITORY: 'example/space',
  GITHUB_SHA: sha,
  GITHUB_REF: 'refs/tags/v1.0.0',
  GITHUB_RUN_ID: '10',
  GITHUB_TOKEN: 'fixture-token',
};

async function directory(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'space-ci-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function run(root, script, args = [], env = {}) {
  return execute(process.execPath, [path.join(scripts, script), ...args], {
    cwd: root,
    env: { ...environment, ...env },
    timeout: 15_000,
    windowsHide: true,
  });
}

test('changes CLI uses actual Git paths and manual dispatch always requests full coverage', async (t) => {
  const root = await directory(t);
  const git = (args) => execute('git', args, { cwd: root, windowsHide: true });
  await git(['init']);
  await git(['config', 'user.name', 'CI Fixture']);
  await git(['config', 'user.email', 'ci@example.invalid']);
  await mkdir(path.join(root, 'docs/research'), { recursive: true });
  await writeFile(path.join(root, 'docs/research/note.md'), 'before');
  await git(['add', '.']);
  await git(['commit', '-m', 'before']);
  const before = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  await writeFile(path.join(root, 'docs/research/note.md'), 'after');
  await git(['commit', '-am', 'after']);
  const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const event = path.join(root, 'event.json');
  const output = path.join(root, 'output');
  await writeFile(event, JSON.stringify({ before }));
  const env = {
    GITHUB_EVENT_PATH: event,
    GITHUB_OUTPUT: output,
    GITHUB_SHA: head,
    GITHUB_EVENT_NAME: 'push',
  };
  await run(root, 'ci-changes.mjs', [], env);
  assert.equal(await readFile(output, 'utf8'), 'run_tests=false\n');
  await run(root, 'ci-changes.mjs', [], { ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' });
  assert.match(await readFile(output, 'utf8'), /run_tests=true/);
  await writeFile(event, JSON.stringify({ before: 'b'.repeat(40) }));
  const unknownBase = await run(root, 'ci-changes.mjs', [], env);
  assert.match(unknownBase.stderr, /base.*unavailable/i);
  assert.ok((await readFile(output, 'utf8')).endsWith('run_tests=true\n'));
  await run(root, 'ci-changes.mjs', ['gate'], {
    NEEDS_JSON: JSON.stringify({ changes: { result: 'success' }, test: { result: 'success' } }),
  });
  await assert.rejects(
    run(root, 'ci-changes.mjs', ['gate'], {
      NEEDS_JSON: JSON.stringify({ changes: { result: 'failure' } }),
    }),
    /gate/,
  );
});

test('report CLI preserves flaky metrics and emits a readable Actions summary', async (t) => {
  const root = await directory(t);
  const report = path.join(root, 'report.json');
  const summary = path.join(root, 'summary.md');
  await writeFile(report, JSON.stringify({ suites: [] }));
  await run(root, 'ci-report.mjs', [report], { GITHUB_STEP_SUMMARY: summary });
  assert.equal(JSON.parse(await readFile(`${report}.summary.json`, 'utf8')).sha, sha);
  assert.match(await readFile(summary, 'utf8'), /First-attempt pass rate: n\/a/);
  const missing = await run(root, 'ci-report.mjs', ['absent.json']);
  assert.match(missing.stderr, /not produced/);
});

test('candidate CLI verifies four accepted platforms and rejects missing receipts', async (t) => {
  const root = await directory(t);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  for (const platform of ['windows-latest', 'macos-15-intel', 'macos-latest', 'ubuntu-latest']) {
    const built = path.join(root, `installer-${platform}`);
    const accepted = path.join(root, `accepted-${platform}`);
    await mkdir(built);
    await mkdir(accepted);
    await writeFile(path.join(built, 'app.tgz'), 'archive');
    await writeFile(path.join(built, 'setup.exe'), 'installer');
    await run(root, 'release-candidate.mjs', ['record', built, platform]);
    await run(root, 'release-candidate.mjs', ['verify', built, platform]);
    await copyFile(path.join(built, 'candidate.json'), path.join(accepted, 'candidate.json'));
  }
  await run(root, 'release-candidate.mjs', ['publish', root]);
  await rm(path.join(root, 'accepted-windows-latest/candidate.json'));
  await assert.rejects(run(root, 'release-candidate.mjs', ['publish', root]), /ENOENT/);
});

test('source CLI qualifies and revalidates real HTTP responses without exposing credentials', async (t) => {
  const root = await directory(t);
  let httpFailure = false;
  const runs = Object.keys(SOURCE_JOBS).map((workflow, i) => ({
    id: i + 1,
    path: `.github/workflows/${workflow}`,
    head_sha: sha,
    head_repository: { full_name: 'example/space' },
    event: 'push',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
  }));
  const server = createServer((req, res) => {
    if (httpFailure) {
      res.writeHead(503).end();
      return;
    }
    assert.equal(req.headers.authorization, 'Bearer fixture-token');
    const run = runs.find(
      (item) =>
        req.url.includes(item.path.split('/').at(-1)) || req.url.includes(`/runs/${item.id}`),
    );
    const workflow = run.path.split('/').at(-1);
    const jobs = SOURCE_JOBS[workflow].map((name) => ({ name, conclusion: 'success' }));
    const body = req.url.includes('/jobs')
      ? { total_count: jobs.length, jobs }
      : req.url.includes('/workflows/')
        ? { workflow_runs: [run] }
        : run;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const env = { GITHUB_API_URL: `http://127.0.0.1:${server.address().port}` };
  await run(root, 'ci-source-gate.mjs', ['qualify'], env);
  await run(root, 'ci-source-gate.mjs', ['verify'], env);
  httpFailure = true;
  await assert.rejects(run(root, 'ci-source-gate.mjs', ['verify'], env), /GitHub API 503/);
  await assert.rejects(
    run(root, 'ci-source-gate.mjs', ['verify'], { ...env, GITHUB_SHA: '' }),
    /exact SHA/,
  );
});
