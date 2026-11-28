import { registerChannel } from './register.js';
import { pushToRenderer } from './push.js';
import { getDiagnosticsLogger } from '../diagnostics/runtime.js';
import { updateSandboxSdkDoctorResult } from '../kodax/kodax-sdk-probe.js';
import { SandboxController, type SandboxSdkFacade } from '../kodax/sandbox-controller.js';
import { runSandboxSetupProcess } from '../kodax/sandbox-setup-process.js';

async function activateSandboxInSetupProcess(
  options: { readonly onProgress?: (phase: string) => void } = {},
): Promise<unknown> {
  const result = await runSandboxSetupProcess({ onPhase: options.onProgress });
  const detail = [result.thrown ?? result.error, ...result.diagnostics].filter(
    (line): line is string => typeof line === 'string' && line.length > 0,
  );
  if (result.thrown !== undefined) throw new Error(detail.join('\n'));
  return {
    status: result.status,
    attempted: result.attempted,
    ...(typeof result.code === 'string' ? { code: result.code } : {}),
    ...(result.status !== 'ready' && detail.length > 0 ? { error: detail.join('\n') } : {}),
  };
}

export const sandboxController = new SandboxController({
  loadSdk: async (): Promise<SandboxSdkFacade> => ({
    ...(await import('@kodax-ai/kodax/sandbox')),
    // Setup runs out of process so its minutes of synchronous work never freeze Space.
    activateKodaXSandbox: activateSandboxInSetupProcess,
  }),
  onDoctor: (capability, doctor) => {
    updateSandboxSdkDoctorResult(capability, doctor);
  },
  onSetupFailure: (error) => {
    getDiagnosticsLogger()?.warn('sandbox', 'setup.failed', error);
  },
  onSetupProgress: (phase) => {
    getDiagnosticsLogger()?.info('sandbox', 'setup.progress', phase);
    pushToRenderer('sandbox.setupProgress', { phase });
  },
});

export function registerSandboxChannels(): void {
  registerChannel('sandbox.status', async () => sandboxController.status());
  registerChannel('sandbox.refresh', async () => sandboxController.refresh());
  registerChannel('sandbox.setup', async (input) => sandboxController.setup(input));
}
