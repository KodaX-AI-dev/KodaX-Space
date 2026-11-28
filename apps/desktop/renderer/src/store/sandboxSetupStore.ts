// Command sandbox status and setup, shared by the settings panel, the startup prompt and the
// floating progress card. Setup runs for minutes and the main process answers `sandbox.status`
// only after it ends, so every view reads this store instead of calling IPC while setup runs.

import type { SandboxSetupPhaseT, SandboxStatusT } from '@kodax-space/space-ipc-schema';
import { create } from 'zustand';
import { translateMessage } from '../i18n/I18nProvider.js';
import { requestSpaceVersionRefresh } from '../lib/versionEvents.js';
import { pushToast } from './toastStore.js';

export type SandboxBusy = 'load' | 'refresh' | 'setup' | null;
export type SandboxRequestError = 'load' | 'refresh' | 'setup' | null;

interface SandboxSetupState {
  readonly status: SandboxStatusT | null;
  readonly busy: SandboxBusy;
  readonly error: SandboxRequestError;
  readonly setupStartedAt: number | null;
  /** Where the running setup is; null until the SDK reports a phase. */
  readonly setupPhase: SandboxSetupPhaseT | null;
  /** The last setup did not finish; the progress card shows why until dismissed. */
  readonly setupFailed: boolean;
  load(): Promise<SandboxStatusT | null>;
  refresh(): Promise<void>;
  setup(): Promise<void>;
  dismissFailure(): void;
}

let loading: Promise<SandboxStatusT | null> | null = null;

export const useSandboxSetupStore = create<SandboxSetupState>((set, get) => ({
  status: null,
  busy: null,
  error: null,
  setupStartedAt: null,
  setupPhase: null,
  setupFailed: false,

  load: () => {
    const api = window.kodaxSpace;
    if (!api || get().busy === 'setup' || get().busy === 'refresh') {
      return Promise.resolve(get().status);
    }
    loading ??= (async () => {
      set({ busy: 'load', error: null });
      try {
        const result = await api.invoke('sandbox.status', undefined);
        if (!result.ok) {
          set({ error: 'load' });
          return null;
        }
        set({ status: result.data });
        return result.data;
      } catch {
        set({ error: 'load' });
        return null;
      } finally {
        set({ busy: null });
        loading = null;
      }
    })();
    return loading;
  },

  refresh: async () => {
    const api = window.kodaxSpace;
    if (!api || get().busy !== null) return;
    set({ busy: 'refresh', error: null });
    try {
      const result = await api.invoke('sandbox.refresh', undefined);
      if (result.ok) set({ status: result.data });
      else set({ error: 'refresh' });
      requestSpaceVersionRefresh();
    } catch {
      set({ error: 'refresh' });
    } finally {
      set({ busy: null });
    }
  },

  setup: async () => {
    const api = window.kodaxSpace;
    const status = get().status;
    if (!api || get().busy !== null || !status?.setup.canSetup) return;
    set({
      busy: 'setup',
      error: null,
      setupStartedAt: Date.now(),
      setupPhase: null,
      setupFailed: false,
    });
    const stopProgress = api.on('sandbox.setupProgress', ({ phase }) => set({ setupPhase: phase }));
    try {
      const result = await api.invoke('sandbox.setup', {
        expectedRevision: status.revision,
        confirmation: 'allow-sandbox-setup',
      });
      if (!result.ok) {
        set({ error: 'setup', setupFailed: true });
        const refreshed = await api.invoke('sandbox.refresh', undefined);
        if (refreshed.ok) set({ status: refreshed.data });
        return;
      }
      set({ status: result.data });
      const outcome = result.data.lastOperation?.outcome;
      if (outcome === 'ready') {
        pushToast(translateMessage('settings.sandbox.setupSucceeded'), 'success', 4000);
      } else if (outcome === 'cancelled') {
        pushToast(translateMessage('settings.sandbox.cancelled'), 'warning', 4000);
      } else {
        set({ setupFailed: true });
      }
    } catch {
      set({ error: 'setup', setupFailed: true });
    } finally {
      stopProgress();
      set({ busy: null, setupStartedAt: null, setupPhase: null });
      requestSpaceVersionRefresh();
    }
  },

  dismissFailure: () => set({ setupFailed: false }),
}));
