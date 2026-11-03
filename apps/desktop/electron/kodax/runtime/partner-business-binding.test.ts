import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSpaceDataDir } from '../data-paths.js';
import {
  capturePartnerBusinessBinding,
  readPartnerBusinessBinding,
} from './partner-business-binding.js';

test('recovery reads the original committed Partner selection and rejects another Session or changed bytes', async () => {
  const original = { sessionId: 'binding-original', projectRoot: '/workspace', bindings: [] };
  const binding = await capturePartnerBusinessBinding(original);
  assert.deepEqual(
    await readPartnerBusinessBinding(binding, original.sessionId, original.projectRoot),
    original,
  );
  assert.deepEqual(await capturePartnerBusinessBinding(original), binding);
  await assert.rejects(
    readPartnerBusinessBinding(binding, 'another-session', original.projectRoot),
  );
  await assert.rejects(readPartnerBusinessBinding(binding, original.sessionId, '/other-workspace'));
  await assert.rejects(
    readPartnerBusinessBinding(
      { ...binding, revision: '0'.repeat(64) },
      original.sessionId,
      original.projectRoot,
    ),
  );
  await writeFile(
    path.join(getSpaceDataDir(), 'partner-bindings', `${binding.revision}.json`),
    JSON.stringify({ ...original, projectRoot: '/tampered' }),
  );
  await assert.rejects(
    readPartnerBusinessBinding(binding, original.sessionId, original.projectRoot),
    /changed/,
  );
});
