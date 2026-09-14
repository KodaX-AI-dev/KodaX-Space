import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { FileText, Globe2, Plus, X } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { FilesPanel } from '../../shell/popouts/FilesPanel.js';
import { ArtifactPanel } from './ArtifactPanel.js';
import { PartnerBrowserPanel } from './PartnerBrowserPanel.js';
import { PartnerRemoteSourcePanel } from './PartnerRemoteSourcePanel.js';
import { FileViewer } from '../preview/FileViewer.js';
import { SourcesPanel } from './SourcesPanel.js';
import {
  createPartnerDetailTab,
  createPartnerDetailWorkspaceState,
  reducePartnerDetailWorkspace,
  samePartnerBrowserDestination,
  type PartnerDetailOpenRequest,
  type PartnerDetailOpenTarget,
  type PartnerDetailTabKind,
} from './partnerDetailWorkspace.js';
import { handleTablistKeyDown } from './tablistKeyboard.js';
import { PartnerExpertDetails } from '../extensions/PartnerExpertDetails.js';
import { PartnerConnectorDetails } from '../extensions/PartnerConnectorDetails.js';
import { usePartnerRemoteRecords } from '../extensions/usePartnerRemoteRecords.js';
import { PartnerRemoteRecords } from '../extensions/PartnerRemoteRecords.js';
import { PartnerFeishuBaseTaskPanel } from './PartnerFeishuBaseTaskPanel.js';
import { PartnerCollaborationPanel } from './PartnerCollaborationPanel.js';
import { PartnerSkillDetails } from './PartnerSkillDetails.js';

interface PartnerRightSidebarProps {
  readonly open: boolean;
  readonly width?: number;
  readonly openRequest?: PartnerDetailOpenRequest | null;
  readonly onConsumeOpenRequest?: (revision: number) => void;
}

interface PartnerDetailTabKeyEvent {
  readonly key: string;
  preventDefault(): void;
  stopPropagation(): void;
}

export function handlePartnerDetailTabKeyDown(
  event: PartnerDetailTabKeyEvent,
  onClose: () => void,
): boolean {
  if (event.key !== 'Delete') return false;
  event.preventDefault();
  event.stopPropagation();
  onClose();
  return true;
}

export function PartnerRightSidebar({
  open,
  width,
  openRequest = null,
  onConsumeOpenRequest,
}: PartnerRightSidebarProps): JSX.Element {
  const { t } = useI18n();
  const { records: remoteRecords } = usePartnerRemoteRecords();
  const nextUniqueIdRef = useRef(openRequest?.revision ?? 0);
  const initialTab = openRequest
    ? createPartnerDetailTab(
        openRequest.target,
        detailTitle(openRequest.target.kind, t),
        openRequest.revision,
      )
    : null;
  const [state, dispatch] = useReducer(
    reducePartnerDetailWorkspace,
    undefined,
    (): ReturnType<typeof createPartnerDetailWorkspaceState> =>
      initialTab
        ? reducePartnerDetailWorkspace(createPartnerDetailWorkspaceState(), {
            type: 'open',
            tab: initialTab,
          })
        : createPartnerDetailWorkspaceState(),
  );
  const lastRequestRevisionRef = useRef(openRequest?.revision ?? null);
  const launcherToggleRef = useRef<HTMLButtonElement | null>(null);
  const focusAfterStateChangeRef = useRef(false);
  const [sourcePickerRequest, setSourcePickerRequest] = useState(
    openRequest?.target.kind === 'materials' && openRequest.target.openPicker ? 1 : 0,
  );
  const consumeSourcePickerRequest = useCallback((): void => {
    setSourcePickerRequest(0);
  }, []);

  useEffect(() => {
    if (!openRequest || lastRequestRevisionRef.current === openRequest.revision) return;
    lastRequestRevisionRef.current = openRequest.revision;
    nextUniqueIdRef.current = Math.max(nextUniqueIdRef.current, openRequest.revision);
    if (!(openRequest.target.kind === 'materials' && openRequest.target.openPicker)) {
      focusAfterStateChangeRef.current = true;
    }
    dispatch({
      type: 'open',
      tab: createPartnerDetailTab(
        openRequest.target,
        detailTitle(openRequest.target.kind, t),
        openRequest.revision,
      ),
    });
    if (openRequest.target.kind === 'materials' && openRequest.target.openPicker) {
      setSourcePickerRequest((request) => request + 1);
    }
  }, [openRequest, t]);

  useEffect(() => {
    if (!openRequest || !initialTab) return;
    const currentTab = state.tabs.find((tab) => tab.id === state.activeId);
    if (
      !currentTab ||
      (currentTab.id !== initialTab.id && !samePartnerBrowserDestination(currentTab, initialTab))
    )
      return;
    onConsumeOpenRequest?.(openRequest.revision);
  }, [initialTab, onConsumeOpenRequest, openRequest, state.activeId, state.tabs]);

  useEffect(() => {
    if (!focusAfterStateChangeRef.current) return;
    focusAfterStateChangeRef.current = false;
    const nextTabId = state.activeId ?? state.tabs[0]?.id;
    if (nextTabId) {
      document.getElementById(detailTabElementId(nextTabId))?.focus();
      return;
    }
    launcherToggleRef.current?.focus();
  }, [state.activeId, state.tabs]);

  const activeTab = state.tabs.find((tab) => tab.id === state.activeId) ?? null;

  const openLocalDetail = (target: PartnerDetailOpenTarget): void => {
    nextUniqueIdRef.current += 1;
    focusAfterStateChangeRef.current = true;
    dispatch({
      type: 'open',
      tab: createPartnerDetailTab(target, detailTitle(target.kind, t), nextUniqueIdRef.current),
    });
  };
  const launch = (kind: 'files' | 'browser'): void => openLocalDetail({ kind });

  const closeTab = (id: string): void => {
    focusAfterStateChangeRef.current = true;
    dispatch({ type: 'close', id });
  };

  return (
    <aside
      hidden={!open}
      data-testid="right-sidebar"
      data-dock-kind="partner-detail-dock"
      data-state={open ? 'open' : 'closed'}
      style={{
        ...(width !== undefined ? { width: `${width}px` } : {}),
        ...(!open ? { display: 'none' } : {}),
      }}
      className="glass lift ix-zone flex flex-shrink-0 flex-col overflow-hidden rounded-xl border border-border-default bg-surface text-[13px]"
    >
      <div className="flex h-10 flex-shrink-0 items-stretch border-b border-border-default/70 bg-surface">
        <div
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
          role="tablist"
          aria-label={t('partner.detail.tabs')}
          onKeyDown={handleTablistKeyDown}
          data-testid="partner-detail-tabs"
        >
          {state.tabs.map((tab, index) => {
            const active = tab.id === state.activeId;
            const translatedTitle =
              tab.kind === 'file' ||
              tab.kind === 'artifact' ||
              tab.kind === 'expert' ||
              tab.kind === 'skill' ||
              tab.kind === 'connector' ||
              tab.kind === 'baseTask' ||
              tab.kind === 'remoteProposal' ||
              tab.kind === 'remoteSource' ||
              tab.kind === 'browser'
                ? tab.title
                : detailTitle(tab.kind, t);
            const tabbable = active || (state.activeId === null && index === 0);
            return (
              <div
                key={tab.id}
                className={`group flex min-w-28 max-w-40 flex-shrink-0 items-center border-r border-border-default/60 px-2 ${
                  active ? 'bg-surface-2 text-fg-primary' : 'text-fg-muted hover:bg-hover-bg'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  id={detailTabElementId(tab.id)}
                  aria-selected={active}
                  aria-controls={detailPanelElementId(tab.id)}
                  tabIndex={tabbable ? 0 : -1}
                  onClick={() => dispatch({ type: 'select', id: tab.id })}
                  onKeyDown={(event) =>
                    handlePartnerDetailTabKeyDown(event, () => closeTab(tab.id))
                  }
                  className="min-w-0 flex-1 truncate text-left text-[11px]"
                  title={translatedTitle}
                >
                  {translatedTitle}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => closeTab(tab.id)}
                  className="ml-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-fg-faint opacity-60 hover:bg-surface-3 hover:text-fg-primary group-hover:opacity-100"
                  aria-label={t('partner.detail.closeTab', { title: translatedTitle })}
                  title={t('partner.detail.closeTab', { title: translatedTitle })}
                >
                  <X className="h-3 w-3" strokeWidth={1.9} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
        <button
          ref={launcherToggleRef}
          type="button"
          onClick={() => dispatch({ type: 'show-launcher' })}
          className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center border-l border-border-default/60 hover:bg-hover-bg hover:text-fg-primary ${
            state.activeId === null ? 'bg-surface-2 text-fg-primary' : 'text-fg-muted'
          }`}
          aria-label={t('partner.detail.openTool')}
          title={t('partner.detail.openTool')}
          aria-pressed={state.activeId === null}
          data-testid="partner-detail-launcher-toggle"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      <div id="partner-detail-content" className="relative min-h-0 flex-1">
        {state.activeId === null && <PartnerDetailLauncher onLaunch={launch} />}
        {state.tabs
          .filter((tab) => tab.kind === 'connector' && tab.connector && tab.extensionId)
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              {activeTab?.id === tab.id && (
                <PartnerConnectorDetails
                  extensionId={tab.extensionId!}
                  connector={tab.connector!}
                  connectionId={tab.connectionId}
                  onOpenDetail={openLocalDetail}
                />
              )}
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'expert' && tab.expert)
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              <PartnerExpertDetails expert={tab.expert!} />
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'skill' && tab.skill)
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              <PartnerSkillDetails skill={tab.skill!} />
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'collaboration')
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              {activeTab?.id === tab.id && (
                <PartnerCollaborationPanel
                  onOpenExpert={(expert) => openLocalDetail({ kind: 'expert', expert })}
                  onOpenSkill={(skill) => openLocalDetail({ kind: 'skill', skill })}
                  onOpenProposal={(proposalId, title) =>
                    openLocalDetail({ kind: 'remoteProposal', proposalId, title })
                  }
                />
              )}
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'remoteSource' && tab.sourceId)
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              {activeTab?.id === tab.id && (
                <PartnerRemoteSourcePanel sourceId={tab.sourceId!} onOpenDetail={openLocalDetail} />
              )}
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'remoteProposal' && tab.proposalId)
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              {activeTab?.id === tab.id && (
                <PartnerRemoteRecords kind="pendingReview" proposalId={tab.proposalId} />
              )}
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'baseTask' && tab.baseTask)
          .map((tab) => {
            const task =
              remoteRecords.baseTasks.find((candidate) => candidate.id === tab.baseTask!.id) ??
              tab.baseTask!;
            return (
              <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
                {task.status === 'succeeded' && task.url ? (
                  <PartnerBrowserPanel initialUrl={task.url} />
                ) : (
                  <PartnerFeishuBaseTaskPanel task={task} />
                )}
              </DetailTabPanel>
            );
          })}

        {state.tabs
          .filter((tab) => tab.kind === 'materials')
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              <SourcesPanel
                variant="detail"
                onOpenDetail={openLocalDetail}
                openPickerRequest={sourcePickerRequest}
                onOpenPickerRequestConsumed={consumeSourcePickerRequest}
              />
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'outputs')
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              {activeTab?.id === tab.id && <ArtifactPanel onOpenDetail={openLocalDetail} />}
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'artifact' && tab.artifactId)
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              {activeTab?.id === tab.id && (
                <ArtifactPanel
                  includeRemoteOutputs={false}
                  focusedArtifact={{ id: tab.artifactId!, snapshot: tab.snapshot }}
                  onOpenDetail={openLocalDetail}
                />
              )}
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'files')
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              <FilesPanel />
            </DetailTabPanel>
          ))}

        {state.tabs
          .filter((tab) => tab.kind === 'file')
          .map((tab) => {
            const snapshot = tab.snapshot;
            if (!snapshot) return null;
            return (
              <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
                <FileViewer
                  snapshot={snapshot}
                  onSnapshotChange={(nextSnapshot) =>
                    dispatch({
                      type: 'open',
                      tab: { ...tab, title: nextSnapshot.title, snapshot: nextSnapshot },
                    })
                  }
                />
              </DetailTabPanel>
            );
          })}

        {state.tabs
          .filter((tab) => tab.kind === 'browser')
          .map((tab) => (
            <DetailTabPanel key={tab.id} tab={tab} active={activeTab?.id === tab.id}>
              <PartnerBrowserPanel
                initialUrl={tab.browserUrl}
                navigationRevision={tab.browserNavigationRevision}
              />
            </DetailTabPanel>
          ))}
      </div>
    </aside>
  );
}

function detailTabElementId(tabId: string): string {
  return `${tabId}-tab`;
}

function detailPanelElementId(tabId: string): string {
  return `${tabId}-panel`;
}

function DetailTabPanel({
  tab,
  active,
  children,
}: {
  readonly tab: { readonly id: string };
  readonly active: boolean;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div
      id={detailPanelElementId(tab.id)}
      role="tabpanel"
      aria-labelledby={detailTabElementId(tab.id)}
      hidden={!active}
      tabIndex={active ? 0 : -1}
      className="absolute inset-0"
    >
      {children}
    </div>
  );
}

function detailTitle(kind: PartnerDetailTabKind, t: ReturnType<typeof useI18n>['t']): string {
  if (kind === 'connector') return t('connectors.setup');
  if (kind === 'expert') return t('extensions.expertDetails');
  if (kind === 'materials') return t('partner.taskCards.materials');
  if (kind === 'outputs' || kind === 'artifact') return t('partner.taskCards.artifacts');
  if (kind === 'collaboration') return t('partner.taskCards.collaboration');
  if (kind === 'files' || kind === 'file') return t('files.title');
  if (kind === 'baseTask') return t('partner.baseTask.title');
  if (kind === 'remoteProposal') return t('connectors.remoteReviews');
  if (kind === 'remoteSource') return t('connectors.remoteSources');
  if (kind === 'browser') return t('partner.detail.browser');
  return t('partner.detail.browser');
}

function PartnerDetailLauncher({
  onLaunch,
}: {
  readonly onLaunch: (kind: 'files' | 'browser') => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div
      className="flex h-full flex-col items-center justify-center gap-5 p-6"
      data-testid="partner-detail-launcher"
    >
      <div className="text-center">
        <div className="text-sm font-medium text-fg-primary">
          {t('partner.detail.launcherTitle')}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-fg-muted">
          {t('partner.detail.launcherBody')}
        </div>
      </div>
      <div className="grid w-full max-w-sm grid-cols-2 gap-2">
        <LauncherButton
          icon={<FileText className="h-5 w-5" strokeWidth={1.7} aria-hidden />}
          label={t('partner.detail.files')}
          onClick={() => onLaunch('files')}
          testId="partner-detail-open-files"
        />
        <LauncherButton
          icon={<Globe2 className="h-5 w-5" strokeWidth={1.7} aria-hidden />}
          label={t('partner.detail.browser')}
          onClick={() => onLaunch('browser')}
          testId="partner-detail-open-browser"
        />
      </div>
    </div>
  );
}

function LauncherButton({
  icon,
  label,
  onClick,
  testId,
}: {
  readonly icon: JSX.Element;
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-2 px-2 text-xs text-fg-secondary hover:border-border-strong hover:bg-hover-bg hover:text-fg-primary"
      data-testid={testId}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
