import { PanelLeft, PanelRight } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.js';

interface SidebarToggleButtonProps {
  readonly side: 'left' | 'right';
  readonly open: boolean;
  readonly onClick: () => void;
  readonly testId?: string;
}

/** Shared shell control so Coder and Partner expose the same sidebar semantics. */
export function SidebarToggleButton({
  side,
  open,
  onClick,
  testId,
}: SidebarToggleButtonProps): JSX.Element {
  const { t } = useI18n();
  const Icon = side === 'left' ? PanelLeft : PanelRight;
  const sideLabel = t(side === 'left' ? 'shell.side.left' : 'shell.side.right');
  const label =
    side === 'left'
      ? t(open ? 'menu.view.hideLeftSidebar' : 'menu.view.showLeftSidebar')
      : t(open ? 'shell.hideSidebar' : 'shell.showSidebar', { side: sideLabel });

  return (
    <button
      type="button"
      onClick={onClick}
      className={`ix-pop w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 hover:bg-hover-bg ${
        open ? 'text-fg-primary' : 'text-fg-muted hover:text-fg-primary'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={open}
      data-testid={testId}
    >
      <Icon className="w-4 h-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
