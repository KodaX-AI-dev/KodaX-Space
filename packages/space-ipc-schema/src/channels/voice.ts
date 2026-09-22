import { z } from 'zod';

export const VOICE_MAX_SECONDS = 30;
export const VOICE_SAMPLE_RATE = 16000;
export const VOICE_MAX_BYTES = VOICE_MAX_SECONDS * VOICE_SAMPLE_RATE * 2;
export const voiceLanguageSchema = z.enum(['zh', 'en', 'auto']);
export type VoiceLanguage = z.infer<typeof voiceLanguageSchema>;
export const voiceStatusSchema = z
  .object({
    phase: z.enum(['checking', 'missing', 'installing', 'ready', 'failed', 'unsupported']),
    downloaded: z.number().nonnegative(),
    total: z.number().nonnegative(),
    error: z.enum(['download', 'integrity', 'runtime', 'storage']).nullable(),
  })
  .strict();
export type VoiceStatus = z.infer<typeof voiceStatusSchema>;
export const voiceRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    language: voiceLanguageSchema,
    pcm: z
      .instanceof(Uint8Array)
      .refine(
        (value) =>
          value.byteLength >= 3200 &&
          value.byteLength <= VOICE_MAX_BYTES &&
          value.byteLength % 2 === 0,
        'Expected bounded 16 kHz mono PCM16 audio',
      ),
  })
  .strict();
export const voiceInvokeChannels = {
  'voice.status': {
    name: 'voice.status',
    direction: 'invoke',
    input: z.undefined(),
    output: voiceStatusSchema,
  },
  'voice.install': {
    name: 'voice.install',
    direction: 'invoke',
    input: z.undefined(),
    output: z.object({ started: z.boolean() }),
  },
  'voice.cancelInstall': {
    name: 'voice.cancelInstall',
    direction: 'invoke',
    input: z.undefined(),
    output: z.undefined(),
  },
  'voice.remove': {
    name: 'voice.remove',
    direction: 'invoke',
    input: z.undefined(),
    output: z.undefined(),
  },
  'voice.transcribe': {
    name: 'voice.transcribe',
    direction: 'invoke',
    input: voiceRequestSchema,
    output: z.object({ requestId: z.string().uuid(), text: z.string().max(8000) }).strict(),
  },
  'voice.cancelTranscription': {
    name: 'voice.cancelTranscription',
    direction: 'invoke',
    input: z.object({ requestId: z.string().uuid() }).strict(),
    output: z.undefined(),
  },
} as const;
