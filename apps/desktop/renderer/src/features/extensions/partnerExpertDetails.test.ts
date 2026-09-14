import assert from 'node:assert/strict';
import test from 'node:test';
import type { PartnerExpertSnapshotT } from '@kodax-space/space-ipc-schema';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n/I18nProvider.js';
import { createPartnerDetailTab } from '../partner/partnerDetailWorkspace.js';
import {
  projectPartnerExpertDetails,
  PartnerExpertDetailsContent,
} from './PartnerExpertDetails.js';

test('expert details expose inputs, deliverables, quality checks and optional versus required capabilities', () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nProvider,
      null,
      createElement(PartnerExpertDetailsContent, {
        expert: {
          extensionId: 'library',
          extensionVersion: '1.0.0',
          expert: {
            id: 'research',
            revision: 1,
            name: 'Research',
            description: '',
            prompt: 'Research',
            starterTasks: [],
            workflow: {
              inputs: ['Market evidence'],
              deliverables: ['Decision report'],
              qualityChecks: ['Citations support claims'],
              connectorNeeds: [
                { operation: 'read', required: true, reason: 'Read designated evidence' },
                {
                  operation: 'createDocument',
                  required: false,
                  reason: 'Optional online delivery',
                },
              ],
            },
          },
        },
        isCurrent: true,
        available: true,
        enabled: true,
        busy: false,
        onUseSkillChange: () => undefined,
        onCopyTask: () => undefined,
      }),
    ),
  );
  for (const value of [
    'Market evidence',
    'Decision report',
    'Citations support claims',
    'Read designated evidence',
    'Optional online delivery',
  ])
    assert.ok(html.includes(value));
  assert.match(html, /Read and summarize/);
  assert.match(html, /Create document/);
  assert.match(html, /Required/);
  assert.match(html, /Optional/);
});

test('expert details retain the actual snapshot in a reusable Partner detail tab', () => {
  const expert: PartnerExpertSnapshotT = {
    extensionId: 'partner-library',
    extensionVersion: '1.1.0',
    expert: {
      id: 'writing-mentor',
      revision: 1,
      name: 'Writing mentor',
      description: '',
      prompt: 'Help with writing',
      starterTasks: [],
    },
  };
  const tab = createPartnerDetailTab({ kind: 'expert', expert }, 'Expert', 1);
  const reopened = createPartnerDetailTab({ kind: 'expert', expert }, 'Expert', 2);
  assert.deepEqual(tab.expert, expert);
  assert.equal(tab.title, expert.expert.name);
  assert.equal(tab.id, reopened.id);
});

test('details show live Skill mode only for the exact selected revision and never upgrade another tab', () => {
  const saved: PartnerExpertSnapshotT = {
    extensionId: 'library',
    extensionVersion: '1.0.0',
    expert: {
      id: 'user.editor',
      revision: 1,
      name: 'Editor',
      description: '',
      prompt: 'Edit',
      starterTasks: [],
      skillRef: 'document-processing',
    },
  };
  const promptOnly = { ...saved, useSkill: false };
  assert.deepEqual(projectPartnerExpertDetails(saved, promptOnly), {
    expert: promptOnly,
    isCurrent: true,
  });
  const newer = { ...saved, expert: { ...saved.expert, revision: 2, prompt: 'New instructions' } };
  assert.deepEqual(projectPartnerExpertDetails(saved, newer), { expert: saved, isCurrent: false });
  assert.deepEqual(projectPartnerExpertDetails(saved, null), { expert: saved, isCurrent: false });
});

test('details expose a Skill switch only when configured and preserve example text for trusted copying', () => {
  const expert: PartnerExpertSnapshotT = {
    extensionId: 'library',
    extensionVersion: '1.0.0',
    expert: {
      id: 'editor',
      revision: 1,
      name: 'Editor',
      description: '',
      prompt: 'Edit',
      starterTasks: ['  Review <report>\nwith citations.  '],
    },
  };
  const render = (snapshot: PartnerExpertSnapshotT, isCurrent: boolean, available = true) =>
    renderToStaticMarkup(
      createElement(
        I18nProvider,
        null,
        createElement(PartnerExpertDetailsContent, {
          expert: snapshot,
          isCurrent,
          available,
          enabled: true,
          busy: false,
          onUseSkillChange: () => undefined,
          onCopyTask: () => undefined,
        }),
      ),
    );
  const promptOnly = render(expert, true);
  assert.match(promptOnly, /Keeps this expert for subsequent messages and tasks/);
  assert.match(promptOnly, /until you switch or remove it/);
  const unavailable = render(expert, true, false);
  assert.match(
    unavailable,
    /This expert is saved in this conversation but is currently unavailable/,
  );
  assert.doesNotMatch(unavailable, /Keeps this expert for subsequent messages and tasks/);
  assert.match(render(expert, false), /Choose this expert to use it throughout a conversation/);
  assert.doesNotMatch(render(expert, false), /Keeps this expert for subsequent messages and tasks/);
  assert.doesNotMatch(promptOnly, /data-testid="expert-skill-toggle"/);
  assert.match(promptOnly, / {2}Review &lt;report&gt;\nwith citations\. {2}/);
  assert.match(promptOnly, /data-testid="expert-copy-starter-task"/);
  const configured = {
    ...expert,
    useSkill: false,
    expert: { ...expert.expert, skillRef: 'document-processing' },
  };
  assert.match(render(configured, true), /data-testid="expert-skill-toggle"/);
  assert.match(render(configured, true), /another Skill applies to that turn only/);
  assert.doesNotMatch(render(configured, true), /checked=""/);
  assert.doesNotMatch(render(configured, false), /data-testid="expert-skill-toggle"/);
});
