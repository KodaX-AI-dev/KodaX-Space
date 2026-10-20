import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  MemoryActionProposalT,
  MemoryBodySnapshotT,
  MemoryGovernanceReportT,
  MemoryItemRefT,
  MemoryPackT,
} from '@kodax-space/space-ipc-schema';
import {
  AlertTriangle,
  Brain,
  Check,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { useSurfaceStore } from '../../store/surface.js';
import { pushToast } from '../../store/toastStore.js';
import { revealPath } from '../../lib/openPath.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import type { MessageKey } from '../../i18n/messages.js';

type Tab = 'inbox' | 'refs' | 'governance' | 'hints';

const TAB_LABEL_KEYS: Record<Tab, MessageKey> = {
  inbox: 'memory.tab.inbox',
  refs: 'memory.tab.refs',
  governance: 'memory.tab.governance',
  hints: 'memory.tab.hints',
};

interface MemoryListState {
  readonly capabilities?: { readonly curate: boolean; readonly pack: boolean };
  readonly inbox: readonly MemoryActionProposalT[];
  readonly refs: readonly MemoryItemRefT[];
  readonly warnings: readonly string[];
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function ipcError(
  result: {
    readonly ok: false;
    readonly error?: { readonly message?: string; readonly code?: string };
  },
  t: Translate,
): string {
  return `${result.error?.code ?? 'ERR'}: ${result.error?.message ?? t('common.unknownError')}`;
}

function compact(value: string | undefined, t: Translate, max = 96): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return t('memory.none');
  if (text.length <= max) return text;
  return t('memory.truncated', { text: text.slice(0, Math.max(0, max - 14)) });
}

function riskClass(risk: MemoryActionProposalT['risk']): string {
  if (risk === 'high') return 'border-danger/40 bg-danger/10 text-danger';
  if (risk === 'medium') return 'border-warn/40 bg-warn/10 text-warn';
  return 'border-ok/40 bg-ok/10 text-ok';
}

function lifecycleClass(lifecycle: MemoryItemRefT['lifecycle']): string {
  if (lifecycle === 'active' || lifecycle === 'trusted') return 'text-ok';
  if (lifecycle === 'pending' || lifecycle === 'provisional') return 'text-warn';
  if (lifecycle === 'stale' || lifecycle === 'quarantined') return 'text-danger';
  return 'text-fg-muted';
}

function sameRefId(left: MemoryItemRefT | null, right: MemoryItemRefT): boolean {
  return left?.id === right.id && left.kind === right.kind;
}

export function MemoryPanel(): JSX.Element {
  const { t } = useI18n();
  const currentSessionId = useAppStore((s) => s.currentSessionId);
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const currentSurface = useSurfaceStore((s) => s.currentSurface);
  const [tab, setTab] = useState<Tab>('inbox');
  const [data, setData] = useState<MemoryListState>({ inbox: [], refs: [], warnings: [] });
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [selectedRef, setSelectedRef] = useState<MemoryItemRefT | null>(null);
  const [proposal, setProposal] = useState<MemoryActionProposalT | null>(null);
  const [snapshot, setSnapshot] = useState<MemoryBodySnapshotT | null>(null);
  const [report, setReport] = useState<MemoryGovernanceReportT | null>(null);
  const [pack, setPack] = useState<MemoryPackT | null>(null);
  const [task, setTask] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedProposal = useMemo(
    () => data.inbox.find((item) => item.id === selectedProposalId) ?? null,
    [data.inbox, selectedProposalId],
  );

  async function refresh(options: { readonly quiet?: boolean } = {}): Promise<void> {
    if (!currentSessionId || !window.kodaxSpace) return;
    setLoading(true);
    if (!options.quiet) {
      setError(null);
      setNotice(null);
    }
    try {
      const result = await window.kodaxSpace.invoke('memory.list', { sessionId: currentSessionId });
      if (!result.ok) {
        setError(ipcError(result, t));
        setData({ inbox: [], refs: [], warnings: [] });
        return;
      }
      setData(result.data);
      setSelectedProposalId((current) => {
        if (current && result.data.inbox.some((item) => item.id === current)) return current;
        return result.data.inbox[0]?.id ?? null;
      });
      setSelectedRef((current) => {
        if (current && result.data.refs.some((item) => sameRefId(current, item))) return current;
        return result.data.refs[0] ?? null;
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadProposal(proposalId: string): Promise<MemoryActionProposalT | null> {
    if (!currentSessionId || !window.kodaxSpace) return null;
    setBusy(`proposal:${proposalId}`);
    setError(null);
    try {
      const result = await window.kodaxSpace.invoke('memory.proposal', {
        sessionId: currentSessionId,
        proposalId,
      });
      if (!result.ok) {
        setError(ipcError(result, t));
        return null;
      }
      setProposal(result.data.proposal);
      if (!result.data.proposal) setNotice(t('memory.proposalNoLongerPending'));
      return result.data.proposal;
    } finally {
      setBusy(null);
    }
  }

  async function loadRef(ref: MemoryItemRefT): Promise<void> {
    if (!currentSessionId || !window.kodaxSpace) return;
    setSelectedRef(ref);
    setBusy(`ref:${ref.id}`);
    setError(null);
    try {
      const result = await window.kodaxSpace.invoke('memory.readRef', {
        sessionId: currentSessionId,
        ref,
      });
      if (!result.ok) {
        setError(ipcError(result, t));
        setSnapshot(null);
        return;
      }
      setSnapshot(result.data.snapshot);
    } finally {
      setBusy(null);
    }
  }

  async function approve(): Promise<void> {
    if (!currentSessionId || !selectedProposalId || !window.kodaxSpace) return;
    setBusy(`approve:${selectedProposalId}`);
    setError(null);
    setNotice(null);
    try {
      if (!proposal || proposal.id !== selectedProposalId) return;
      const result = await window.kodaxSpace.invoke('memory.approve', {
        sessionId: currentSessionId,
        proposalId: proposal.id,
        expectedFingerprints: proposal.expectedFingerprints,
        expectedRevision: proposal.revision,
      });
      if (!result.ok) {
        setError(ipcError(result, t));
        return;
      }
      if (!result.data.result.applied) {
        setNotice(result.data.result.skippedReason ?? t('memory.approvalBlocked'));
        await loadProposal(selectedProposalId);
        return;
      }
      pushToast(t('memory.applied'), 'success');
      setProposal(null);
      setSelectedProposalId(null);
      await refresh({ quiet: true });
      setTab('refs');
    } finally {
      setBusy(null);
    }
  }

  async function reject(): Promise<void> {
    if (!currentSessionId || !selectedProposalId || !window.kodaxSpace) return;
    setBusy(`reject:${selectedProposalId}`);
    setError(null);
    setNotice(null);
    try {
      const result = await window.kodaxSpace.invoke('memory.reject', {
        sessionId: currentSessionId,
        proposalId: selectedProposalId,
        expectedRevision: proposal?.revision,
        ...(rejectReason.trim() ? { reason: rejectReason.trim() } : {}),
      });
      if (!result.ok) {
        setError(ipcError(result, t));
        return;
      }
      if (!result.data.result.rejected) {
        setNotice(result.data.result.skippedReason ?? t('memory.rejectSkipped'));
        return;
      }
      pushToast(t('memory.rejected'), 'info');
      setRejectReason('');
      setProposal(null);
      setSelectedProposalId(null);
      await refresh({ quiet: true });
    } finally {
      setBusy(null);
    }
  }

  async function runCurator(): Promise<void> {
    if (!currentSessionId || !window.kodaxSpace) return;
    setBusy('curate');
    setError(null);
    setNotice(null);
    try {
      const result = await window.kodaxSpace.invoke('memory.curate', {
        sessionId: currentSessionId,
      });
      if (!result.ok) {
        setError(ipcError(result, t));
        return;
      }
      setReport(result.data.report);
    } finally {
      setBusy(null);
    }
  }

  async function buildPack(): Promise<void> {
    if (!currentSessionId || !window.kodaxSpace || !task.trim()) return;
    setBusy('pack');
    setError(null);
    setNotice(null);
    try {
      const result = await window.kodaxSpace.invoke('memory.pack', {
        sessionId: currentSessionId,
        task: task.trim(),
        maxHints: 8,
        includeSnippets: true,
      });
      if (!result.ok) {
        setError(ipcError(result, t));
        return;
      }
      setPack(result.data.pack);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    setProposal(null);
    setSnapshot(null);
    setReport(null);
    setPack(null);
    if (currentSurface === 'code') void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, currentSurface]);

  useEffect(() => {
    if (selectedProposalId) {
      const current = data.inbox.find((item) => item.id === selectedProposalId) ?? null;
      setProposal(current);
    } else {
      setProposal(null);
    }
  }, [data.inbox, selectedProposalId]);

  if (currentSurface !== 'code') {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-xs text-fg-muted">
        <div>
          <Brain className="mx-auto mb-3 h-6 w-6 text-fg-faint" strokeWidth={1.75} aria-hidden />
          <div className="font-medium text-fg-secondary">{t('memory.coderGovernance')}</div>
          <div className="mt-1 max-w-xs">{t('memory.partnerSeparateSwitch')}</div>
        </div>
      </div>
    );
  }

  if (!currentSessionId) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center text-xs text-fg-muted">
        <div>
          <Brain className="mx-auto mb-3 h-6 w-6 text-fg-faint" strokeWidth={1.75} aria-hidden />
          <div className="font-medium text-fg-secondary">{t('memory.noActiveSession')}</div>
          <div className="mt-1">{t('memory.selectCoderSession')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col text-xs">
      <header className="px-3 py-2 border-b border-border-default flex items-center gap-2 flex-shrink-0">
        <Brain className="h-4 w-4 text-fg-muted" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-fg-primary">{t('memory.coderGovernance')}</div>
          <div className="text-[11px] text-fg-muted truncate">
            {t('memory.partnerSeparate')}
            {currentProjectPath ? ` · ${currentProjectPath}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex h-7 items-center gap-1.5 rounded border border-border-default px-2 text-[11px] text-fg-secondary hover:bg-hover-bg"
          title={t('memory.refreshGovernance')}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {t('common.refresh')}
        </button>
      </header>

      <div className="px-2 py-1 border-b border-border-default flex gap-1 flex-shrink-0">
        {(Object.keys(TAB_LABEL_KEYS) as Tab[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`px-2.5 py-1 rounded text-xs font-medium ${
              tab === item
                ? 'bg-surface-3 text-fg-primary'
                : 'text-fg-muted hover:text-fg-secondary hover:bg-hover-bg'
            }`}
          >
            {t(TAB_LABEL_KEYS[item])}
            {item === 'inbox' && data.inbox.length > 0 && (
              <span className="ml-1 text-[10px] text-fg-muted">{data.inbox.length}</span>
            )}
          </button>
        ))}
      </div>

      {(error || notice || data.warnings.length > 0) && (
        <div className="border-b border-border-default px-3 py-2 space-y-1 flex-shrink-0">
          {error && (
            <div className="flex items-start gap-2 text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
              <span>{error}</span>
            </div>
          )}
          {notice && <div className="text-warn">{notice}</div>}
          {data.warnings.map((warning) => (
            <div key={warning} className="text-fg-muted">
              {warning}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'inbox' && (
          <InboxView
            inbox={data.inbox}
            selectedId={selectedProposalId}
            detail={proposal ?? selectedProposal}
            busy={busy}
            rejectReason={rejectReason}
            onRejectReasonChange={setRejectReason}
            onSelect={(item) => {
              setSelectedProposalId(item.id);
              setProposal(item);
              void loadProposal(item.id);
            }}
            onApprove={() => void approve()}
            onReject={() => void reject()}
          />
        )}
        {tab === 'refs' && (
          <RefsView
            refs={data.refs}
            selectedRef={selectedRef}
            snapshot={snapshot}
            busy={busy}
            currentProjectPath={currentProjectPath}
            onSelect={(ref) => void loadRef(ref)}
          />
        )}
        {tab === 'governance' &&
          (data.capabilities?.curate === false ? (
            <p className="p-4 text-fg-muted">{t('memory.hostCapabilityUnavailable')}</p>
          ) : (
            <GovernanceView report={report} busy={busy} onRun={() => void runCurator()} />
          ))}
        {tab === 'hints' &&
          (data.capabilities?.pack === false ? (
            <p className="p-4 text-fg-muted">{t('memory.hostCapabilityUnavailable')}</p>
          ) : (
            <HintsView
              task={task}
              pack={pack}
              busy={busy}
              onTaskChange={setTask}
              onBuild={() => void buildPack()}
            />
          ))}
      </div>
    </div>
  );
}

function InboxView({
  inbox,
  selectedId,
  detail,
  busy,
  rejectReason,
  onRejectReasonChange,
  onSelect,
  onApprove,
  onReject,
}: {
  inbox: readonly MemoryActionProposalT[];
  selectedId: string | null;
  detail: MemoryActionProposalT | null;
  busy: string | null;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onSelect: (item: MemoryActionProposalT) => void;
  onApprove: () => void;
  onReject: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="h-full min-h-0 grid grid-cols-[minmax(220px,310px)_1fr]">
      <div className="border-r border-border-default overflow-y-auto">
        {inbox.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" />}
            title={t('memory.noPendingProposals')}
          />
        ) : (
          inbox.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className={`w-full border-b border-border-default px-3 py-2 text-left hover:bg-hover-bg ${
                selectedId === item.id ? 'bg-surface-3' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-secondary">
                  {item.id}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] ${riskClass(item.risk)}`}
                >
                  {item.risk}
                </span>
              </div>
              <div className="mt-1 text-fg-primary">{item.action}</div>
              <div className="mt-1 line-clamp-2 text-fg-muted">
                {compact(item.preview.summary, t, 150)}
              </div>
            </button>
          ))
        )}
      </div>
      <div className="min-w-0 overflow-y-auto">
        {detail ? (
          <ProposalDetail
            proposal={detail}
            busy={busy}
            rejectReason={rejectReason}
            onRejectReasonChange={onRejectReasonChange}
            onApprove={onApprove}
            onReject={onReject}
          />
        ) : (
          <EmptyState icon={<FileText className="h-5 w-5" />} title={t('memory.selectProposal')} />
        )}
      </div>
    </div>
  );
}

function ProposalDetail({
  proposal,
  busy,
  rejectReason,
  onRejectReasonChange,
  onApprove,
  onReject,
}: {
  proposal: MemoryActionProposalT;
  busy: string | null;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const approving = busy === `approve:${proposal.id}`;
  const rejecting = busy === `reject:${proposal.id}`;
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-fg-muted">{proposal.id}</div>
          <div className="mt-1 text-sm font-medium text-fg-primary">{proposal.action}</div>
          <div className="mt-1 text-fg-secondary">{proposal.rationale}</div>
        </div>
        <span className={`rounded border px-2 py-1 text-[11px] ${riskClass(proposal.risk)}`}>
          {proposal.risk}
        </span>
      </div>

      <Section title={t('memory.preview')}>
        <div className="text-fg-secondary">{proposal.preview.summary}</div>
        {proposal.preview.changedPaths.length > 0 && (
          <div className="mt-2 space-y-1">
            {proposal.preview.changedPaths.map((p) => (
              <div key={p} className="truncate font-mono text-[11px] text-fg-muted">
                {p}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('memory.targets')}>
        <RefList refs={proposal.targetRefs} />
      </Section>

      <Section title={t('memory.sources')}>
        <RefList refs={proposal.sourceRefs} />
      </Section>

      {proposal.preview.warnings.length > 0 && (
        <Section title={t('memory.warnings')}>
          <ul className="space-y-1 text-warn">
            {proposal.preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t('memory.fingerprintGuard')}>
        <div className="space-y-1">
          {Object.keys(proposal.expectedFingerprints).map((key) => (
            <div key={key} className="font-mono text-[11px] text-fg-muted">
              {key}
            </div>
          ))}
        </div>
      </Section>

      {proposal.preview.diff && (
        <Section title={t('memory.diff')}>
          <pre className="max-h-64 overflow-auto rounded border border-border-default bg-surface-2 p-2 text-[11px] leading-relaxed text-fg-secondary whitespace-pre-wrap">
            {proposal.preview.diff}
          </pre>
        </Section>
      )}

      <div className="flex items-center gap-2 border-t border-border-default pt-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={approving || rejecting}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-ok/40 bg-ok/10 px-3 text-xs text-ok hover:bg-ok/15 disabled:opacity-60"
          title={t('memory.approveTitle')}
        >
          {approving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {t('memory.approve')}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={approving || rejecting}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-border-default px-3 text-xs text-fg-secondary hover:bg-hover-bg disabled:opacity-60"
          title={t('memory.rejectTitle')}
        >
          {rejecting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {t('memory.reject')}
        </button>
        <input
          value={rejectReason}
          onChange={(event) => onRejectReasonChange(event.target.value)}
          placeholder={t('memory.rejectReason')}
          className="min-w-0 flex-1 rounded border border-border-default bg-surface-2 px-2 py-1.5 text-xs text-fg-primary outline-none focus:border-accent-ink"
        />
      </div>
    </div>
  );
}

function RefsView({
  refs,
  selectedRef,
  snapshot,
  busy,
  currentProjectPath,
  onSelect,
}: {
  refs: readonly MemoryItemRefT[];
  selectedRef: MemoryItemRefT | null;
  snapshot: MemoryBodySnapshotT | null;
  busy: string | null;
  currentProjectPath: string | null;
  onSelect: (ref: MemoryItemRefT) => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="h-full min-h-0 grid grid-cols-[minmax(220px,310px)_1fr]">
      <div className="border-r border-border-default overflow-y-auto">
        {refs.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title={t('memory.noApprovedRefs')} />
        ) : (
          refs.map((ref) => (
            <button
              key={`${ref.kind}:${ref.id}`}
              type="button"
              onClick={() => onSelect(ref)}
              className={`w-full border-b border-border-default px-3 py-2 text-left hover:bg-hover-bg ${
                sameRefId(selectedRef, ref) ? 'bg-surface-3' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-secondary">
                  {ref.id}
                </span>
                <span className={`text-[10px] ${lifecycleClass(ref.lifecycle)}`}>
                  {ref.lifecycle}
                </span>
              </div>
              <div className="mt-1 truncate text-fg-primary">{ref.title ?? ref.kind}</div>
              <div className="mt-1 text-[11px] text-fg-muted">
                {ref.kind}/{ref.scope}
              </div>
            </button>
          ))
        )}
      </div>
      <div className="min-w-0 overflow-y-auto">
        {busy?.startsWith('ref:') ? (
          <LoadingState label={t('memory.loadingRef')} />
        ) : snapshot ? (
          <div className="p-3 space-y-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] text-fg-muted">{snapshot.ref.id}</div>
                <div className="mt-1 text-sm font-medium text-fg-primary">
                  {snapshot.ref.title ?? snapshot.ref.kind}
                </div>
                <div className="mt-1 text-fg-muted">{snapshot.bodyFingerprint}</div>
              </div>
              {snapshot.ref.storageUri && (
                <button
                  type="button"
                  onClick={() => void revealPath(snapshot.ref.storageUri!, currentProjectPath)}
                  className="inline-flex h-7 items-center gap-1.5 rounded border border-border-default px-2 text-[11px] text-fg-secondary hover:bg-hover-bg"
                  title={t('memory.revealFile')}
                >
                  <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  {t('memory.reveal')}
                </button>
              )}
            </div>
            {snapshot.warnings.length > 0 && (
              <Section title={t('memory.warnings')}>
                <ul className="space-y-1 text-warn">
                  {snapshot.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Section>
            )}
            <Section title={t('memory.body')}>
              <pre className="max-h-[calc(100vh-260px)] overflow-auto rounded border border-border-default bg-surface-2 p-2 text-[11px] leading-relaxed text-fg-secondary whitespace-pre-wrap">
                {snapshot.body}
              </pre>
            </Section>
          </div>
        ) : (
          <EmptyState icon={<FileText className="h-5 w-5" />} title={t('memory.selectRef')} />
        )}
      </div>
    </div>
  );
}

function GovernanceView({
  report,
  busy,
  onRun,
}: {
  report: MemoryGovernanceReportT | null;
  busy: string | null;
  onRun: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-fg-primary">{t('memory.curatorReport')}</div>
          <div className="text-fg-muted">{t('memory.governanceDescription')}</div>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={busy === 'curate'}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-border-default px-3 text-xs text-fg-secondary hover:bg-hover-bg disabled:opacity-60"
        >
          {busy === 'curate' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {t('memory.run')}
        </button>
      </div>
      {report ? (
        <Section title={`${report.reportId} · ${report.generatedAt}`}>
          <div className="space-y-2">
            {report.findings.map((finding, idx) => (
              <div
                key={`${finding.kind}:${idx}`}
                className="border-b border-border-default pb-2 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg-primary">{finding.kind}</span>
                  <span className="text-fg-muted">{finding.severity}</span>
                  <span className="ml-auto text-fg-muted">{finding.suggestedAction}</span>
                </div>
                <div className="mt-1 text-fg-secondary">{finding.summary}</div>
                {finding.refIds.length > 0 && (
                  <div className="mt-1 font-mono text-[11px] text-fg-muted">
                    {finding.refIds.join(', ')}
                  </div>
                )}
              </div>
            ))}
            {report.warnings.map((warning) => (
              <div key={warning} className="text-warn">
                {warning}
              </div>
            ))}
          </div>
        </Section>
      ) : (
        <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title={t('memory.noReport')} />
      )}
    </div>
  );
}

function HintsView({
  task,
  pack,
  busy,
  onTaskChange,
  onBuild,
}: {
  task: string;
  pack: MemoryPackT | null;
  busy: string | null;
  onTaskChange: (value: string) => void;
  onBuild: () => void;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-fg-muted"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            value={task}
            onChange={(event) => onTaskChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onBuild();
            }}
            placeholder={t('memory.hintsPlaceholder')}
            className="h-8 w-full rounded border border-border-default bg-surface-2 pl-7 pr-2 text-xs text-fg-primary outline-none focus:border-accent-ink"
          />
        </div>
        <button
          type="button"
          onClick={onBuild}
          disabled={busy === 'pack' || !task.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-border-default px-3 text-xs text-fg-secondary hover:bg-hover-bg disabled:opacity-60"
        >
          {busy === 'pack' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <Brain className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {t('memory.build')}
        </button>
      </div>
      {pack ? (
        <div className="space-y-3">
          <div className="font-mono text-[11px] text-fg-muted">{pack.taskFingerprint}</div>
          {pack.hints.length === 0 ? (
            <EmptyState icon={<Brain className="h-5 w-5" />} title={t('memory.noHintsSelected')} />
          ) : (
            pack.hints.map((hint) => (
              <Section key={hint.ref.id} title={hint.ref.title ?? hint.ref.id}>
                <div className="text-fg-secondary">{hint.hook}</div>
                <div className="mt-1 text-fg-muted">{hint.reason}</div>
                {hint.bodySnippet && (
                  <pre className="mt-2 rounded border border-border-default bg-surface-2 p-2 text-[11px] text-fg-secondary whitespace-pre-wrap">
                    {hint.bodySnippet}
                  </pre>
                )}
              </Section>
            ))
          )}
          {pack.omitted.length > 0 && (
            <Section title={t('memory.omitted')}>
              <div className="font-mono text-[11px] text-fg-muted">{pack.omitted.join(', ')}</div>
            </Section>
          )}
        </div>
      ) : (
        <EmptyState icon={<Brain className="h-5 w-5" />} title={t('memory.buildPack')} />
      )}
    </div>
  );
}

function RefList({ refs }: { refs: readonly MemoryItemRefT[] }): JSX.Element {
  const { t } = useI18n();
  if (refs.length === 0) return <div className="text-fg-muted">{t('memory.none')}</div>;
  return (
    <div className="space-y-2">
      {refs.map((ref) => (
        <div
          key={`${ref.kind}:${ref.id}`}
          className="rounded border border-border-default bg-surface-2 px-2 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-secondary">
              {ref.id}
            </span>
            <span className={`text-[10px] ${lifecycleClass(ref.lifecycle)}`}>{ref.lifecycle}</span>
          </div>
          <div className="mt-1 truncate text-fg-muted">
            {ref.title ?? `${ref.kind}/${ref.scope}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="mb-1 text-[11px] font-medium uppercase tracking-normal text-fg-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function EmptyState({ icon, title }: { icon: ReactNode; title: string }): JSX.Element {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center p-4 text-center text-fg-muted">
      <div>
        <div className="mx-auto mb-2 flex h-7 w-7 items-center justify-center text-fg-faint">
          {icon}
        </div>
        <div>{title}</div>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-fg-muted">
      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
      <span>{label}</span>
    </div>
  );
}
