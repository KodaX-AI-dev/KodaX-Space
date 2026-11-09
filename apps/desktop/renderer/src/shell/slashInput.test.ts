import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldOpenSlashCompletion } from './slashInput.js';

test('optional help topics and completed argument values do not reopen a parameter list', () => {
  for (const input of [
    '/help ',
    '/help  ',
    '/h ',
    '/help model ',
    '/sessions ',
    '/model default ',
    '/provider anthropic/claude ',
    '/load saved-session ',
    '/extensions sdk load ',
    '/repointel mode auto ',
  ])
    assert.equal(shouldOpenSlashCompletion(input), false, input);
  for (const input of ['/help mod', '/h mod', '/model def'])
    assert.equal(shouldOpenSlashCompletion(input), true, input);
});

test('tree labels retain session completion and finish after the selected session', () => {
  for (const action of ['label', 'unlabel']) {
    assert.equal(shouldOpenSlashCompletion(`/tree ${action} `), true);
    assert.equal(shouldOpenSlashCompletion(`/tree ${action} saved`), true);
    assert.equal(shouldOpenSlashCompletion(`/tree ${action} saved-session `), false);
  }
});

test('completed quoted values count as one argument and do not reopen completion', () => {
  for (const input of [
    '/model "OpenAI compatible" ',
    '/provider "Local provider" ',
    '/tree label "saved session" ',
    '/tree unlabel "saved session" extra ',
    '/extensions sdk load extra',
  ])
    assert.equal(shouldOpenSlashCompletion(input), false, input);
});
