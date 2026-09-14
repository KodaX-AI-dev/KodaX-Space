import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPartnerSceneTemplate,
  hasAcceptedPartnerUserMessage,
  shouldShowPartnerSceneShortcuts,
} from './partnerSceneTemplates.js';

test('scene template inserts into an empty draft', () => {
  assert.deepEqual(
    applyPartnerSceneTemplate({
      currentDraft: '',
      previousGeneratedTemplate: null,
      nextTemplate: 'Research this market.',
    }),
    {
      draft: 'Research this market.',
      generatedTemplate: 'Research this market.',
      applied: true,
    },
  );
});

test('switching an untouched generated template replaces it', () => {
  assert.deepEqual(
    applyPartnerSceneTemplate({
      currentDraft: 'Research this market.',
      previousGeneratedTemplate: 'Research this market.',
      nextTemplate: 'Create a presentation.',
    }),
    {
      draft: 'Create a presentation.',
      generatedTemplate: 'Create a presentation.',
      applied: true,
    },
  );
});

test('switching after the user edits preserves their draft', () => {
  assert.deepEqual(
    applyPartnerSceneTemplate({
      currentDraft: 'Research the battery market for our board.',
      previousGeneratedTemplate: 'Research this market.',
      nextTemplate: 'Create a presentation.',
    }),
    {
      draft: 'Research the battery market for our board.',
      generatedTemplate: 'Research this market.',
      applied: false,
    },
  );
});

test('only accepted or canonical user messages close the new-task shortcut row', () => {
  assert.equal(
    hasAcceptedPartnerUserMessage([{ operationId: 'pending', sendAdmissionSettled: undefined }]),
    false,
  );
  assert.equal(
    hasAcceptedPartnerUserMessage([{ operationId: 'accepted', sendAdmissionSettled: true }]),
    true,
  );
  assert.equal(hasAcceptedPartnerUserMessage([{ turnId: 'turn-1' }]), true);
});

test('shortcut row is Partner-only and disappears after the first accepted send', () => {
  assert.equal(
    shouldShowPartnerSceneShortcuts({ surface: 'partner', hasAcceptedUserMessage: false }),
    true,
  );
  assert.equal(
    shouldShowPartnerSceneShortcuts({ surface: 'partner', hasAcceptedUserMessage: true }),
    false,
  );
  assert.equal(
    shouldShowPartnerSceneShortcuts({ surface: 'code', hasAcceptedUserMessage: false }),
    false,
  );
});
