import type { SessionProductView } from '@kodax-space/space-ipc-schema';

export function productStreamingProgress(
  activity: SessionProductView['activity'],
  activeRunId?: string,
) {
  if (!activity?.streaming || activity.runId !== activeRunId) return undefined;
  const streaming = activity.streaming;
  return streaming.kind === 'thinking'
    ? { status: 'Thinking…', thinkingTokens: streaming.estimatedTokenCount }
    : {
        status: 'Receiving ' + streaming.toolName + '…',
        toolInputTokens: streaming.callId ? streaming.estimatedTokenCount : undefined,
      };
}
