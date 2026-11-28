import type { SessionMeta } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../i18n/messages.js';
import { useAppStore } from '../store/appStore.js';
import { useSurfaceStore } from '../store/surface.js';
import { pushToast } from '../store/toastStore.js';
import { shouldActivateSessionForCurrentScope } from './sessionActivation.js';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;
const pending = new Set<string>();

/**
 * SDK rc.5 failureDetail.historyRejected: Runtime derives a new Session from a summary of
 * this one (no model call) and Space switches to it. The source Session is left unchanged.
 */
export async function recoverSessionFromSummary(sessionId: string, t: Translate): Promise<void> {
  const bridge = window.kodaxSpace;
  const source = useAppStore.getState().sessions.find((s) => s.sessionId === sessionId);
  if (!bridge || !source || pending.has(sessionId)) return;
  pending.add(sessionId);
  try {
    const result = await bridge.invoke('session.recover', { sessionId });
    if (!result.ok) throw new Error(result.error.message);
    const child: SessionMeta = {
      sessionId: result.data.newSessionId,
      parentSessionId: sessionId,
      projectRoot: source.projectRoot,
      surface: source.surface,
      provider: source.provider,
      agentMode: source.agentMode,
      permissionMode: source.permissionMode,
      reasoningMode: source.reasoningMode,
      ...(result.data.title ? { title: result.data.title } : {}),
      createdAt: result.data.createdAt,
      lastActivityAt: result.data.createdAt,
    };
    const state = useAppStore.getState();
    state.upsertSession(child);
    if (
      state.currentSessionId === sessionId &&
      shouldActivateSessionForCurrentScope(child, {
        currentProjectPath: state.currentProjectPath,
        currentSurface: useSurfaceStore.getState().currentSurface,
      })
    ) {
      state.setCurrentSession(child.sessionId);
    }
    pushToast(t('session.recoverCreated'), 'info');
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common.unknownError');
    pushToast(t('session.recoverFailed', { message }), 'error');
  } finally {
    pending.delete(sessionId);
  }
}
