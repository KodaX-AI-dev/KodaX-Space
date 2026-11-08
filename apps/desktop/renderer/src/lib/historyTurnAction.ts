import type { ChannelInput, ChannelOutput, SessionMeta } from '@kodax-space/space-ipc-schema';
import { sessionResolveHistoryTurnChannel } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../i18n/messages.js';
import { useAppStore } from '../store/appStore.js';
import { useSurfaceStore } from '../store/surface.js';
import { requestConfirm } from '../store/confirmStore.js';
import { pushToast } from '../store/toastStore.js';
import {
  invalidateSessionHistoryPaging,
  restoreNewestSessionHistory,
} from '../shell/sessionHistoryPaging.js';
import { shouldActivateSessionForCurrentScope } from './sessionActivation.js';

type Selector = ChannelInput<'session.resolveHistoryTurn'>['selector'];
type Target = Extract<ChannelOutput<'session.resolveHistoryTurn'>, { status: 'ready' }>;
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
const pending = new Set<string>();
const unavailableReason: Readonly<Record<string, MessageKey | undefined>> = {
  no_previous_turn: 'menu.session.noEarlierTurn',
  no_turns: 'session.turnEmpty',
  turn_not_found: 'session.turnIndexMissing',
  unresolved_history: 'session.turnHistoryIncomplete',
  not_canonical: 'session.turnNotOnBranch',
};

export function usesProductHistoryActions(session: SessionMeta | undefined): boolean {
  return session !== undefined && session.provider !== 'mock' && session.surface !== 'partner';
}

export function commandHistoryTurnSelector(
  args: readonly string[],
  action: 'fork' | 'rewind',
): Selector | undefined {
  if (!args.length) return { kind: action === 'fork' ? 'latest' : 'previous' };
  if (args.length !== 1 || !/^\d+$/.test(args[0]!)) return undefined;
  const selected = sessionResolveHistoryTurnChannel.input.shape.selector.safeParse({
    kind: 'index',
    index: Number(args[0]),
  });
  return selected.success ? selected.data : undefined;
}

export async function performHistoryTurnAction(
  session: SessionMeta,
  action: 'fork' | 'rewind',
  selector: Selector,
  t: Translate,
): Promise<void> {
  const bridge = window.kodaxSpace;
  if (!bridge || pending.has(session.sessionId)) return;
  pending.add(session.sessionId);
  const { currentSessionId, currentProjectPath } = useAppStore.getState();
  const surface = useSurfaceStore.getState().currentSurface;
  let scopeChanged = false;
  const trackScope = () => {
    const current = useAppStore.getState();
    scopeChanged ||=
      current.currentSessionId !== currentSessionId ||
      current.currentProjectPath !== currentProjectPath ||
      useSurfaceStore.getState().currentSurface !== surface;
  };
  const unsubscribeApp = useAppStore.subscribe(trackScope);
  const unsubscribeSurface = useSurfaceStore.subscribe(trackScope);
  const stillHere = () => !scopeChanged;
  try {
    const result = await bridge.invoke('session.resolveHistoryTurn', {
      sessionId: session.sessionId,
      selector,
    });
    if (!stillHere()) return;
    if (!result.ok) throw new Error(result.error.message);
    const target = result.data;
    if (target.status !== 'ready') {
      const key =
        target.status === 'unsupported'
          ? 'session.turnUnsupported'
          : target.status === 'stale'
            ? 'session.turnChanged'
            : (unavailableReason[target.reason ?? ''] ?? 'session.turnUnavailable');
      pushToast(t(key), 'warning');
      return;
    }
    if (action === 'fork') await forkResolvedTurn(session, target, t, stillHere);
    else await rewindResolvedTurn(session, selector, target, t, stillHere);
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common.unknownError');
    pushToast(
      t(action === 'fork' ? 'menu.session.forkFailed' : 'menu.session.rewindFailed', { message }),
      'error',
    );
  } finally {
    unsubscribeApp();
    unsubscribeSurface();
    pending.delete(session.sessionId);
  }
}

function ipcBoundary(target: Target) {
  return {
    boundaryId: target.historyBoundary.entryId,
    sourceRevision: target.historyBoundary.sourceRevision,
  };
}

async function forkResolvedTurn(
  session: SessionMeta,
  target: Target,
  t: Translate,
  stillHere: () => boolean,
): Promise<void> {
  if (target.activeRunId !== null) {
    pushToast(t('session.turnForkBusy'), 'warning');
    return;
  }
  const result = await window.kodaxSpace!.invoke('session.fork', {
    sessionId: session.sessionId,
    forkPointTurnIdx: target.turnIndex,
    historyBoundary: ipcBoundary(target),
  });
  if (!result.ok) throw new Error(result.error.message);
  const child: SessionMeta = {
    sessionId: result.data.newSessionId,
    parentSessionId: session.sessionId,
    projectRoot: session.projectRoot,
    surface: session.surface,
    provider: session.provider,
    agentMode: session.agentMode,
    permissionMode: session.permissionMode,
    reasoningMode: session.reasoningMode,
    forkPointTurnIdx: target.turnIndex,
    title: session.title
      ? `${session.title.replace(/( \(fork\))+$/, '')} (fork)`
      : t('menu.session.forkedTitle'),
    createdAt: result.data.createdAt,
    lastActivityAt: result.data.createdAt,
  };
  const state = useAppStore.getState();
  state.upsertSession(child);
  if (
    stillHere() &&
    shouldActivateSessionForCurrentScope(child, {
      currentProjectPath: state.currentProjectPath,
      currentSurface: useSurfaceStore.getState().currentSurface,
    })
  ) {
    state.setCurrentSession(child.sessionId);
    pushToast(
      t('session.turnForkCreated', { turn: target.turnIndex + 1, excerpt: target.excerpt }),
      'info',
    );
  }
}

async function rewindResolvedTurn(
  session: SessionMeta,
  selector: Selector,
  target: Target,
  t: Translate,
  stillHere: () => boolean,
): Promise<void> {
  if (!target.hasLaterTurn) {
    pushToast(t('session.turnNoLater'), 'info');
    return;
  }
  if (
    !(await requestConfirm({
      title: t('menu.session.rewindToTurnTitle'),
      message: t('session.turnConfirm', { excerpt: target.excerpt }),
      confirmLabel: t(
        target.activeRunId ? 'session.turnStopRewind' : 'menu.session.rewindToTurnConfirm',
      ),
      danger: true,
    }))
  )
    return;
  if (!stillHere()) return;
  const result = await window.kodaxSpace!.invoke('session.rewind', {
    sessionId: session.sessionId,
    rewindPastTurnIdx: target.turnIndex,
    historyBoundary: ipcBoundary(target),
    confirmedTurn: { selector, expectedHead: target.expectedHead, activeRunId: target.activeRunId },
  });
  if (!result.ok) throw new Error(result.error.message);
  if (!result.data.ok || !result.data.diskRewound) {
    const reason = result.data.reason;
    const key =
      reason === 'target_changed'
        ? 'session.turnChanged'
        : reason === 'stop_unconfirmed'
          ? 'session.turnStopUnconfirmed'
          : reason === 'stopped_history_changed'
            ? 'session.turnStoppedConflict'
            : reason === 'stopped_write_unknown'
              ? 'session.turnStoppedUnknown'
              : reason === 'write_unknown'
                ? 'session.turnWriteUnknown'
                : 'menu.session.rewindDiskNotRewound';
    pushToast(t(key), 'warning');
    return;
  }
  invalidateSessionHistoryPaging(session.sessionId);
  if (useAppStore.getState().currentSessionId === session.sessionId) {
    try {
      await restoreNewestSessionHistory(session.sessionId, 'code');
    } catch {
      pushToast(t('session.turnRefreshFailed'), 'warning');
    }
  }
}
