import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { UserImageAttachment } from './transcriptTypes.js';
import { useAppStore } from './appStore.js';
import { mergeRestoredDraft } from './composerRestore.js';

const SID = 's_take_back';
const image: UserImageAttachment = {
  id: 'img-1',
  kind: 'image',
  mediaType: 'image/png',
  status: 'available',
  thumbnailUrl: 'app://thumb',
  previewUrl: 'app://preview',
};

function queue(id: string, content: string): void {
  useAppStore.setState((state) => ({
    queuedUserMessagesBySession: {
      ...state.queuedUserMessagesBySession,
      [SID]: [
        ...(state.queuedUserMessagesBySession[SID] ?? []),
        {
          id,
          queueId: `host-${id}`,
          content,
          matchContent: content,
          queueMode: 'after-turn',
          status: 'queued',
          sentAt: 1,
        },
      ],
    },
  }));
}

beforeEach(() => {
  useAppStore.setState({ queuedUserMessagesBySession: {}, composerRestoreBySession: {} });
});

test('a taken-back text input leaves the transcript and its text goes back to the composer', () => {
  queue('q1', 'shown text');
  queue('q2', 'still queued');
  useAppStore.getState().takeBackQueuedInput(SID, 'q1', { text: 'original text', attachments: [] });
  assert.deepEqual(
    useAppStore.getState().queuedUserMessagesBySession[SID]?.map((item) => item.id),
    ['q2'],
  );
  assert.equal(useAppStore.getState().consumeComposerRestore(SID), 'original text');
  assert.equal(useAppStore.getState().consumeComposerRestore(SID), undefined);
});

test('an input with images stays as a withdrawn bubble because images cannot be re-attached', () => {
  queue('q1', 'look');
  useAppStore
    .getState()
    .takeBackQueuedInput(SID, 'q1', { text: 'look at this', attachments: [image] });
  const [item] = useAppStore.getState().queuedUserMessagesBySession[SID] ?? [];
  assert.equal(item?.withdrawn, true);
  assert.deepEqual(item?.attachments, [image]);
  assert.equal(useAppStore.getState().consumeComposerRestore(SID), 'look at this');
});

test('the image-only placeholder text is not put into the composer', () => {
  queue('q1', '(image)');
  useAppStore.getState().takeBackQueuedInput(SID, 'q1', { text: '(image)', attachments: [image] });
  assert.equal(useAppStore.getState().consumeComposerRestore(SID), undefined);
});

test('two take-backs before the composer reads them keep both texts in order', () => {
  queue('q1', 'first');
  queue('q2', 'second');
  const store = useAppStore.getState();
  store.takeBackQueuedInput(SID, 'q1', { text: 'first', attachments: [] });
  store.takeBackQueuedInput(SID, 'q2', { text: 'second', attachments: [] });
  assert.equal(useAppStore.getState().consumeComposerRestore(SID), 'first\n\nsecond');
});

test('restored text fills an empty composer and is appended to a draft', () => {
  assert.equal(mergeRestoredDraft('', 'original'), 'original');
  assert.equal(mergeRestoredDraft('  ', 'original'), 'original');
  assert.equal(mergeRestoredDraft('my draft', 'original'), 'my draft\n\noriginal');
});
