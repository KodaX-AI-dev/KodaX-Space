import { useProductSessionTranscript } from '../store/productSessionView.js';
import { useAppStore } from '../store/appStore.js';
import { useI18n } from '../i18n/I18nProvider.js';

/** Actual Run facts are separate from the composer's next-input selections. */
export function ExecutionFactsIndicator(): JSX.Element | null {
  const { effectiveLocale: locale } = useI18n();
  const id = useAppStore((s) => s.currentSessionId);
  const live = useAppStore((s) => (id ? s.liveProjectionBySession[id] : undefined));
  const view = useProductSessionTranscript(id ?? '')?.view;
  const run = live?.activeRun;
  if (!run) return null;
  const reasoning = view?.activity?.runId === run.runId ? view.activity.reasoning : undefined;
  const unknown = locale === 'zh-CN' ? '未知' : 'unknown';
  const details = [
    `${locale === 'zh-CN' ? '本次执行' : 'Current execution'}: ${run.effectiveConfig?.workMode ?? run.workMode ?? unknown}`,
    `${locale === 'zh-CN' ? '工具' : 'Tools'}: ${run.effectiveConfig?.toolScope.join(', ') ?? unknown}`,
    ...(reasoning
      ? [
          `${reasoning.provider}/${reasoning.model}: ${reasoning.requestedEffort} → ${reasoning.sentEffort ?? unknown} (${locale === 'zh-CN' ? '发送参数，服务端未验证' : 'wire parameter; server unverified'})`,
          ...reasoning.fallbacks.map((value) => value.reason),
        ]
      : []),
  ];
  return (
    <span
      data-testid="execution-facts"
      className="text-xs text-fg-tertiary truncate max-w-44"
      title={details.join('\n')}
    >
      {run.effectiveConfig?.workMode ?? run.workMode ?? unknown}
      {reasoning ? ` · ${reasoning.requestedEffort} → ${reasoning.sentEffort ?? unknown}` : ''}
    </span>
  );
}
