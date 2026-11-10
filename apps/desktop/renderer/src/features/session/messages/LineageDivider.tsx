import type { ReactNode } from 'react';
import {
  ChevronRight,
  ChevronsUpDown,
  FoldVertical,
  GitBranch,
  type LucideIcon,
} from 'lucide-react';
import { DisclosurePart, useRowDisclosure } from './rowDisclosure.js';

export type LineageKind = 'branch_summary' | 'compaction' | 'history_truncation';

const LINEAGE_ICON: Readonly<Record<LineageKind, LucideIcon>> = {
  compaction: FoldVertical,
  branch_summary: GitBranch,
  history_truncation: ChevronsUpDown,
};

const LINE = <span className="h-px flex-1 bg-border-default" aria-hidden />;

function DividerRow({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-fg-muted">
      {LINE}
      {children}
      {LINE}
    </div>
  );
}

/**
 * History lineage (compaction, branch return, omitted items) explains what happened to the
 * conversation rather than being part of it, so it reads as a thin labelled divider. A branch
 * summary stays collapsed behind its label — it is context for the agent, rarely for the user.
 */
export function LineageDivider({
  kind,
  label,
  detail,
}: {
  readonly kind: LineageKind;
  readonly label: string;
  readonly detail?: string;
}): JSX.Element {
  const Icon = LINEAGE_ICON[kind];
  const [detailOpen, setDetailOpen] = useRowDisclosure(DisclosurePart.lineageDetail, false);
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} aria-hidden />
      <span>{label}</span>
    </>
  );
  const frame = {
    'data-testid': 'system-notice',
    'data-notice-variant': 'lineage',
    className: 'notice-in',
  } as const;

  if (!detail) {
    return (
      <div {...frame} role="separator" aria-label={label}>
        <DividerRow>
          <span className="inline-flex min-w-0 items-center gap-1.5 px-1.5">{content}</span>
        </DividerRow>
      </div>
    );
  }
  return (
    <div {...frame}>
      <details
        className="group"
        open={detailOpen}
        onToggle={(event) => setDetailOpen(event.currentTarget.open)}
      >
        <summary className="list-none [&::-webkit-details-marker]:hidden">
          <DividerRow>
            <span className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-hover-bg hover:text-fg-secondary group-open:bg-hover-bg group-open:text-fg-secondary">
              {content}
              <ChevronRight
                className="h-3 w-3 flex-shrink-0 transition-transform group-open:rotate-90"
                aria-hidden
              />
            </span>
          </DividerRow>
        </summary>
        <p className="mx-auto mt-1 max-w-[80%] whitespace-pre-wrap break-words text-center text-xs leading-relaxed text-fg-muted">
          {detail}
        </p>
      </details>
    </div>
  );
}
