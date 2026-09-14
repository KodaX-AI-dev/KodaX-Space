import { z } from 'zod';
import { spaceExpertDefinitionSchema } from './partner-expert.js';
import { spaceConnectorDefinitionSchema } from './partner-connector.js';

/** This route is an opaque sandboxed child document, never the trusted app frame. */
export const SPACE_EXTENSION_FRAME_URL = 'app://space/__space-extension-frame';
export const SPACE_EXTENSION_FRAME_MESSAGE_TYPE = 'space-extension.document.v1';
export const SPACE_EXTENSION_MAX_HTML_BYTES = 2 * 1024 * 1024;
/** Raw UTF-8 HTML is bounded above; the host adds a small ASCII policy envelope. */
export const SPACE_EXTENSION_MAX_FRAME_DOCUMENT_CHARACTERS = SPACE_EXTENSION_MAX_HTML_BYTES + 1024;

export const spaceExtensionIdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);

export const spaceExtensionHostCapabilitySchema = z.enum([
  'partnerNativeDocumentDeliveryV1',
  'partnerExpertWorkflowsV1',
]);
export type SpaceExtensionHostCapabilityT = z.infer<typeof spaceExtensionHostCapabilitySchema>;

export const spaceExtensionManifestSchema = z
  .object({
    formatVersion: z.literal(1),
    hostApiVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    id: spaceExtensionIdSchema,
    name: z.string().trim().min(1).max(80),
    description: z.string().max(280),
    version: z
      .string()
      .max(64)
      .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
    ui: z
      .object({
        entry: z.literal('ui/index.html'),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    // Capability entries are admitted as each implemented host contract is added.
    // Never accept arbitrary executable declarations or a second Skill installer.
    requiredHostCapabilities: z.array(spaceExtensionHostCapabilitySchema).max(16).default([]),
    experts: z.array(spaceExpertDefinitionSchema).max(128).default([]),
    connectors: z.array(spaceConnectorDefinitionSchema).max(64).default([]),
  })
  .strict()
  .refine(
    (manifest) =>
      manifest.experts.every(
        (expert) => expert.workflow === undefined && expert.retired === undefined,
      ) || manifest.requiredHostCapabilities.includes('partnerExpertWorkflowsV1'),
    {
      message: 'Expert workflows and retirement require partnerExpertWorkflowsV1',
      path: ['requiredHostCapabilities'],
    },
  )
  .refine(
    (manifest) =>
      manifest.hostApiVersion >= 2 ||
      manifest.experts.every(
        (expert) =>
          expert.expertType === undefined &&
          expert.category === undefined &&
          expert.listingType === undefined,
      ),
    {
      message: 'Expert catalog taxonomy requires host API version 2',
      path: ['hostApiVersion'],
    },
  )
  .refine(
    (manifest) =>
      manifest.hostApiVersion >= 3 ||
      manifest.experts.every((expert) => expert.capabilityGuide === undefined),
    {
      message: 'Expert capability guides require host API version 3',
      path: ['hostApiVersion'],
    },
  )
  .refine(
    (manifest) => manifest.requiredHostCapabilities.length === 0 || manifest.hostApiVersion >= 4,
    {
      message: 'Host capabilities require host API version 4',
      path: ['hostApiVersion'],
    },
  )
  .refine(
    (manifest) =>
      new Set(manifest.requiredHostCapabilities).size === manifest.requiredHostCapabilities.length,
    {
      message: 'Host capabilities must be unique',
      path: ['requiredHostCapabilities'],
    },
  )
  .refine(
    (manifest) =>
      new Set(manifest.experts.map((expert) => expert.id)).size === manifest.experts.length,
    {
      message: 'Expert IDs must be unique within a Space Extension',
      path: ['experts'],
    },
  )
  .refine(
    (manifest) => {
      const connectorIds = new Set(manifest.connectors.map((connector) => connector.id));
      return manifest.experts.every(
        (expert) =>
          expert.capabilityGuide?.groups.every((group) =>
            group.actions.every((action) =>
              action.requiredConnectorIds.every((connectorId) => connectorIds.has(connectorId)),
            ),
          ) ?? true,
      );
    },
    {
      message: 'Expert capability guides can only reference connectors in the same extension',
      path: ['experts'],
    },
  )
  .refine(
    (manifest) =>
      new Set(manifest.connectors.map((connector) => connector.id)).size ===
      manifest.connectors.length,
    {
      message: 'Connector IDs must be unique within a Space Extension',
      path: ['connectors'],
    },
  )
  .refine((manifest) => manifest.experts.every((expert) => !expert.id.startsWith('user.')), {
    message: 'The user. expert namespace is reserved for host-managed expert copies',
    path: ['experts'],
  });

export type SpaceExtensionManifestT = z.infer<typeof spaceExtensionManifestSchema>;

export const spaceExtensionSchema = z
  .object({
    id: spaceExtensionIdSchema,
    name: z.string().min(1).max(80),
    description: z.string().max(280),
    version: z.string().min(1).max(64),
    enabled: z.boolean(),
    installedAt: z.number().int().nonnegative(),
    expertCount: z.number().int().min(0).max(128),
    connectorCount: z.number().int().min(0).max(64),
  })
  .strict();

export type SpaceExtensionT = z.infer<typeof spaceExtensionSchema>;

const extensionsPayload = z.object({ extensions: z.array(spaceExtensionSchema).max(128) }).strict();
const extensionInput = z.object({ extensionId: spaceExtensionIdSchema }).strict();

export const spaceExtensionsListChannel = {
  name: 'space.extensions.list',
  direction: 'invoke',
  input: z.object({}).strict(),
  output: extensionsPayload,
} as const;

export const spaceExtensionsInstallChannel = {
  name: 'space.extensions.install',
  direction: 'invoke',
  input: z.object({ filePath: z.string().min(1).max(4096).optional() }).strict(),
  output: z.union([
    z.object({ cancelled: z.literal(true) }).strict(),
    z.object({ extension: spaceExtensionSchema }).strict(),
  ]),
} as const;

export const spaceExtensionsSetEnabledChannel = {
  name: 'space.extensions.setEnabled',
  direction: 'invoke',
  input: extensionInput.extend({ enabled: z.boolean() }),
  output: z.object({ extension: spaceExtensionSchema }).strict(),
} as const;

export const spaceExtensionsUninstallChannel = {
  name: 'space.extensions.uninstall',
  direction: 'invoke',
  input: extensionInput,
  output: z.object({ ok: z.literal(true) }).strict(),
} as const;

export const spaceExtensionsViewChannel = {
  name: 'space.extensions.view',
  direction: 'invoke',
  input: extensionInput,
  output: z
    .object({
      extension: spaceExtensionSchema,
      html: z.string().max(SPACE_EXTENSION_MAX_HTML_BYTES),
    })
    .strict(),
} as const;

export const spaceExtensionsChangedChannel = {
  name: 'space.extensions.changed',
  direction: 'push',
  payload: extensionsPayload,
} as const;
