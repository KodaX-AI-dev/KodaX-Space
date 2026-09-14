import { z } from 'zod';

export const windowActivityStateSchema = z.enum(['active', 'passive', 'hidden']);
export const windowControlActionSchema = z.enum(['minimize', 'toggleMaximize', 'close']);

export const PARTNER_BROWSER_FRAME_NAME_PREFIX = 'kodax-partner-browser-';
export const PARTNER_BROWSER_MAX_URL_LENGTH = 2_048;
export const PARTNER_BROWSER_PARTITION = 'persist:kodax-partner-browser-v1';

const partnerBrowserFrameNameSchema = z
  .string()
  .min(PARTNER_BROWSER_FRAME_NAME_PREFIX.length + 1)
  .max(128)
  .refine((value) => value.startsWith(PARTNER_BROWSER_FRAME_NAME_PREFIX));

const partnerBrowserUrlSchema = z
  .string()
  .max(PARTNER_BROWSER_MAX_URL_LENGTH)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        url.username === '' &&
        url.password === '' &&
        Boolean(url.hostname)
      );
    } catch {
      return false;
    }
  });

export const windowStateSchema = z.object({
  maximized: z.boolean(),
  minimized: z.boolean(),
  focused: z.boolean(),
});

export const windowStateChannel = {
  name: 'window.state',
  direction: 'invoke',
  input: z.undefined(),
  output: windowStateSchema,
} as const;

export const windowControlChannel = {
  name: 'window.control',
  direction: 'invoke',
  input: z.object({
    action: windowControlActionSchema,
  }),
  output: windowStateSchema,
} as const;

export const windowSetBadgeCountChannel = {
  name: 'window.setBadgeCount',
  direction: 'invoke',
  input: z
    .object({
      count: z.number().int().min(0).max(9999),
    })
    .strict(),
  output: z.object({
    applied: z.boolean(),
  }),
} as const;

export const windowActivityChannel = {
  name: 'window.activity',
  direction: 'push',
  payload: z.object({
    state: windowActivityStateSchema,
    active: z.boolean(),
    focused: z.boolean(),
    visible: z.boolean(),
    minimized: z.boolean(),
  }),
} as const;

export const windowCompleteExitProgressChannel = {
  name: 'window.completeExitProgress',
  direction: 'push',
  payload: z.object({
    active: z.boolean(),
  }),
} as const;

export const partnerBrowserNavigatedChannel = {
  name: 'partner.browserNavigated',
  direction: 'push',
  payload: z
    .object({
      frameName: partnerBrowserFrameNameSchema,
      url: partnerBrowserUrlSchema,
    })
    .strict(),
} as const;

export type WindowActivityStateT = z.infer<typeof windowActivityStateSchema>;
export type WindowActivityPayload = z.infer<typeof windowActivityChannel.payload>;
export type WindowCompleteExitProgressPayload = z.infer<
  typeof windowCompleteExitProgressChannel.payload
>;
export type PartnerBrowserNavigatedPayload = z.infer<typeof partnerBrowserNavigatedChannel.payload>;
export type WindowControlActionT = z.infer<typeof windowControlActionSchema>;
export type WindowSetBadgeCountInput = z.infer<typeof windowSetBadgeCountChannel.input>;
export type WindowStateT = z.infer<typeof windowStateSchema>;
