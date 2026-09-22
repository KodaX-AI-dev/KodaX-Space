import { createRequire } from 'node:module';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { IpcMainInvokeEvent } from 'electron';
import { registerChannelWithEvent } from './register.js';
import { isRendererTarget } from './push.js';
import { getSpaceDataDir } from '../kodax/data-paths.js';
import { VoiceInstaller } from '../voice/installer.js';
import { voiceAssets, VOICE_COMPONENT_VERSION } from '../voice/manifest.js';
import { VOICE_LICENSES } from '../voice/licenses.js';
import { runWhisper, stopWhisper } from '../voice/runner.js';

const shutdown = new AbortController();
let installer: VoiceInstaller | undefined;
let active: { id: string; abort: AbortController } | null = null;
let removing = false;

function authorize(event: IpcMainInvokeEvent): void {
  if (!isRendererTarget(event.sender) || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Voice input is only available in the primary Space window');
  }
  if (shutdown.signal.aborted || removing) throw new Error('Voice component is unavailable');
}

export function registerVoiceChannels(): void {
  const req = typeof require === 'undefined' ? createRequire(import.meta.url) : require;
  const { net } = req('electron') as typeof import('electron');
  const directory = join(getSpaceDataDir(), 'voice', VOICE_COMPONENT_VERSION);
  const component = new VoiceInstaller(
    directory,
    voiceAssets(),
    async (signal) => {
      await runWhisper(directory, AbortSignal.any([signal, shutdown.signal]));
      await writeFile(join(directory, 'THIRD-PARTY-NOTICES.txt'), VOICE_LICENSES, { mode: 0o600 });
    },
    (input, options) =>
      net.fetch(input instanceof URL ? input.href : input, { ...options, credentials: 'omit' }),
  );
  installer = component;
  registerChannelWithEvent('voice.status', async (_input, event) => {
    authorize(event);
    return component.status();
  });
  registerChannelWithEvent('voice.install', (_input, event) => {
    authorize(event);
    if (active) throw new Error('Stop voice input before installing');
    void component.install();
    return { started: true };
  });
  registerChannelWithEvent('voice.cancelInstall', async (_input, event) => {
    authorize(event);
    await component.cancel();
    return undefined;
  });
  registerChannelWithEvent('voice.remove', async (_input, event) => {
    authorize(event);
    if (active) throw new Error('Stop voice input before removing the component');
    removing = true;
    try {
      await stopWhisper();
      await component.remove();
    } finally {
      removing = false;
    }
    return undefined;
  });
  registerChannelWithEvent('voice.transcribe', async (input, event) => {
    authorize(event);
    if (active) throw new Error('Voice recognition is already running');
    const job = { id: input.requestId, abort: new AbortController() };
    active = job;
    const cancel = (): void => job.abort.abort();
    event.sender.once('destroyed', cancel);
    event.sender.once('render-process-gone', cancel);
    const signal = AbortSignal.any([job.abort.signal, shutdown.signal]);
    try {
      if ((await component.status()).phase !== 'ready' || !(await component.verify())) {
        throw new Error('Install or repair the voice component in Settings');
      }
      signal.throwIfAborted();
      const text = await runWhisper(directory, signal, input);
      signal.throwIfAborted();
      return { requestId: input.requestId, text };
    } finally {
      event.sender.removeListener('destroyed', cancel);
      event.sender.removeListener('render-process-gone', cancel);
      if (active === job) active = null;
    }
  });
  registerChannelWithEvent('voice.cancelTranscription', (input, event) => {
    authorize(event);
    if (active?.id === input.requestId) active.abort.abort();
    return undefined;
  });
}

export async function disposeVoice(): Promise<void> {
  shutdown.abort();
  active?.abort.abort();
  await Promise.all([stopWhisper(), installer?.cancel()]);
}
