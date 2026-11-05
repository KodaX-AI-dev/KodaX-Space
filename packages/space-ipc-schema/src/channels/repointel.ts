import { z } from 'zod';

export const repointelStatusItemSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['ok', 'warn', 'blocked']),
  detail: z.string().min(1),
});

export const repointelStatusChannel = {
  name: 'repointel.status',
  direction: 'invoke',
  input: z.object({
    sessionId: z.string().min(1).max(256).optional(),
    projectRoot: z.string().min(1).max(4096).optional(),
    // The chip fetches with probe:false (cheap, config-only — no semantic-worker spawn)
    // to drive its always-on readiness pill; the /repointel status doctor view omits it
    // (defaults to a full probe:true health check). Defaults to true when absent.
    probe: z.boolean().optional(),
  }),
  output: z.object({
    projectRoot: z.string().min(1).nullable(),
    projectExists: z.boolean(),
    gitRoot: z.string().min(1).nullable(),
    traceSource: z.enum(['session-events']),
    warmSupported: z.boolean(),
    warmReason: z.string().min(1),
    // Repo-intelligence is a licensed capability: true only when a valid, active
    // license is present (isLicenseActive). When false, Space forces repo-intel
    // off and the UI shows a locked/upsell state instead of running it.
    entitled: z.boolean(),
    // Resolved engine mode + health from inspectRepoIntelligenceRuntime. The chip uses
    // these and initialized so the pill can reflect actual Host readiness instead of
    // a misleading "idle" whenever the current session simply hasn't invoked repo-intel
    // yet. null when the SDK inspection itself failed.
    effectiveEngine: z.enum(['off', 'light', 'full']).nullable(),
    engineStatus: z.enum(['disabled', 'ok', 'limited', 'unavailable', 'warming']).nullable(),
    initialized: z.boolean().optional(),
    runtimeId: z.string().min(1).optional(),
    diagnostics: z.array(repointelStatusItemSchema).min(1),
  }),
} as const;

// Best-effort repo-intelligence prewarm for a project. The composer fires this on the
// user's first keystroke (well-targeted: typing = imminent send) so the semantic index
// warms in the background during the typing window. Main gates it on license + git root;
// it is fire-and-forget (the SDK detaches the worker), so `started` just reports whether
// a warm was kicked off (false when unentitled / no git root).
export const repointelPrewarmChannel = {
  name: 'repointel.prewarm',
  direction: 'invoke',
  input: z.object({
    sessionId: z.string().min(1).max(256).optional(),
    projectRoot: z.string().min(1).max(4096),
  }),
  output: z.object({
    started: z.boolean(),
    runtimeId: z.string().min(1).optional(),
  }),
} as const;

export type RepointelStatusItemT = z.infer<typeof repointelStatusItemSchema>;
export type RepointelStatusOutput = z.infer<typeof repointelStatusChannel.output>;
