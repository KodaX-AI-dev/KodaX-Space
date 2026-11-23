import type { RepointelStatusOutput } from '@kodax-space/space-ipc-schema';

export type RepointelReadyMode = 'full' | 'light' | 'git';

/**
 * Engine readiness shown by the Repointel pill when no live trace exists. Under the
 * default `auto` mode the Host offers only the git-based repo tools and leaves the
 * semantic index off; that is a working state ("git"), not idle.
 */
export function repointelReadyMode(
  status: Pick<
    RepointelStatusOutput,
    'initialized' | 'engineStatus' | 'effectiveEngine' | 'configuredMode'
  > | null,
): RepointelReadyMode | undefined {
  if (!status || status.initialized === false) return undefined;
  if (status.engineStatus !== 'ok' && status.engineStatus !== 'limited') return undefined;
  if (status.effectiveEngine === 'full' || status.effectiveEngine === 'light') {
    return status.effectiveEngine;
  }
  return status.configuredMode === 'auto' && status.engineStatus === 'ok' ? 'git' : undefined;
}
