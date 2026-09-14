import { z } from 'zod';
import { partnerConnectorConnectionSchema } from './partner-connector.js';

const identity = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
const owner = z.object({ extensionId: identity, connectorId: identity }).strict();
const jobIdentity = owner.extend({ id: z.string().uuid() });

/** Presentation-only state. Authorization links, codes and tokens stay in the trusted host. */
export const partnerConnectorOnboardingSchema = jobIdentity.extend({
  phase: z.enum([
    'preparing',
    'needs_install',
    'installing',
    'waiting_app',
    'waiting_authorization',
    'waiting_input',
    'verifying',
    'connected',
    'cancelled',
    'expired',
    'failed',
  ]),
  canReopen: z.boolean(),
  inputKind: z
    .enum([
      'mail_credentials',
      'authorization_complete',
      'slack_token',
      'github_token',
      'zoom_account',
    ])
    .optional(),
  expiresAt: z.string().datetime().optional(),
  error: z.string().max(280).optional(),
  connection: partnerConnectorConnectionSchema.optional(),
});
export type PartnerConnectorOnboardingT = z.infer<typeof partnerConnectorOnboardingSchema>;
const jobResult = z.object({ job: partnerConnectorOnboardingSchema }).strict();

const secret = z
  .string()
  .min(1)
  .max(8192)
  .regex(/^[^\s\u0000-\u001f\u007f]+$/);
export const partnerConnectorTokenSchema = z.object({ token: secret }).strict();
export const partnerConnectorZoomAccountSchema = z
  .object({
    accountId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    clientId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    clientSecret: secret,
  })
  .strict();
export const partnerConnectorOnboardingValueSchema = z.union([
  z
    .object({
      email: z.string().trim().email().max(254),
      authorizationCode: z
        .string()
        .min(1)
        .max(256)
        .regex(/^[^\s\u0000-\u001f\u007f]+$/),
    })
    .strict(),
  z.object({ confirmed: z.literal(true) }).strict(),
  partnerConnectorTokenSchema,
  partnerConnectorZoomAccountSchema,
]);
export type PartnerConnectorOnboardingValueT = z.infer<
  typeof partnerConnectorOnboardingValueSchema
>;
export const connectorOnboardingInvokeChannels = {
  'partner.connectors.accounts': {
    name: 'partner.connectors.accounts',
    direction: 'invoke',
    input: owner,
    output: z.object({ connections: z.array(partnerConnectorConnectionSchema).max(64) }).strict(),
  },
  'partner.connectors.onboarding.start': {
    name: 'partner.connectors.onboarding.start',
    direction: 'invoke',
    input: owner.extend({ installCli: z.boolean().default(false) }),
    output: jobResult,
  },
  'partner.connectors.onboarding.get': {
    name: 'partner.connectors.onboarding.get',
    direction: 'invoke',
    input: jobIdentity,
    output: jobResult,
  },
  'partner.connectors.onboarding.cancel': {
    name: 'partner.connectors.onboarding.cancel',
    direction: 'invoke',
    input: jobIdentity,
    output: jobResult,
  },
  'partner.connectors.onboarding.submit': {
    name: 'partner.connectors.onboarding.submit',
    direction: 'invoke',
    input: jobIdentity.extend({ value: partnerConnectorOnboardingValueSchema }),
    output: jobResult,
  },
  'partner.connectors.onboarding.reopen': {
    name: 'partner.connectors.onboarding.reopen',
    direction: 'invoke',
    input: jobIdentity,
    output: z.object({ ok: z.literal(true) }).strict(),
  },
} as const;

export const connectorOnboardingPushChannels = {
  'partner.connectors.onboarding.changed': {
    name: 'partner.connectors.onboarding.changed',
    direction: 'push',
    payload: jobResult,
  },
} as const;
