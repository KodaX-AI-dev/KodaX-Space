// Test-only transport faults inherited by Main and the real SDK daemon.
// Production has no test switches for bypassing ownership verification.
const fs = require('node:fs');
const net = require('node:net');
const childProcess = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
const local = (host) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const event = (kind) =>
  fs.appendFileSync(
    process.env.SPACE_TEST_JOB_EVENTS,
    JSON.stringify({ kind, pid: process.pid, time: Date.now() }) + '\n',
  );
if (
  process.env.KODAX_INTERNAL_WINDOWS_JOB_SCRIPT_FILE &&
  fs.readFileSync(process.env.SPACE_TEST_JOB_FAULT, 'utf8').trim() === 'cleanup'
) {
  try {
    fs.writeFileSync(process.env.SPACE_TEST_JOB_FAULT + '.held', '', { flag: 'wx' });
    const exit = process.exit.bind(process);
    let delayed = false;
    process.exit = (code) => {
      if (!delayed) {
        delayed = true;
        event('cleanup-delayed');
        process.send?.({ kind: 'fixture-target-exit' });
        setTimeout(() => {
          event('supervisor-exiting');
          exit(code);
        }, 4_000);
      }
    };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const target = normalized[0];
  const pipe =
    (typeof target === 'string' && !/^\d+$/.test(target)) ||
    (target && typeof target === 'object' && typeof target.path === 'string');
  const host =
    target && typeof target === 'object'
      ? (target.host ?? 'localhost')
      : typeof normalized[1] === 'string'
        ? normalized[1]
        : 'localhost';
  if (!pipe && !local(host)) {
    event('blocked-socket:' + host);
    throw Object.assign(new Error('Fixture has no public network'), { code: 'ENETUNREACH' });
  }
  return connect.apply(this, args);
};
const fetch = globalThis.fetch;
if (fetch)
  globalThis.fetch = (input, ...args) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (['http:', 'https:'].includes(url.protocol) && !local(url.hostname)) {
      event('blocked-fetch:' + url.hostname);
      return Promise.reject(
        Object.assign(new Error('Fixture has no public network'), { code: 'ENETUNREACH' }),
      );
    }
    return fetch(input, ...args);
  };
const spawnSync = childProcess.spawnSync;
const spawn = childProcess.spawn;
childProcess.spawn = function (file, args, options) {
  if (options?.env?.KODAX_INTERNAL_WINDOWS_JOB_SCRIPT_FILE) {
    // Electron's Node mode does not honor NODE_OPTIONS --require. Inject at the
    // test-owned launch boundary for both the supervisor and its contained target.
    const payload = JSON.parse(
      Buffer.from(options.env.KODAX_INTERNAL_WINDOWS_JOB_LAUNCH, 'base64').toString('utf8'),
    );
    payload.commandLine = payload.commandLine.replace(
      /^("[^"]+"|\S+)/,
      `$1 --require "${__filename}"`,
    );
    options = {
      ...options,
      env: {
        ...options.env,
        KODAX_INTERNAL_WINDOWS_JOB_LAUNCH: Buffer.from(JSON.stringify(payload)).toString('base64'),
      },
    };
    args = ['--require', __filename, ...args];
  }
  const child = spawn(file, args, options);
  if (options?.env?.KODAX_INTERNAL_WINDOWS_JOB_SCRIPT_FILE) {
    child.on('message', (message) => {
      // Observe the target's failure while retaining a still-live supervisor.
      if (message?.kind === 'fixture-target-exit') child.emit('exit', 1, null);
    });
  }
  return child;
};
childProcess.spawnSync = function (file, args, options) {
  if (process.env.KODAX_DAEMON_SERVE === '1' && args?.[0] === '__daemon-job-identity') {
    event('probe');
    const counter = process.env.SPACE_TEST_JOB_ATTEMPTS;
    let attempts = [];
    try {
      attempts = JSON.parse(fs.readFileSync(counter, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    attempts.push(process.pid);
    fs.writeFileSync(counter, JSON.stringify(attempts));
    const mode = fs.readFileSync(process.env.SPACE_TEST_JOB_FAULT, 'utf8').trim();
    if (
      mode === 'persistent' ||
      (['transient', 'cleanup'].includes(mode) && attempts.length === 1)
    ) {
      // A timeout is retried once inside the probe, so only the persistent mode uses it;
      // transient/cleanup inject a native refusal, which fails the whole startup at once.
      if (mode !== 'persistent') {
        return {
          pid: 0,
          status: 1,
          signal: null,
          stdout: '',
          stderr: 'Injected native Job probe refusal',
          output: [],
        };
      }
      return {
        pid: 0,
        status: null,
        signal: null,
        stdout: '',
        stderr: '',
        output: [],
        error: Object.assign(new Error('Injected native Job probe timeout'), { code: 'ETIMEDOUT' }),
      };
    }
  }
  return spawnSync(file, args, options);
};
syncBuiltinESMExports();
