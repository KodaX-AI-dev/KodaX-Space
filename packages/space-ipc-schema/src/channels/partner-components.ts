import { z } from 'zod';

export const partnerComponentIdSchema = z.enum([
  'feishu-cli',
  'wecom-cli',
  'dingtalk-cli',
  'tencent-meeting-cli',
]);
export type PartnerComponentIdT = z.infer<typeof partnerComponentIdSchema>;
export const partnerComponentSchema = z
  .object({
    id: partnerComponentIdSchema,
    version: z.string().max(32),
    state: z.enum(['missing', 'ready', 'installing', 'cancelled', 'failed', 'unsupported']),
    error: z.string().max(280).optional(),
  })
  .strict();
export type PartnerComponentT = z.infer<typeof partnerComponentSchema>;
const identity = z.object({ id: partnerComponentIdSchema }).strict();
const result = z.object({ component: partnerComponentSchema }).strict();
export const partnerComponentInvokeChannels = {
  'partner.components.list': {
    name: 'partner.components.list',
    direction: 'invoke',
    input: z.object({ refresh: z.boolean().default(false) }).strict(),
    output: z.object({ components: z.array(partnerComponentSchema).max(4) }).strict(),
  },
  'partner.components.install': {
    name: 'partner.components.install',
    direction: 'invoke',
    input: identity,
    output: result,
  },
  'partner.components.cancel': {
    name: 'partner.components.cancel',
    direction: 'invoke',
    input: identity,
    output: result,
  },
} as const;
