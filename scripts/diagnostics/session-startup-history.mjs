// Run in a separate Node process. Default asserts the installed SDK fix; an optional first
// argument selects another sdk-runtime entry. --expect=regression asserts historical-log reads.
// Real event files are mapped only into read operations; all Runtime writes stay in a temp home.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const regression = args.includes('--expect=regression');
const sdkPath = args.find((arg) => !arg.startsWith('--'));
const sdkUrl = sdkPath
  ? pathToFileURL(path.resolve(sdkPath)).href
  : import.meta.resolve('@kodax-ai/kodax/runtime');
const actualRuns = path.join(os.homedir(), '.kodax', 'runtime', 'profiles', 'coder', 'runs');
const runNames = new Set(
  fs
    .readdirSync(actualRuns, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
);
assert(runNames.size > 0, 'This diagnostic requires an existing Coder event history');
const tempRoot = path.resolve(os.tmpdir());
const fixture = await fsp.mkdtemp(path.join(tempRoot, 'kodax-sequence-bench-'));
const fixtureHome = path.join(fixture, '.kodax');
const fixtureRuns = path.join(fixtureHome, 'runtime', 'runs');
const sessionsDir = path.join(fixtureHome, 'sessions');
const names = [
  'existsSync',
  'statSync',
  'openSync',
  'readSync',
  'readFileSync',
  'readdirSync',
  'closeSync',
  'renameSync',
];
const original = Object.fromEntries(names.map((name) => [name, fs[name]]));
const eventFds = new Set();
const counts = { eventReadCalls: 0, eventReadBytes: 0, eventReadMs: 0 };
let listingEnabled = true;
let startConcurrentRead;
let runtime;
const previousHome = process.env.KODAX_HOME;
const report = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

function mappedRead(input) {
  if (typeof input !== 'string') return input;
  const parts = path.relative(fixtureRuns, input).split(path.sep);
  return parts.length === 2 && runNames.has(parts[0]) && parts[1] === 'events.jsonl'
    ? path.join(actualRuns, parts[0], parts[1])
    : input;
}

function readMapped(name, args) {
  // Never map mutations (including rename sources) into the user's files.
  const mapped = ['existsSync', 'statSync', 'openSync', 'readFileSync'].includes(name)
    ? mappedRead(args[0])
    : args[0];
  const isEvent = mapped !== args[0];
  if (name === 'openSync' && isEvent) assert.equal(args[1], 'r', 'Real event files are read-only');
  const started = performance.now();
  const result = original[name](mapped, ...args.slice(1));
  if (name === 'openSync' && isEvent) eventFds.add(result);
  if ((name === 'readSync' && eventFds.has(args[0])) || (name === 'readFileSync' && isEvent)) {
    counts.eventReadCalls += 1;
    counts.eventReadBytes += name === 'readSync' ? result : Buffer.byteLength(result);
    counts.eventReadMs += performance.now() - started;
  }
  return result;
}

function intercept(name, args) {
  if (name === 'readdirSync' && listingEnabled && args[0] === fixtureRuns) {
    return original.readdirSync(actualRuns, ...args.slice(1));
  }
  if (
    name === 'renameSync' &&
    typeof args[1] === 'string' &&
    args[1].startsWith(`${fixtureHome}${path.sep}`) &&
    args[1].endsWith(`${path.sep}journal.json`)
  ) {
    const result = original.renameSync(...args);
    startConcurrentRead?.();
    return result;
  }
  if (name === 'closeSync') eventFds.delete(args[0]);
  return readMapped(name, args);
}

async function observeFreshSession() {
  Object.assign(counts, { eventReadCalls: 0, eventReadBytes: 0, eventReadMs: 0 });
  const started = performance.now();
  const observation = await runtime.sessions.observe('diagnose_new', () => undefined);
  observation.close();
  report({
    stage: 'observed',
    elapsedMs: Math.round(performance.now() - started),
    ...counts,
    eventReadMs: Math.round(counts.eventReadMs),
  });
}

async function measureStartup(createSessionManager) {
  const storage = createSessionManager({ sessionsDir, configHome: fixtureHome }).storage;
  let historyProbe;
  startConcurrentRead = () => {
    startConcurrentRead = undefined;
    const started = performance.now();
    historyProbe = storage.read('diagnose_missing_during_create', { timeoutMs: 15000 }).then(
      (result) => ({
        outcome: result === null ? 'missing' : 'found',
        elapsedMs: Math.round(performance.now() - started),
      }),
      (error) => ({
        outcome: error.code,
        message: error.message,
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
  };
  const started = performance.now();
  const cpu = process.cpuUsage();
  await runtime.sessions.create({
    sessionId: 'diagnose_new',
    projectPath: fixture,
    gitRoot: fixture,
    surface: 'space-desktop',
    tag: 'code',
  });
  const used = process.cpuUsage(cpu);
  const creationReads = counts.eventReadCalls;
  report({
    stage: 'created',
    elapsedMs: Math.round(performance.now() - started),
    cpuMs: Math.round((used.user + used.system) / 1000),
    ...counts,
    eventReadMs: Math.round(counts.eventReadMs),
  });
  assert(historyProbe, 'The SDK must reach the journal-commit concurrent-read boundary');
  const history = await historyProbe;
  report({ stage: 'concurrent-history', ...history });
  await observeFreshSession();
  if (regression) assert(creationReads > 0, 'Expected the old full-history scan');
  else {
    assert.equal(creationReads, 0, 'A new journal must not scan unrelated historical events');
    assert.equal(counts.eventReadCalls, 0, 'Observing the fresh Session must not scan old logs');
    assert.equal(history.outcome, 'missing', 'Concurrent strict history must complete normally');
  }
}

try {
  for (const name of names) fs[name] = (...callArgs) => intercept(name, callArgs);
  syncBuiltinESMExports();
  process.env.KODAX_HOME = fixtureHome;
  const { createKodaXRuntime } = await import(sdkUrl);
  const { createSessionManager } = await import('@kodax-ai/kodax/session');
  runtime = await createKodaXRuntime({
    homeDir: fixture,
    profile: 'history-diagnostic',
    sessionsDir,
    isolation: 'inline',
  });
  await fsp.mkdir(fixtureRuns, { recursive: true });
  report({ stage: 'initialized', indexedRuns: runNames.size });
  await measureStartup(createSessionManager);
} finally {
  listingEnabled = false;
  try {
    await runtime?.close();
  } finally {
    for (const [name, method] of Object.entries(original)) fs[name] = method;
    syncBuiltinESMExports();
    if (previousHome === undefined) delete process.env.KODAX_HOME;
    else process.env.KODAX_HOME = previousHome;
    assert(
      path.dirname(fixture) === tempRoot &&
        path.basename(fixture).startsWith('kodax-sequence-bench-'),
    );
    await fsp.rm(fixture, { recursive: true, force: true });
  }
}
