import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacySettingsTab, resolveSettingsPage } from './settingsNavigation.js';

test('legacy settings inputs keep their documented destinations', () => {
  assert.equal(resolveSettingsPage('preferences'), 'preferences');
  assert.equal(resolveSettingsPage('providers'), 'providers');
  assert.equal(resolveSettingsPage('runtime'), 'context');
  assert.equal(resolveSettingsPage('extensions'), 'extensions');
  assert.equal(resolveSettingsPage('diagnostics'), 'diagnostics');
  assert.equal(resolveSettingsPage('license'), 'about');
});

test('internal resource pages remain distinct while automation observes legacy categories', () => {
  assert.equal(resolveSettingsPage('mcp'), 'mcp');
  assert.equal(resolveSettingsPage('skills'), 'skills');
  assert.equal(resolveSettingsPage('sandbox'), 'sandbox');
  assert.equal(legacySettingsTab('mcp'), 'runtime');
  assert.equal(legacySettingsTab('skills'), 'runtime');
  assert.equal(legacySettingsTab('external-agents'), 'runtime');
  assert.equal(legacySettingsTab('sandbox'), 'runtime');
  assert.equal(legacySettingsTab('appearance'), 'preferences');
  assert.equal(legacySettingsTab('about'), 'license');
  assert.equal(legacySettingsTab('providers'), 'providers');
  assert.equal(legacySettingsTab('extensions'), 'extensions');
  assert.equal(legacySettingsTab('diagnostics'), 'diagnostics');
});
