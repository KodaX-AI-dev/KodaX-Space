import assert from 'node:assert/strict';
import test from 'node:test';
import { partnerSkillDraftTextForSurface } from './partnerSkillDraft.js';

test('allows the Skill draft shortcut only on Partner', () => {
  assert.equal(
    partnerSkillDraftTextForSurface('partner', 'Reviewable Skill draft'),
    'Reviewable Skill draft',
  );
  assert.equal(partnerSkillDraftTextForSurface('code', 'Reviewable Skill draft'), null);
  assert.equal(partnerSkillDraftTextForSurface('partner', '   '), null);
});
