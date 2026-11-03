export function createPackagedShellProbeToolInput(command, platform = process.platform) {
  // The SDK timeout covers Windows sandbox authorization, execution, and Job-drain attestation.
  return platform === 'win32' ? { command, timeout: 180 } : { command };
}

export function getPackagedShellProbeBackend(updates) {
  const observation = updates
    .map((update) => update?.observation)
    .filter(Boolean)
    .at(-1);
  if (observation?.version !== 1) return undefined;
  if (
    observation.state === 'applied' &&
    observation.policyId === 'kodax-workspace-shell-v1' &&
    ['windows-restricted-user', 'macos-seatbelt', 'linux-bubblewrap'].includes(observation.backend)
  )
    return observation.backend;
  if (
    observation.state === 'fallback' &&
    observation.execution === 'normal_permission_policy' &&
    [
      'not_ready',
      'prepare_failed',
      'backend_failed',
      'session_reset_pending',
      'acl_transition_pending',
    ].includes(observation.reason)
  )
    return 'normal-permission-policy';
  return undefined;
}
