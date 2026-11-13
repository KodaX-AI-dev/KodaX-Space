// Data root (KodaX data location) channels — Settings > Preferences > Data location.
//
// The root resolves as test mode > Settings > KODAX_HOME > ~/.kodax. Changing it needs a
// restart because the SDK freezes <root>/sessions at import time.

import { z } from 'zod';

export const dataRootSourceSchema = z.enum(['test', 'setting', 'env', 'default']);

const absolutePathSchema = z.string().min(1).max(4096);

export const dataRootGetChannel = {
  name: 'dataRoot.get',
  direction: 'invoke',
  input: z.undefined(),
  output: z
    .object({
      /** Root this process is actually using. */
      current: absolutePathSchema,
      source: dataRootSourceSchema,
      /** `~/.kodax`, what "restore default" returns to when no environment value applies. */
      defaultRoot: absolutePathSchema,
      /** Valid absolute KODAX_HOME (or deprecated KODAX_PROFILE_DIR), if any. */
      envRoot: absolutePathSchema.nullable(),
      /** What the saved Settings pointer holds, even when it is currently unusable. */
      pointerRoot: absolutePathSchema.nullable(),
      /** True when the bundled KodaX SDK can copy a data root (offered as "copy current data"). */
      copySupported: z.boolean(),
      /** False in test mode, where the root is forced. */
      editable: z.boolean(),
    })
    .strict(),
} as const;

export const dataRootRejectionSchema = z.enum([
  'not_absolute',
  'same',
  'nested',
  'network',
  'unusable',
  'unrecognized',
  'has_data',
  'copy_unavailable',
  'incomplete_copy',
]);

export const dataRootChooseChannel = {
  name: 'dataRoot.choose',
  direction: 'invoke',
  input: z.undefined(),
  output: z.discriminatedUnion('status', [
    z.object({ status: z.literal('cancelled') }).strict(),
    z
      .object({
        status: z.literal('ok'),
        path: absolutePathSchema,
        /** The folder already holds KodaX data, so it is used as is and cannot be a copy target. */
        hasData: z.boolean(),
      })
      .strict(),
    z
      .object({
        status: z.literal('rejected'),
        path: absolutePathSchema,
        reason: dataRootRejectionSchema,
        detail: z.string().max(1024).optional(),
      })
      .strict(),
  ]),
} as const;

export const dataRootApplyChannel = {
  name: 'dataRoot.apply',
  direction: 'invoke',
  /** `path: null` restores the default location (clears the Settings pointer). */
  input: z
    .object({
      path: absolutePathSchema.nullable(),
      /** Copy the current data into the new (empty) location before switching. Ignored for restore. */
      copyData: z.boolean(),
    })
    .strict(),
  output: z.discriminatedUnion('status', [
    z.object({ status: z.literal('restarting') }).strict(),
    /** Exit was cancelled or blocked by active work; nothing was saved. */
    z.object({ status: z.literal('blocked') }).strict(),
    z
      .object({
        status: z.literal('rejected'),
        reason: dataRootRejectionSchema,
        detail: z.string().max(1024).optional(),
      })
      .strict(),
  ]),
} as const;

export type DataRootSource = z.infer<typeof dataRootSourceSchema>;
export type DataRootRejection = z.infer<typeof dataRootRejectionSchema>;
export type DataRootGetOutput = z.infer<typeof dataRootGetChannel.output>;
export type DataRootChooseOutput = z.infer<typeof dataRootChooseChannel.output>;
export type DataRootApplyOutput = z.infer<typeof dataRootApplyChannel.output>;
