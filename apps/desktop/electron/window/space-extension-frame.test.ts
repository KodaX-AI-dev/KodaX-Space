import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import {
  SPACE_EXTENSION_MAX_FRAME_DOCUMENT_CHARACTERS,
  SPACE_EXTENSION_MAX_HTML_BYTES,
} from '@kodax-space/space-ipc-schema';
import { buildRestrictedExtensionDocument } from '../../renderer/src/features/extensions/extensionViewPolicy.js';
import {
  SPACE_EXTENSION_FRAME_BOOTSTRAP,
  isSpaceExtensionFrameUrl,
  spaceExtensionFrameResponse,
} from './space-extension-frame.js';

test('the extension UI bootstrap has its own no-network child-frame response', async () => {
  const response = spaceExtensionFrameResponse('app://space/__space-extension-frame', 'GET');
  assert.ok(response);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const csp = response.headers.get('content-security-policy') ?? '';
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("frame-src 'none'"));
  assert.ok(csp.includes("script-src 'unsafe-inline'"));
  assert.ok(!csp.includes('unsafe-eval'));
  assert.ok((await response.text()).includes('Space extension'));
  assert.equal(spaceExtensionFrameResponse('app://space/index.html', 'GET'), null);
});

test('only the exact bootstrap endpoint is admitted, with an optional bounded view nonce', () => {
  assert.equal(isSpaceExtensionFrameUrl('app://space/__space-extension-frame?v=one-view'), true);
  for (const url of [
    'app://space/__space-extension-frame#x',
    'app://space/__space-extension-frame?other=x',
    'app://space/__space-extension-frame?v=a?x=b',
    'app://user@space/__space-extension-frame',
    'app://space.evil/__space-extension-frame',
    'app://space/__space-extension-frame/../index.html',
  ])
    assert.equal(isSpaceExtensionFrameUrl(url), false, url);
  assert.equal(
    spaceExtensionFrameResponse('app://space/__space-extension-frame', 'POST')?.status,
    405,
  );
});

test('bootstrap accepts one parent document, ignoring forged and oversized messages', () => {
  const parent = {};
  const writes: string[] = [];
  const listeners = new Set<(event: { source: object; data: unknown }) => void>();
  const script = SPACE_EXTENSION_FRAME_BOOTSTRAP.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  runInNewContext(script, {
    parent,
    window: {
      addEventListener: (
        _type: string,
        listener: (event: { source: object; data: unknown }) => void,
      ) => listeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (event: { source: object; data: unknown }) => void,
      ) => listeners.delete(listener),
    },
    document: {
      open: () => undefined,
      close: () => undefined,
      write: (html: string) => writes.push(html),
    },
  });
  const send = (source: object, data: unknown) => {
    for (const listener of listeners) listener({ source, data });
  };
  const valid = { type: 'space-extension.document.v1', documentHtml: '<p>Library</p>' };
  send({}, valid);
  send(parent, { ...valid, type: 'invoke' });
  send(parent, {
    ...valid,
    documentHtml: 'x'.repeat(SPACE_EXTENSION_MAX_FRAME_DOCUMENT_CHARACTERS + 1),
  });
  assert.deepEqual(writes, []);
  send(parent, valid);
  send(parent, { ...valid, documentHtml: '<p>Replacement</p>' });
  assert.deepEqual(writes, ['<p>Library</p>']);
  assert.equal(listeners.size, 0);
});

test('a valid package at the raw HTML byte limit still loads after adding the host policy', () => {
  const html = 'x'.repeat(SPACE_EXTENSION_MAX_HTML_BYTES);
  assert.equal(Buffer.byteLength(html, 'utf8'), SPACE_EXTENSION_MAX_HTML_BYTES);
  const documentHtml = buildRestrictedExtensionDocument(html);
  assert.ok(documentHtml.length <= SPACE_EXTENSION_MAX_FRAME_DOCUMENT_CHARACTERS);
  const parent = {};
  const writes: string[] = [];
  const listeners = new Set<(event: { source: object; data: unknown }) => void>();
  const script = SPACE_EXTENSION_FRAME_BOOTSTRAP.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  runInNewContext(script, {
    parent,
    window: {
      addEventListener: (
        _type: string,
        listener: (event: { source: object; data: unknown }) => void,
      ) => listeners.add(listener),
      removeEventListener: (
        _type: string,
        listener: (event: { source: object; data: unknown }) => void,
      ) => listeners.delete(listener),
    },
    document: {
      open: () => undefined,
      close: () => undefined,
      write: (value: string) => writes.push(value),
    },
  });
  for (const listener of listeners) {
    listener({ source: parent, data: { type: 'space-extension.document.v1', documentHtml } });
  }
  assert.equal(writes.length, 1);
  assert.equal(writes[0], documentHtml);
  assert.equal(listeners.size, 0);
});
