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
  const locked = 'workModeLocked' in settings ? settings.workModeLocked : undefined;
  return {
    supported: supportsWorkMode(host) && typeof locked === 'boolean',
    revision: settings.revision,
    workMode: settings.value.workMode ?? 'coding',
    locked: locked !== false,
  };
}

export async function setSessionWorkMode(
  host: WorkModeHost,
  sessionId: string,
  workMode: WorkMode,
  expectedRevision: number,
) {
  const current = await readSessionWorkMode(host, sessionId);
  if (!current.supported)
    throw Object.assign(new Error('This Host requires an upgrade to support work modes.'), {
      code: 'daemon_upgrade_required',
    });
  if (current.locked && current.workMode !== workMode)
    throw Object.assign(
      new Error(
        'Work mode is fixed after the first run. Start a new session to choose another mode.',
      ),
      {
        code: 'conflict',
      },
    );
  // The Host atomically enforces the first-run boundary and the expected revision.
  await host.sessions.updateSettingsVersioned(sessionId, { workMode }, { expectedRevision });
  return readSessionWorkMode(host, sessionId);
}
