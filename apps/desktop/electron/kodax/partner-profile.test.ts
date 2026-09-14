import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PARTNER_AGENT_PROFILE,
  PARTNER_PROFILE_INSTRUCTIONS,
  PARTNER_PROFILE_VERIFICATION,
} from './partner-profile.js';

test('Partner honors an explicit remote destination before local artifact delivery', () => {
  assert.match(PARTNER_PROFILE_INSTRUCTIONS, /explicitly names an external platform or service/i);
  assert.match(PARTNER_PROFILE_INSTRUCTIONS, /matching connector tool is available/i);
  assert.match(PARTNER_PROFILE_INSTRUCTIONS, /do not silently fall back to a local/i);
  assert.match(
    PARTNER_PROFILE_INSTRUCTIONS,
    /dedicated platform connector.*takes precedence over generic file, delivery, and artifact tools/i,
  );
  assert.match(
    PARTNER_PROFILE_INSTRUCTIONS,
    /only use local delivery or artifact tools when the user asks for a local/i,
  );
  assert.match(PARTNER_PROFILE_INSTRUCTIONS, /direct native-resource creation tool/i);
  assert.match(PARTNER_PROFILE_INSTRUCTIONS, /platform’s own official sign-in/i);
  assert.match(PARTNER_PROFILE_INSTRUCTIONS, /ask only for information required/i);
  assert.match(
    PARTNER_PROFILE_INSTRUCTIONS,
    /structured connector results as the source of truth/i,
  );
  assert.match(
    PARTNER_PROFILE_INSTRUCTIONS,
    /created resource.*canonical URL.*content verification warning/i,
  );
  assert.match(PARTNER_PROFILE_INSTRUCTIONS, /unknown outcomes.*do not automatically retry/i);
});

test('Partner verifies connector results and does not reward silent local fallback', () => {
  const checks = PARTNER_PROFILE_VERIFICATION.requiredChecks ?? [];
  const criteria = PARTNER_PROFILE_VERIFICATION.criteria ?? [];

  assert.ok(checks.includes('destination-fidelity'));
  assert.ok(checks.includes('connector-result-truthfulness'));
  assert.ok(checks.includes('no-silent-fallback'));
  assert.ok(!checks.includes('artifact-completeness'));
  assert.ok(criteria.some((criterion) => criterion.id === 'destination-fidelity'));
  assert.ok(criteria.some((criterion) => criterion.id === 'connector-result-truthfulness'));
  assert.match(
    PARTNER_PROFILE_VERIFICATION.requiredEvidence?.join('\n') ?? '',
    /canonical URL|structured connector receipt/i,
  );
  assert.match(
    PARTNER_PROFILE_VERIFICATION.instructions?.join('\n') ?? '',
    /creation status.*content verification/i,
  );
  assert.equal(PARTNER_AGENT_PROFILE.version, '2026-09-03');
});
