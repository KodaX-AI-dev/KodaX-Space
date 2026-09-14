import assert from 'node:assert/strict';
import test from 'node:test';
import type { SpaceExpertDefinitionT } from '@kodax-space/space-ipc-schema';
import {
  PARTNER_EXPERT_RECENCY_KEY,
  partnerExpertMenuKey,
  readPartnerExpertRecency,
  recordPartnerExpertUsage,
  visiblePartnerExperts,
  type PartnerExpertMenuItem,
} from './partnerExpertMenu.js';

function item(id: string): PartnerExpertMenuItem {
  const expert: SpaceExpertDefinitionT = {
    id,
    revision: 1,
    name: `Expert ${id}`,
    description: '',
    prompt: `Act as ${id}`,
    starterTasks: [],
  };
  return { extensionId: 'kodax.partner-library', extensionName: 'Partner 插件库', expert };
}

test('the expert menu defaults to the first five configured experts', () => {
  const catalog = ['a', 'b', 'c', 'd', 'e', 'f'].map(item);
  assert.deepEqual(
    visiblePartnerExperts(catalog, []).map((entry) => entry.expert.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
});

test('recently used experts lead while unused experts keep catalog order', () => {
  const catalog = ['a', 'b', 'c', 'd', 'e', 'f'].map(item);
  assert.deepEqual(
    visiblePartnerExperts(catalog, [
      partnerExpertMenuKey(item('f')),
      partnerExpertMenuKey(item('c')),
    ]).map((entry) => entry.expert.id),
    ['f', 'c', 'a', 'b', 'd'],
  );
});

test('selecting an expert records a deduplicated most-recent-first history', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  recordPartnerExpertUsage(storage, item('a'));
  recordPartnerExpertUsage(storage, item('b'));
  recordPartnerExpertUsage(storage, item('a'));
  assert.deepEqual(readPartnerExpertRecency(storage), [
    partnerExpertMenuKey(item('a')),
    partnerExpertMenuKey(item('b')),
  ]);
  assert.equal(values.has(PARTNER_EXPERT_RECENCY_KEY), true);
});
