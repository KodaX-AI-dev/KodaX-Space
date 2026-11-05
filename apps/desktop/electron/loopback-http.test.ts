import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { listenFetchableLoopback } from './loopback-http.js';

test('an already cancelled loopback startup never opens a listener', async () => {
  const server = createServer();
  const failure = new Error('cancelled before startup');
  await assert.rejects(listenFetchableLoopback(server, AbortSignal.abort(failure)), (error) =>
    Object.is(error, failure),
  );
  assert.equal(server.listening, false);
});

test('cancellation during readiness closes the listener without rebinding', async () => {
  const controller = new AbortController();
  const failure = new Error('cancelled during readiness');
  let requests = 0;
  const server = createServer(() => {
    requests++;
    controller.abort(failure);
  });
  try {
    await assert.rejects(listenFetchableLoopback(server, controller.signal), (error) =>
      Object.is(error, failure),
    );
    assert.equal(requests, 1);
    assert.equal(server.listening, false);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('an HTTP readiness failure is preserved without rebinding', async () => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(503);
    response.end();
  });
  try {
    await assert.rejects(
      listenFetchableLoopback(server, AbortSignal.timeout(2_000)),
      /Loopback readiness returned 503/u,
    );
    assert.equal(requests, 1);
    assert.equal(server.listening, false);
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
