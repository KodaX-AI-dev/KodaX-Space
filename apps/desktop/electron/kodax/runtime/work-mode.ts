import type { KodaXProductClient } from '@kodax-ai/kodax/client';

type WorkModeHost = {
  readonly capabilities?: Readonly<Record<string, unknown>>;
  readonly sessions: Pick<
    KodaXProductClient['sessions'],
    'getSettingsVersioned' | 'updateSettingsVersioned'
  >;
};
type WorkMode = 'agent' | 'coding' | 'script';

function supportsWorkMode(host: WorkModeHost): boolean {
  const capability = host.capabilities?.sharedSessionSettings;
  return (
    typeof capability === 'object' &&
    capability !== null &&
    'keys' in capability &&
    Array.isArray(capability.keys) &&
    capability.keys.includes('workMode')
  );
}

export async function readSessionWorkMode(host: WorkModeHost, sessionId: string) {
  const settings = await host.sessions.getSettingsVersioned(sessionId);
  return {
    supported: supportsWorkMode(host),
    revision: settings.revision,
    workMode: settings.value.workMode ?? 'coding',
  };
}

export async function setSessionWorkMode(
  host: WorkModeHost,
  sessionId: string,
  workMode: WorkMode,
  expectedRevision: number,
) {
  if (!supportsWorkMode(host))
    throw Object.assign(new Error('This Host requires an upgrade to support work modes.'), {
      code: 'daemon_upgrade_required',
    });
  // The Host owns safe-idle validation. Never retry a stale user's choice against a newer revision.
  await host.sessions.updateSettingsVersioned(sessionId, { workMode }, { expectedRevision });
  return readSessionWorkMode(host, sessionId);
}
