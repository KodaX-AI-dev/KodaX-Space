import { useCallback, useEffect, useRef, useState } from 'react';
import { Handshake, List, PanelRight } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { useAppStore } from '../../store/appStore.js';
import { SidebarToggleButton } from '../../shell/SidebarToggleButton.js';
import { PartnerContextRail } from './PartnerContextRail.js';
import { PartnerConversation } from './PartnerConversation.js';
import { PartnerEvidenceDetail } from './PartnerEvidenceDetail.js';
import type { PartnerDetailOpenTarget } from './partnerDetailWorkspace.js';
import { OPEN_PARTNER_MATERIAL_PICKER_EVENT } from './partnerMaterialPicker.js';
import { shouldAutoHidePartnerContextRail } from './partnerWorkspaceLayout.js';
import { PartnerBaseTaskAutoOpener } from './PartnerBaseTaskAutoOpener.js';
import { PartnerNativeDocumentAutoOpener } from './PartnerNativeDocumentAutoOpener.js';

const PARTNER_CONTEXT_OPEN_KEY = 'kodax-space.partnerContextRailOpen.v1';
const COMPACT_PARTNER_QUERY = '(max-width: 900px)';

function readContextRailOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(PARTNER_CONTEXT_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

function persistContextRailOpen(open: boolean): void {
  try {
    window.localStorage.setItem(PARTNER_CONTEXT_OPEN_KEY, open ? '1' : '0');
  } catch {
    // The current-window state remains usable when preferences cannot be persisted.
  }
}

function useCompactPartnerLayout(): boolean {
  const [compact, setCompact] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(COMPACT_PARTNER_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(COMPACT_PARTNER_QUERY);
    const update = (): void => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return compact;
}

interface PartnerWorkspaceProps {
  readonly leftSidebarOpen: boolean;
  readonly rightSidebarOpen: boolean;
  readonly workspaceMode?: boolean;
  readonly onToggleLeftSidebar: () => void;
  readonly onToggleRightSidebar: () => void;
  readonly onOpenDetail: (target: PartnerDetailOpenTarget) => void;
}

export function PartnerWorkspace({
  leftSidebarOpen,
  rightSidebarOpen,
  workspaceMode = false,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onOpenDetail,
}: PartnerWorkspaceProps): JSX.Element {
  const { t } = useI18n();
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const compact = useCompactPartnerLayout();
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const [homeContextOpen, setHomeContextOpen] = useState(false);
  const [contextRailOpen, setContextRailOpen] = useState(readContextRailOpen);
  const [workspaceWidth, setWorkspaceWidth] = useState<number | null>(null);
  const contextRailAutoHidden = shouldAutoHidePartnerContextRail(rightSidebarOpen, workspaceWidth);
  const contextRailVisible =
    (currentSessionId ? contextRailOpen : homeContextOpen) && !compact && !contextRailAutoHidden;

  const requestMaterialPicker = useCallback((): void => {
    onOpenDetail({ kind: 'materials', openPicker: true });
  }, [onOpenDetail]);

  useEffect(() => {
    const openMaterialPicker = (): void => requestMaterialPicker();
    window.addEventListener(OPEN_PARTNER_MATERIAL_PICKER_EVENT, openMaterialPicker);
    return () => window.removeEventListener(OPEN_PARTNER_MATERIAL_PICKER_EVENT, openMaterialPicker);
  }, [requestMaterialPicker]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || typeof ResizeObserver === 'undefined') return;
    const updateWidth = (): void => {
      setWorkspaceWidth(Math.round(workspace.getBoundingClientRect().width));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  const toggleContextRail = (): void => {
    if (compact) {
      onOpenDetail({ kind: 'materials' });
      return;
    }
    if (!currentSessionId) {
      if (contextRailAutoHidden) onToggleRightSidebar();
      setHomeContextOpen((open) => !open);
      return;
    }
    if (contextRailAutoHidden) {
      if (!contextRailOpen) {
        setContextRailOpen(true);
        persistContextRailOpen(true);
      }
      onToggleRightSidebar();
      return;
    }
    setContextRailOpen((open) => {
      const next = !open;
      persistContextRailOpen(next);
      return next;
    });
  };

  const contextLabel = compact
    ? t('partner.sources.title')
    : contextRailVisible
      ? t('partner.context.hide')
      : t('partner.context.show');
  const detailLabel = rightSidebarOpen ? t('partner.detail.hide') : t('partner.detail.show');

  return (
    <div
      ref={workspaceRef}
      className="center-pane flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-default bg-surface lift"
      data-testid="partner-workspace"
      style={workspaceMode ? { display: 'none' } : undefined}
    >
      <PartnerBaseTaskAutoOpener onOpenDetail={onOpenDetail} />
      <PartnerNativeDocumentAutoOpener onOpenDetail={onOpenDetail} />
      <div className="flex h-10 flex-shrink-0 items-center gap-1 border-b border-border-default px-3">
        <SidebarToggleButton
          side="left"
          open={leftSidebarOpen}
          onClick={onToggleLeftSidebar}
          testId="partner-left-sidebar-toggle"
        />
        <Handshake className="ml-1 h-4 w-4 text-accent-ink" strokeWidth={1.75} aria-hidden />
        <span className="flex-shrink-0 text-[13px] font-medium text-fg-primary">Partner</span>
        <span className="min-w-0 truncate text-[11px] text-fg-muted">{t('partner.subtitle')}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleContextRail}
            className={`ix-pop inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-hover-bg ${
              contextRailVisible
                ? 'bg-surface-2 text-fg-primary'
                : 'text-fg-muted hover:text-fg-primary'
            }`}
            title={contextLabel}
            aria-label={contextLabel}
            aria-pressed={compact ? undefined : contextRailVisible}
            data-testid="partner-context-toggle"
          >
            <List className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onToggleRightSidebar}
            className={`ix-pop inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md hover:bg-hover-bg ${
              rightSidebarOpen
                ? 'bg-surface-2 text-fg-primary'
                : 'text-fg-muted hover:text-fg-primary'
            }`}
            title={detailLabel}
            aria-label={detailLabel}
            aria-pressed={rightSidebarOpen}
            data-testid="partner-detail-toggle"
          >
            <PanelRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <PartnerConversation />
        {contextRailVisible && (
          <PartnerContextRail onOpenDetail={onOpenDetail} onAddMaterial={requestMaterialPicker} />
        )}
      </div>
      <PartnerEvidenceDetail />
    </div>
  );
}
