import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function requiresTests(files) {
  return files.length === 0 || files.some((file) => !/^docs\/research\/.+\.(md|json)$/.test(file));
}

export function assertGate(needs) {
  if (needs.changes?.result !== 'success') throw new Error('Changes gate did not succeed');
  const docsOnly = needs.changes.outputs?.run_tests === 'false';
  for (const [name, job] of Object.entries(needs)) {
    if (job.result !== 'success' && !(docsOnly && job.result === 'skipped')) {
      throw new Error(`${name} gate did not succeed: ${job.result}`);
    }
  }
}

function changedFiles(event, head) {
  const base = event.pull_request?.base.sha || event.before;
  if (![base, head].every((sha) => /^[a-f0-9]{40}$/.test(sha || '') && !/^0+$/.test(sha)))
    return [];
  const baseCheck = spawnSync('git', ['cat-file', '-e', `${base}^{commit}`], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (baseCheck.error) throw baseCheck.error;
  if (baseCheck.status !== 0) {
    process.stderr.write(`Base ${base} unavailable; running full source checks.\n`);
    return [];
  }
  // Disable rename detection so both old and new paths count. NUL delimiters
  // keep unusual Git filenames from being misclassified as documentation.
  return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'gate') assertGate(JSON.parse(process.env.NEEDS_JSON));
  else {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const manual = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
    const runTests = manual || requiresTests(changedFiles(event, process.env.GITHUB_SHA));
    appendFileSync(process.env.GITHUB_OUTPUT, `run_tests=${runTests}\n`);
  }
}
