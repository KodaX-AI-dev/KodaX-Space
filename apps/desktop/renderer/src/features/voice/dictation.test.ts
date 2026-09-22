import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Dictation, type Recording } from './dictation.js';

test('cancelling while microphone permission is pending closes the late recording', async () => {
  let accept!: (recording: Recording) => void;
  let closed = 0;
  const texts: string[] = [];
  const dictation = new Dictation({
    record: () =>
      new Promise((resolve) => {
        accept = resolve;
      }),
    transcribe: async () => 'unexpected',
    cancelTranscription: async () => {},
    onText: (text) => texts.push(text),
    onState: () => {},
    onError: () => {},
  });
  const starting = dictation.start('zh');
  dictation.cancel();
  accept({
    stop: async () => new Uint8Array(3200),
    cancel: () => {
      closed++;
    },
  });
  await starting;
  assert.equal(closed, 1);
  assert.deepEqual(texts, []);
});

test('a late recognition result never enters a cancelled or replacement draft', async () => {
  let finish!: (text: string) => void;
  let requested!: () => void;
  const called = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const texts: string[] = [];
  const cancelled: string[] = [];
  const dictation = new Dictation({
    record: async () => ({ stop: async () => new Uint8Array(3200), cancel: () => {} }),
    transcribe: async () => {
      requested();
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    cancelTranscription: async (id) => {
      cancelled.push(id);
    },
    onText: (text) => texts.push(text),
    onState: () => {},
    onError: () => {},
  });
  await dictation.start('zh');
  const stopping = dictation.stop();
  await called;
  dictation.cancel();
  finish('这句不应进入下一个会话');
  await stopping;
  assert.deepEqual(texts, []);
  assert.equal(cancelled.length, 1);
});

test('successful dictation preserves language, inserts once and releases the recording', async () => {
  const texts: string[] = [];
  const phases: string[] = [];
  let released = 0;
  const pcm = new Uint8Array(3200);
  const dictation = new Dictation({
    record: async () => ({
      stop: async () => pcm,
      cancel: () => {
        released++;
      },
    }),
    transcribe: async (bytes, language, id) => {
      assert.equal(bytes, pcm);
      assert.equal(language, 'en');
      assert.match(id, /^[0-9a-f-]{36}$/);
      return '  Hello, Space.  ';
    },
    cancelTranscription: async () => {
      assert.fail('completed recognition must not be cancelled');
    },
    onText: (text) => texts.push(text),
    onState: (phase) => phases.push(phase),
    onError: (error) => {
      throw error;
    },
  });
  await dictation.start('en');
  await dictation.stop();
  await dictation.stop();
  assert.deepEqual(texts, ['Hello, Space.']);
  assert.deepEqual(phases, ['requesting', 'recording', 'transcribing', 'idle']);
  assert.equal(released, 1);
});
