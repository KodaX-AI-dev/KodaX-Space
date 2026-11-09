import type { MessageKey } from '../i18n/messages.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { SessionAwaitingIndicator } from '../features/session/SessionAwaitingIndicator.js';
import {
  ATTENTION_PRIORITY,
  type AttentionKind,
  type AttentionSummary,
} from '../features/session/sessionAttention.js';

const KIND_VIEW: Readonly<
  Record<AttentionKind, { readonly text: string; readonly dot: string; readonly label: MessageKey }>
> = {
  awaiting: { text: 'text-warn', dot: '', label: 'sidebar.attention.awaiting' },
  error: { text: 'text-danger', dot: 'bg-danger', label: 'sidebar.attention.error' },
  done: {
    text: 'text-ok',
    dot: 'bg-ok shadow-[0_0_0_2px_rgb(var(--ok)/0.12)]',
    label: 'sidebar.attention.done',
  },
};

/**
 * Collapsed-project summary: one marker in the colour of the most urgent kind, one total count.
 * The per-kind breakdown lives in the tooltip / accessible label.
 */
export function ProjectAttentionBadge({
  summary,
}: {
  readonly summary: AttentionSummary;
}): JSX.Element | null {
  const { t } = useI18n();
  if (summary.top === null) return null;
  const view = KIND_VIEW[summary.top];
  const label = ATTENTION_PRIORITY.filter((kind) => summary.counts[kind] > 0)
    .map((kind) => t(KIND_VIEW[kind].label, { count: summary.counts[kind] }))
    .join(' · ');
  return (
    <span
      className={`${view.text} text-[11px] flex-shrink-0 font-mono inline-flex items-center gap-1`}
      role="img"
      aria-label={label}
      title={label}
    >
      {summary.top === 'awaiting' ? (
        <SessionAwaitingIndicator mini decorative label={label} />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${view.dot}`} aria-hidden />
      )}
      {summary.total}
    </span>
  );
}
