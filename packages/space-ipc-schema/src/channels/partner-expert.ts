import { z } from 'zod';
import { skillMetaSchema } from './skill.js';

const identity = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);

export const spaceExpertTypeSchema = z.enum(['role', 'task', 'platform']);
export const spaceExpertListingTypeSchema = z.enum(['expert', 'team']);
export const spaceExpertCategorySchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((category) => !['全部', '专家团', 'all', 'team'].includes(category), {
    message: 'Category conflicts with a reserved expert filter',
  });

const uniqueIds = (items: ReadonlyArray<{ id: string }>): boolean =>
  new Set(items.map((item) => item.id)).size === items.length;

export const spaceExpertCapabilityActionSchema = z
  .object({
    id: identity,
    label: z.string().trim().min(1).max(40),
    description: z.string().trim().min(1).max(160).optional(),
    requiredConnectorIds: z
      .array(identity)
      .min(1)
      .max(4)
      .refine((ids) => new Set(ids).size === ids.length, 'Connector references must be unique'),
    promptTemplate: z.string().trim().min(1).max(1_024),
  })
  .strict();
export type SpaceExpertCapabilityActionT = z.infer<typeof spaceExpertCapabilityActionSchema>;

export const spaceExpertCapabilityGroupSchema = z
  .object({
    id: identity,
    label: z.string().trim().min(1).max(40),
    description: z.string().trim().min(1).max(160).optional(),
    actions: z
      .array(spaceExpertCapabilityActionSchema)
      .min(1)
      .max(12)
      .refine(uniqueIds, 'Capability action IDs must be unique within a group'),
  })
  .strict();
export type SpaceExpertCapabilityGroupT = z.infer<typeof spaceExpertCapabilityGroupSchema>;

export const spaceExpertCapabilityGuideSchema = z
  .object({
    groups: z
      .array(spaceExpertCapabilityGroupSchema)
      .min(1)
      .max(12)
      .refine(uniqueIds, 'Capability group IDs must be unique'),
  })
  .strict();
export type SpaceExpertCapabilityGuideT = z.infer<typeof spaceExpertCapabilityGuideSchema>;

const workflowItems = z.array(z.string().trim().min(1).max(512)).min(1).max(8);
/** Work expectations, never executable tools, account grants, or an orchestration graph. */
export const spaceExpertWorkflowSchema = z
  .object({
    inputs: workflowItems,
    deliverables: workflowItems,
    qualityChecks: workflowItems,
    connectorNeeds: z
      .array(
        z
          .object({
            operation: z.enum(['read', 'search', 'append', 'createDocument', 'createBase']),
            required: z.boolean(),
            reason: z.string().trim().min(1).max(280),
          })
          .strict(),
      )
      .max(5)
      .refine(
        (needs) => new Set(needs.map((need) => need.operation)).size === needs.length,
        'Connector operations must be unique',
      ),
  })
  .strict();

/** Skill is an optional explicit existing name, never an installation or discovery rule. */
const spaceExpertDefinitionFieldsSchema = z
  .object({
    id: identity,
    revision: z.number().int().min(1).max(1_000_000),
    name: z.string().trim().min(1).max(80),
    description: z.string().max(280),
    prompt: z.string().trim().min(1).max(8_000),
    starterTasks: z.array(z.string().min(1).max(512)).max(4).default([]),
    skillRef: skillMetaSchema.shape.name.optional(),
    workflow: spaceExpertWorkflowSchema.optional(),
    /** Hidden from new selection; existing session snapshots remain usable. */
    retired: z.boolean().optional(),
    /** Display-only catalog taxonomy; these fields do not grant tools or enable orchestration. */
    expertType: spaceExpertTypeSchema.optional(),
    category: spaceExpertCategorySchema.optional(),
    listingType: spaceExpertListingTypeSchema.optional(),
    /** Display-only task drafting metadata; connector authorization remains host-owned. */
    capabilityGuide: spaceExpertCapabilityGuideSchema.optional(),
  })
  .strict();
export const spaceExpertDefinitionSchema = spaceExpertDefinitionFieldsSchema;
export type SpaceExpertDefinitionT = z.infer<typeof spaceExpertDefinitionSchema>;

/** The host assigns stable identity and revision; an editor submits content only. */
export const spaceExpertDraftSchema = spaceExpertDefinitionFieldsSchema
  .omit({ id: true, revision: true, capabilityGuide: true, retired: true })
  .extend({
    category: spaceExpertCategorySchema.nullable().optional(),
    workflow: spaceExpertWorkflowSchema.nullable().optional(),
  });
export type SpaceExpertDraftT = z.infer<typeof spaceExpertDraftSchema>;

export const spaceExpertSaveInputSchema = z
  .object({
    extensionId: identity,
    expertId: identity.optional(),
    expectedRevision: z.number().int().min(1).max(1_000_000).optional(),
    values: spaceExpertDraftSchema,
  })
  .strict()
  .refine((input) => (input.expertId === undefined) === (input.expectedRevision === undefined), {
    message: 'Editing requires both the expert identity and its expected revision',
  });
export type SpaceExpertSaveInputT = z.infer<typeof spaceExpertSaveInputSchema>;

export const spaceExpertRefSchema = z
  .object({
    extensionId: identity,
    expertId: identity,
    revision: z.number().int().min(1).max(1_000_000),
    useSkill: z.boolean().optional(),
  })
  .strict();
export type SpaceExpertRefT = z.infer<typeof spaceExpertRefSchema>;

export const partnerExpertSnapshotSchema = z
  .object({
    extensionId: identity,
    extensionVersion: z.string().min(1).max(64),
    expert: spaceExpertDefinitionSchema,
    useSkill: z.boolean().optional(),
  })
  .strict();
export type PartnerExpertSnapshotT = z.infer<typeof partnerExpertSnapshotSchema>;

export const spaceExtensionsCatalogChannel = {
  name: 'space.extensions.catalog',
  direction: 'invoke',
  input: z.object({ extensionId: identity }).strict(),
  output: z.object({ experts: z.array(spaceExpertDefinitionSchema).max(256) }).strict(),
} as const;

export const spaceExtensionsResolveExpertChannel = {
  name: 'space.extensions.resolveExpert',
  direction: 'invoke',
  input: spaceExpertRefSchema,
  output: z.object({ expert: partnerExpertSnapshotSchema }).strict(),
} as const;

export const spaceExtensionsExpertSaveChannel = {
  name: 'space.extensions.expert.save',
  direction: 'invoke',
  input: spaceExpertSaveInputSchema,
  output: z.object({ expert: spaceExpertDefinitionSchema }).strict(),
} as const;

export const spaceExtensionsExpertDeleteChannel = {
  name: 'space.extensions.expert.delete',
  direction: 'invoke',
  input: spaceExpertRefSchema,
  output: z.object({ ok: z.literal(true) }).strict(),
} as const;

export const partnerExpertStateSchema = z
  .object({
    expert: partnerExpertSnapshotSchema.nullable(),
    available: z.boolean(),
    unavailableReason: z.string().max(280).optional(),
  })
  .strict();
export type PartnerExpertStateT = z.infer<typeof partnerExpertStateSchema>;

export const sessionPartnerExpertGetChannel = {
  name: 'session.partnerExpert.get',
  direction: 'invoke',
  input: z.object({ sessionId: z.string().min(1).max(128) }).strict(),
  output: partnerExpertStateSchema,
} as const;

export const sessionPartnerExpertSetChannel = {
  name: 'session.partnerExpert.set',
  direction: 'invoke',
  input: z
    .object({
      sessionId: z.string().min(1).max(128),
      expert: spaceExpertRefSchema.nullable(),
    })
    .strict(),
  output: partnerExpertStateSchema,
} as const;

export const sessionPartnerExpertChangedChannel = {
  name: 'session.partnerExpert.changed',
  direction: 'push',
  payload: z
    .object({ sessionId: z.string().min(1).max(128), state: partnerExpertStateSchema })
    .strict(),
} as const;
