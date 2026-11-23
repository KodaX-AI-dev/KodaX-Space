import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocalNoticeMarker } from '@kodax-space/space-ipc-schema';
import type { ConversationMessage } from './composeMessages.js';
import { coalesceModelChangeMarkers } from './timelineMarkers.js';

function switched(id: string, from: string, to: string): ConversationMessage {
  const marker: LocalNoticeMarker = {
    kind: 'model_change',
    from: { provider: 'zhipu', model: from },
    to: { provider: 'zhipu', model: to },
  };
  return { kind: 'local_notice', id, content: `model -> ${to}`, sentAt: 1, variant: 'output', marker };
}

const user: ConversationMessage = { kind: 'user', id: 'u1', content: 'hi', sentAt: 2 };

function markers(messages: readonly ConversationMessage[]): string[] {
  return messages.map((message) =>
    message.kind === 'local_notice' && message.marker?.kind === 'model_change'
      ? `${message.marker.from.model}->${message.marker.to.model}`
      : message.kind,
  );
}

test('back-to-back model switches with no turn between them read as one switch', () => {
  const result = coalesceModelChangeMarkers([
    user,
    switched('a', 'm1', 'm2'),
    switched('b', 'm2', 'm3'),
  ]);
  assert.deepEqual(markers(result), ['user', 'm1->m3']);
});

test('a switch before the first turn has nothing to contrast with and is not drawn', () => {
  const result = coalesceModelChangeMarkers([switched('a', 'm1', 'm2'), user]);
  assert.deepEqual(markers(result), ['user']);
});

test('switching away and straight back leaves no marker', () => {
  const result = coalesceModelChangeMarkers([
    user,
    switched('a', 'm1', 'm2'),
    switched('b', 'm2', 'm1'),
  ]);
  assert.deepEqual(markers(result), ['user']);
});

test('a turn between two switches keeps both boundaries', () => {
  const result = coalesceModelChangeMarkers([
    user,
    switched('a', 'm1', 'm2'),
    user,
    switched('b', 'm2', 'm3'),
  ]);
  assert.deepEqual(markers(result), ['user', 'm1->m2', 'user', 'm2->m3']);
});

test('a list without model switches is returned unchanged', () => {
  const input = [user];
  assert.equal(coalesceModelChangeMarkers(input), input);
});
