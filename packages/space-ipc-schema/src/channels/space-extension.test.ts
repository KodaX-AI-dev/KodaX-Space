import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spaceExtensionManifestSchema } from './space-extension.js';

test('a standalone Partner UI package declares only the supported host contract', () => {
  const manifest = spaceExtensionManifestSchema.parse({
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'kodax.partner-library',
    name: 'Partner 插件库',
    description: '专家和连接器',
    version: '0.1.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
  });
  assert.equal(manifest.id, 'kodax.partner-library');
  assert.deepEqual(manifest.experts, []);
  assert.deepEqual(manifest.connectors, []);
  assert.equal(manifest.ui.entry, 'ui/index.html');
});

test('expert identities must be unique within one extension package', () => {
  const expert = { id: 'mentor', revision: 1, name: '导师', description: '', prompt: '帮助写作' };
  const input = {
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'partner-library',
    name: '插件',
    description: '',
    version: '1.0.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
    experts: [expert, { ...expert, revision: 2 }],
  };
  assert.equal(spaceExtensionManifestSchema.safeParse(input).success, false);
});

test('a package cannot claim the host-owned user expert namespace', () => {
  const input = {
    formatVersion: 1,
    hostApiVersion: 1,
    id: 'partner-library',
    name: '插件',
    description: '',
    version: '1.0.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
    experts: [{ id: 'user.abc', revision: 1, name: '导师', description: '', prompt: '帮助写作' }],
  };
  assert.equal(spaceExtensionManifestSchema.safeParse(input).success, false);
});

test('expert catalog taxonomy requires host API v2 while legacy v1 packages stay valid', () => {
  const manifest = {
    formatVersion: 1 as const,
    hostApiVersion: 2,
    id: 'partner-library',
    name: '插件',
    description: '',
    version: '0.7.0',
    ui: { entry: 'ui/index.html' as const, sha256: 'a'.repeat(64) },
    experts: [
      {
        id: 'writer',
        revision: 1,
        name: '写作导师',
        description: '',
        prompt: '帮助写作',
        expertType: 'role',
        category: '内容创作',
        listingType: 'expert',
      },
    ],
  };
  assert.equal(spaceExtensionManifestSchema.safeParse(manifest).success, true);
  assert.equal(
    spaceExtensionManifestSchema.safeParse({ ...manifest, hostApiVersion: 1 }).success,
    false,
  );
  assert.equal(
    spaceExtensionManifestSchema.safeParse({ ...manifest, hostApiVersion: 3 }).success,
    true,
  );
});

test('platform capability guides require host API v3 and reference same-package connectors', () => {
  const manifest = {
    formatVersion: 1 as const,
    hostApiVersion: 3,
    id: 'partner-library',
    name: '插件',
    description: '',
    version: '0.8.0',
    ui: { entry: 'ui/index.html' as const, sha256: 'a'.repeat(64) },
    experts: [
      {
        id: 'feishu-office-suite',
        revision: 1,
        name: '飞书办公套件专家',
        description: '',
        prompt: '协助用户在飞书中工作。',
        expertType: 'platform' as const,
        capabilityGuide: {
          groups: [
            {
              id: 'base',
              label: '多维表格',
              actions: [
                {
                  id: 'create-base',
                  label: '新建多维表格',
                  requiredConnectorIds: ['feishu-docs'],
                  promptTemplate: '请新建一个飞书多维表格。',
                },
              ],
            },
          ],
        },
      },
    ],
    connectors: [
      {
        id: 'feishu-docs',
        adapter: 'feishu-cli' as const,
        name: '飞书',
        description: '飞书官方 CLI 连接器。',
      },
    ],
  };
  assert.equal(spaceExtensionManifestSchema.safeParse(manifest).success, true);
  assert.equal(
    spaceExtensionManifestSchema.safeParse({ ...manifest, hostApiVersion: 2 }).success,
    false,
  );
  assert.equal(
    spaceExtensionManifestSchema.safeParse({
      ...manifest,
      experts: [
        {
          ...manifest.experts[0],
          capabilityGuide: {
            groups: [
              {
                ...manifest.experts[0].capabilityGuide.groups[0],
                actions: [
                  {
                    ...manifest.experts[0].capabilityGuide.groups[0].actions[0],
                    requiredConnectorIds: ['missing-connector'],
                  },
                ],
              },
            ],
          },
        },
      ],
    }).success,
    false,
  );
});

test('host API v4 admits only the explicit Partner native-document delivery capability', () => {
  const manifest = {
    formatVersion: 1 as const,
    hostApiVersion: 4,
    id: 'partner-library',
    name: '插件',
    description: '',
    version: '0.9.0',
    ui: { entry: 'ui/index.html' as const, sha256: 'a'.repeat(64) },
    requiredHostCapabilities: ['partnerNativeDocumentDeliveryV1'],
  };
  assert.deepEqual(spaceExtensionManifestSchema.parse(manifest).requiredHostCapabilities, [
    'partnerNativeDocumentDeliveryV1',
  ]);
  assert.equal(
    spaceExtensionManifestSchema.safeParse({ ...manifest, hostApiVersion: 3 }).success,
    false,
  );
  assert.equal(
    spaceExtensionManifestSchema.safeParse({
      ...manifest,
      requiredHostCapabilities: ['unknownCapability'],
    }).success,
    false,
  );
  assert.equal(
    spaceExtensionManifestSchema.safeParse({
      ...manifest,
      requiredHostCapabilities: [
        'partnerNativeDocumentDeliveryV1',
        'partnerNativeDocumentDeliveryV1',
      ],
    }).success,
    false,
  );
});

test('expert workflows and retired presets require an explicit compatible host capability', () => {
  const manifest = {
    formatVersion: 1,
    hostApiVersion: 4,
    id: 'library',
    name: 'Library',
    description: '',
    version: '1.0.0',
    ui: { entry: 'ui/index.html', sha256: 'a'.repeat(64) },
  };
  const expert = {
    id: 'research',
    revision: 1,
    name: 'Research',
    description: '',
    prompt: 'Research',
  };
  const workflow = {
    inputs: ['Question'],
    deliverables: ['Report'],
    qualityChecks: ['Evidence'],
    connectorNeeds: [],
  };
  for (const fields of [{ retired: true }, { workflow }]) {
    const input = { ...manifest, experts: [{ ...expert, ...fields }] };
    assert.equal(spaceExtensionManifestSchema.safeParse(input).success, false);
    const compatible = { ...input, requiredHostCapabilities: ['partnerExpertWorkflowsV1'] };
    assert.equal(spaceExtensionManifestSchema.safeParse(compatible).success, true);
    assert.equal(
      spaceExtensionManifestSchema.safeParse({ ...compatible, hostApiVersion: 3 }).success,
      false,
    );
  }
});
