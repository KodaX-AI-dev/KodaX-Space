import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionAgentsMdChannel } from './session.js';

test('context IPC retains more than sixteen bounded Markdown fragments', () => {
  const files = Array.from({ length: 24 }, (_, index) => ({
    path: `/project/.kodax/rules/${index}.md`,
    content: `Rule ${index}`,
    scope: 'project',
  }));
  assert.deepEqual(sessionAgentsMdChannel.output.parse({ files }).files, files);
});
