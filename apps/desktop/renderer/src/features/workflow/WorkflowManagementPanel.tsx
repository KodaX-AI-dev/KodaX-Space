import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { WorkflowLauncher } from './WorkflowLauncher.js';
import { WorkflowPanel, useSessionWorkflowRuns } from './WorkflowPanel.js';

/** Session execution view. Results stay in the conversation; no saved-run manager. */
export function WorkflowManagementPanel(): JSX.Element {
  const { t } = useI18n();
  const sessionId = useAppStore((s) => s.currentSessionId);
  const runtimeId = useAppStore((s) => s.runtimeConnection.runtimeId);
  const observation = useAppStore((s) => s.workflowObservationStatus);
  const stale = useAppStore((s) => s.workflowListStale);
  const runs = useSessionWorkflowRuns();
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const expectedRevision = useAppStore.getState().workflowObservationRevision;
    void window.kodaxSpace
      ?.invoke('workflow.list', { sessionId })
      .then((result) => {
        if (cancelled) return;
        useAppStore.getState().seedWorkflowRuns(result.ok ? result.data.runs : [], {
          stale: !result.ok || result.data.stale,
          expectedRevision,
        });
      })
      .catch(() => {
        if (!cancelled)
          useAppStore.getState().seedWorkflowRuns([], { stale: true, expectedRevision });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, runtimeId, refresh]);
  return (
    <div data-testid="workflow-management-panel" className="p-3 space-y-3 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{t('workflow.singleUseTitle')}</h2>
        <button
          type="button"
          aria-label={t('workflow.refreshListAria')}
          title={t('workflow.refreshList')}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <p className="text-xs text-fg-muted">{t('workflow.singleUseDescription')}</p>
      {(observation !== 'ready' || stale) && (
        <p role="status" className="text-xs text-warn">
          {t(
            observation === 'recovering' ? 'workflow.observationRecovering' : 'workflow.listStale',
          )}
        </p>
      )}
      <WorkflowLauncher />
      {runs.length === 0 && <p className="text-xs text-fg-muted">{t('workflow.noRuns')}</p>}
      {runs.map((run) => (
        <div key={run.runId} data-testid="workflow-run-list-item">
          <WorkflowPanel runs={[run]} variant="full" />
        </div>
      ))}
    </div>
  );
}
