import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';

class Worker extends EventEmitter {
  pid: number | undefined;
  killed = false;
  messages: unknown[] = [];
  kill(): boolean {
    if (!this.pid) return false;
    this.killed = true;
    return true;
  }
  postMessage(value: unknown): void {
    this.messages.push(value);
  }
}
const req = createRequire(import.meta.url);
req('electron');
const electron = req.cache[req.resolve('electron')];
assert.ok(electron);
let worker: Worker;
let forks = 0;
electron.exports = {
  utilityProcess: {
    fork: () => {
      forks++;
      return (worker = new Worker());
    },
  },
};
const { runWhisper, stopWhisper } = await import('./runner.js');

test('cancellation before spawn kills the late worker and removal waits for its exit', async () => {
  const abort = new AbortController();
  const result = runWhisper('/test/voice', abort.signal);
  abort.abort();
  await assert.rejects(result, /cancelled/);
  let stopped = false;
  const stopping = Promise.resolve(stopWhisper()).then(() => {
    stopped = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(stopped, false, 'native files must remain until the worker exits');
  worker.pid = 123;
  worker.emit('spawn');
  assert.equal(worker.killed, true);
  assert.deepEqual(worker.messages, [], 'cancelled audio must never be sent');
  worker.emit('exit', 0);
  await stopping;
  assert.equal(stopped, true);
});

test('successful recognition reuses the worker and explicit stop waits for exit', async () => {
  const startForks = forks;
  const probe = runWhisper('/test/voice', new AbortController().signal);
  worker.pid = 124;
  worker.emit('spawn');
  worker.emit('message', { ok: true, text: '' });
  assert.equal(await probe, '');
  const recognition = runWhisper('/test/voice', new AbortController().signal);
  worker.emit('message', { ok: true, text: '中文输入' });
  assert.equal(await recognition, '中文输入');
  assert.equal(forks - startForks, 1);
  assert.equal(worker.messages.length, 2);
  const stopping = stopWhisper();
  assert.equal(worker.killed, true);
  worker.emit('exit', 0);
  await stopping;
});
