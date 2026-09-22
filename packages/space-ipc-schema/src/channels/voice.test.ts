import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voiceRequestSchema, VOICE_MAX_BYTES } from './voice.js';

test('voice input accepts bounded PCM16 and rejects files, URLs and malformed audio', () => {
  const base = { requestId: '550e8400-e29b-41d4-a716-446655440000', language: 'zh' };
  assert.equal(voiceRequestSchema.safeParse({ ...base, pcm: new Uint8Array(3200) }).success, true);
  for (const pcm of [
    new Uint8Array(0),
    new Uint8Array(3201),
    new Uint8Array(VOICE_MAX_BYTES + 2),
    [0, 1],
    '/tmp/audio.wav',
  ]) {
    assert.equal(voiceRequestSchema.safeParse({ ...base, pcm }).success, false);
  }
  assert.equal(
    voiceRequestSchema.safeParse({
      ...base,
      pcm: new Uint8Array(3200),
      url: 'https://example.invalid',
    }).success,
    false,
  );
});
