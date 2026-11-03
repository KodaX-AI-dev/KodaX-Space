import { useState } from 'react';
import { useAppStore } from '../../../store/appStore.js';
import { useI18n } from '../../../i18n/I18nProvider.js';

/** Taking back an input is explicit; a failed binding never submits a new model request. */
export function QueuedInputRecovery({
  localId,
  inputId,
  recovery,
}: {
  localId: string;
  inputId: string;
  recovery?: 'restoring' | 'ready' | 'unavailable' | 'blocked';
}) {
  const sessionId = useAppStore((state) => state.currentSessionId);
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function takeBack() {
    if (!sessionId || busy || !window.kodaxSpace) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await window.kodaxSpace.invoke('session.withdrawInput', {
        sessionId,
        inputId,
      });
      if (!result.ok) throw new Error(result.error.message);
      useAppStore.setState((state) => ({
        queuedUserMessagesBySession: {
          ...state.queuedUserMessagesBySession,
          [sessionId]: (state.queuedUserMessagesBySession[sessionId] ?? []).map((item) =>
            item.id === localId
              ? {
                  ...item,
                  content: result.data.text,
                  matchContent: result.data.text,
                  attachments: result.data.attachments,
                  admissionError: undefined,
                  status: 'failed' as const,
                  failureReason: undefined,
                  withdrawn: true as const,
                }
              : item,
          ),
        },
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2 text-xs">
      {recovery && recovery !== 'ready' && <div>{t(`message.queue.recovery.${recovery}`)}</div>}
      <button
        type="button"
        disabled={busy || recovery === 'unavailable' || recovery === 'restoring'}
        onClick={() => void takeBack()}
        className="underline disabled:opacity-50"
      >
        {t('message.queue.takeBack')}
      </button>
      {error && (
        <div role="alert" className="mt-1 text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
