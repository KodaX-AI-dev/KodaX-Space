// Shown when the in-app viewer cannot display a file (too large, unreadable, parse
// failure). Offers the OS default app as a fallback for allowlisted document/media types.
import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { isSystemOpenableFilePath } from '@kodax-space/space-ipc-schema';
import { openFileWithSystem } from '../../lib/openPath.js';
import { useI18n } from '../../i18n/I18nProvider.js';

/** Absolute path, or project-relative path plus projectRoot (same contract as shell.openFile). */
export interface SystemOpenTarget {
  readonly path: string;
  readonly projectRoot?: string;
}

interface PreviewUnavailableProps {
  readonly message: string;
  readonly tone?: 'muted' | 'danger';
  readonly action?: ReactNode;
}

export function PreviewUnavailable({
  message,
  tone = 'muted',
  action,
}: PreviewUnavailableProps): JSX.Element {
  return (
    <div
      data-testid="preview-unavailable"
      className="p-4 flex flex-col items-center gap-3 text-center text-xs"
    >
      <div className={tone === 'danger' ? 'text-danger' : 'text-fg-muted'}>{message}</div>
      {action}
    </div>
  );
}

export function OpenWithSystemButton({
  target,
}: {
  readonly target: SystemOpenTarget;
}): JSX.Element | null {
  const { t } = useI18n();
  if (!isSystemOpenableFilePath(target.path)) return null;
  return (
    <button
      type="button"
      data-testid="preview-open-with-system"
      onClick={() => void openFileWithSystem(target.path, target.projectRoot)}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-surface-4 px-3 text-xs text-fg-secondary shadow-sm hover:bg-hover-bg hover:text-fg-primary"
    >
      <ExternalLink className="h-3.5 w-3.5" />
      {t('preview.openWithSystem')}
    </button>
  );
}
