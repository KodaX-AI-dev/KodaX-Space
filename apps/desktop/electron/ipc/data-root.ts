// dataRoot.* handlers — Settings > Preferences > Data location.
//
// Changing the root never moves or deletes data and never touches the CLI's view of
// ~/.kodax: it rewrites the Space-owned pointer (optionally after copying the current data
// into the new empty location) and restarts Space so the SDK, which freezes <root>/sessions
// at import, and every Space store start on the new root.

import { BrowserWindow, dialog } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { registerChannel } from './register.js';
import { getKodaxDir } from '../kodax/data-paths.js';
import { getDataRootPointerFile, getResolvedDataRoot } from '../kodax/data-root-bootstrap.js';
import type { DataRootChange } from '../kodax/data-root-change.js';
import {
  readDataRootPointer,
  validateDataRootCandidate,
  type DataRootCandidateResult,
} from '../kodax/data-root.js';

export interface DataRootChannelOptions {
  /**
   * Performs the change after a verified safe shutdown, then relaunches Space.
   * Resolves false when exit was cancelled or blocked by active work.
   */
  readonly requestRestart: (change: DataRootChange) => Promise<boolean>;
}

function rejection(checked: Extract<DataRootCandidateResult, { ok: false }>): {
  readonly reason: typeof checked.reason;
  readonly detail?: string;
} {
  return {
    reason: checked.reason,
    ...(checked.detail !== undefined ? { detail: checked.detail } : {}),
  };
}

export function registerDataRootChannels(options: DataRootChannelOptions): void {
  registerChannel('dataRoot.get', async () => {
    const resolved = getResolvedDataRoot();
    return {
      current: getKodaxDir(),
      source: resolved.source,
      defaultRoot: path.join(os.homedir(), '.kodax'),
      envRoot: resolved.envRoot,
      pointerRoot: readDataRootPointer(getDataRootPointerFile()).pointer?.root ?? null,
      editable: resolved.source !== 'test',
    };
  });

  registerChannel('dataRoot.choose', async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
    const result = parent
      ? await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    const picked = result.filePaths[0];
    if (result.canceled || picked === undefined) return { status: 'cancelled' as const };
    const checked = validateDataRootCandidate(picked, getKodaxDir());
    if (checked.ok) return { status: 'ok' as const, path: checked.root, hasData: checked.hasData };
    return { status: 'rejected' as const, path: picked, ...rejection(checked) };
  });

  registerChannel('dataRoot.apply', async (input) => {
    if (getResolvedDataRoot().source === 'test') {
      return { status: 'rejected' as const, reason: 'unusable' as const, detail: 'test mode' };
    }
    let change: DataRootChange = { target: null, copyFrom: null };
    if (input.path !== null) {
      // Re-validate at the IPC boundary; the renderer's earlier choose result is not trusted.
      const checked = validateDataRootCandidate(input.path, getKodaxDir());
      if (!checked.ok) return { status: 'rejected' as const, ...rejection(checked) };
      if (input.copyData && checked.hasData) {
        return { status: 'rejected' as const, reason: 'has_data' as const };
      }
      change = { target: checked.root, copyFrom: input.copyData ? getKodaxDir() : null };
    }
    const accepted = await options.requestRestart(change);
    return accepted ? { status: 'restarting' as const } : { status: 'blocked' as const };
  });
}
