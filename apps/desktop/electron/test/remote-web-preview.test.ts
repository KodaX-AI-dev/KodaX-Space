import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemoteWebPreviewRegistry, type PreviewFrame } from '../window/remote-web-preview.js';

test('remote preview grants stay in the creating window and expire on close', () => {
  const registry = new RemoteWebPreviewRegistry();
  const grant = registry.create(7, 'https://example.feishu.cn/docx/report');
  assert.equal(grant.url, 'https://example.feishu.cn/docx/report');
  const main: PreviewFrame = { name: '', parent: null };
  const preview = { name: `space-web-preview-${grant.id}`, parent: main };
  assert.equal(registry.forFrame(7, preview, main), grant.id);
  assert.equal(registry.forFrame(8, preview, main), null);
  assert.equal(registry.forFrame(7, { name: '', parent: preview }, main), grant.id);
  const plugin = { name: 'plugin', parent: main };
  assert.equal(registry.forFrame(7, { ...preview, parent: plugin }, main), null);
  registry.release(8, grant.id);
  assert.equal(registry.forFrame(7, preview, main), grant.id);
  registry.release(7, grant.id);
  assert.equal(registry.forFrame(7, preview, main), null);
});

test('remote preview rejects local, credential-bearing and executable destinations', () => {
  const registry = new RemoteWebPreviewRegistry();
  for (const url of [
    'file:///etc/passwd',
    'app://space/',
    'javascript:alert(1)',
    'http://example.org/',
    'https://user:secret@example.org/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://[::1]/',
  ]) {
    assert.throws(() => registry.create(7, url), /Invalid web preview URL/);
  }
});
