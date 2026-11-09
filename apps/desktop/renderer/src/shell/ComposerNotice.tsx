import type { ReactNode, Ref } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';

export type ComposerNoticeTone = 'success' | 'info' | 'warning' | 'danger';

// One visual language for notices docked above the composer and for floating toasts: neutral card in the composer's
// family, tone carried by the icon plus a faint tinted border. Success stays fully neutral — a
// finished task is good news, not an alarm.
const TONE_VIEW: Readonly<
  Record<
    ComposerNoticeTone,
    { readonly frame: string; readonly icon: string; readonly glyph: LucideIcon }
  >
> = {
  success: { frame: 'border-border-default bg-surface-2', icon: 'text-ok', glyph: CircleCheck },
  info: { frame: 'border-run/25 bg-surface-2', icon: 'text-run', glyph: Info },
  warning: { frame: 'border-warn/30 bg-warn/5', icon: 'text-warn', glyph: TriangleAlert },
  danger: { frame: 'border-danger/30 bg-danger/5', icon: 'text-danger', glyph: CircleAlert },
};

export interface ComposerNoticeProps {
  readonly tone: ComposerNoticeTone;
  readonly children: ReactNode;
  /** Overrides the tone's default icon when the notice has a more specific meaning (e.g. a timer). */
  readonly icon?: LucideIcon;
  /** Right-aligned secondary detail, e.g. "attempt 2/5". */
  readonly meta?: ReactNode;
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
  readonly role?: 'status' | 'alert';
  readonly ref?: Ref<HTMLDivElement>;
  readonly testId?: string;
  readonly dismissTestId?: string;
}

export function ComposerNotice({
  tone,
  children,
  icon,
  meta,
  onDismiss,
  dismissLabel,
  role,
  ref,
  testId,
  dismissTestId,
}: ComposerNoticeProps): JSX.Element {
  const view = TONE_VIEW[tone];
  const Glyph = icon ?? view.glyph;
  return (
    <div
      ref={ref}
      role={role}
      aria-live={role === 'status' ? 'polite' : undefined}
      data-testid={testId}
      data-notice-tone={tone}
      className={`notice-in flex items-center gap-2 rounded-lg border py-1.5 pl-3 text-xs text-fg-secondary shadow-sm ${
        onDismiss ? 'pr-1' : 'pr-3'
      } ${view.frame}`}
    >
      <Glyph className={`h-3.5 w-3.5 flex-shrink-0 ${view.icon}`} strokeWidth={2} aria-hidden />
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-snug">
        {children}
      </span>
      {meta !== undefined && <span className="tnum flex-shrink-0 text-fg-muted">{meta}</span>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          data-testid={dismissTestId}
          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
          title={dismissLabel}
          aria-label={dismissLabel}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </button>
      )}
    </div>
  );
}
