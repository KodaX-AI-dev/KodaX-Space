import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionWithdrawInputChannel } from './session.js';

test('take-back returns the original input or the SDK conflict outcome, never both', () => {
  const output = sessionWithdrawInputChannel.output;
  assert.equal(output.safeParse({ text: 'original', attachments: [] }).success, true);
  // SDK `conflict`: delivered at a safe point, dropped with its Run, or lost with a Host restart.
  assert.equal(output.safeParse({ conflict: true }).success, true);
  assert.equal(output.safeParse({ conflict: true, text: 'x', attachments: [] }).success, false);
});
