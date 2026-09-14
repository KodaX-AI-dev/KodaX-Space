import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPartnerContextSummary } from './partnerContextSummary.js';

test('remote records join task materials and artifacts without a review destination', () => {
  const summary = projectPartnerContextSummary({
    sourceLabels: [],
    pendingSourcePaths: [],
    artifactLabels: [],
    transientArtifactLabels: [],
    deliveryPaths: [],
    remoteSourceLabels: ['Feishu / quarterly report'],
    remoteReceiptLabels: ['Created report'],
    expertLabels: ['Research expert'],
    skillLabels: ['deep-research'],
  });
  assert.deepEqual(summary, {
    materials: { count: 1, labels: ['Feishu / quarterly report'] },
    collaboration: { count: 2, labels: ['Research expert', 'deep-research'] },
    artifacts: { count: 1, labels: ['Created report'] },
  });
});

test('projects real Partner records into compact context-card summaries', () => {
  const summary = projectPartnerContextSummary({
    sourceLabels: ['Brief.pdf', 'Research', 'Research'],
    pendingSourcePaths: ['notes/outline.md'],
    artifactLabels: ['Market report', 'Market report'],
    transientArtifactLabels: ['Chart preview'],
    deliveryPaths: ['partner-output/report.docx'],
    expertLabels: [],
    skillLabels: [],
  });

  assert.deepEqual(summary, {
    materials: {
      count: 4,
      labels: ['Brief.pdf', 'Research'],
    },
    collaboration: {
      count: 0,
      labels: [],
    },
    artifacts: {
      count: 4,
      labels: ['Market report', 'Chart preview'],
    },
  });
});

test('uses filenames for paths and omits blank labels', () => {
  const summary = projectPartnerContextSummary({
    sourceLabels: [' ', 'Specs'],
    pendingSourcePaths: ['references\\brief.docx'],
    artifactLabels: [],
    transientArtifactLabels: [],
    deliveryPaths: ['/tmp/output.xlsx'],
    expertLabels: [],
    skillLabels: [],
  });

  assert.deepEqual(summary.materials.labels, ['Specs', 'brief.docx']);
  assert.deepEqual(summary.artifacts.labels, ['output.xlsx']);
});
