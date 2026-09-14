import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the connector detail composer offers only read and reviewed append for existing documents', async () => {
  const source = await readFile(new URL('./PartnerRemoteComposer.tsx', import.meta.url), 'utf8');
  assert.match(source, /partner\.connectors\.proposals\.create/u);
  assert.doesNotMatch(source, /createFolderUrl/u);
  assert.doesNotMatch(source, /operation:\s*'create'/u);
});
