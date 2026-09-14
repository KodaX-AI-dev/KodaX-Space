import { useCallback, useEffect, useState } from 'react';
import type {
  PartnerKbConfigT,
  PartnerKbMaintenanceReportT,
  PartnerKbPageRefT,
  PartnerKbPageT,
} from '@kodax-space/space-ipc-schema';
import { AlertTriangle, BookOpenText, ChevronDown, FileText, Loader2, Search } from 'lucide-react';
import { useAppStore } from '../../store/appStore.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { Collapse } from '../../components/Collapse.js';
import { PARTNER_SOURCES_CHANGED_EVENT } from './partnerWorkbench.js';

interface KbSummary {
  readonly pageCount: number;
  readonly sourcePageCount: number;
  readonly updatedAt: number | null;
}

function compactTime(ts: number | null): string {
  if (ts === null) return '-';
  return new Date(ts).toLocaleString();
}

export function KnowledgeBasePanel(): JSX.Element {
  const { t } = useI18n();
  const currentProjectPath = useAppStore((s) => s.currentProjectPath);
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<KbSummary | null>(null);
  const [pages, setPages] = useState<readonly PartnerKbPageRefT[]>([]);
  const [query, setQuery] = useState('');
  const [selectedPage, setSelectedPage] = useState<PartnerKbPageT | null>(null);
  const [config, setConfig] = useState<PartnerKbConfigT | null>(null);
  const [configDiagnosticCount, setConfigDiagnosticCount] = useState<number | null>(null);
  const [maintenanceReport, setMaintenanceReport] = useState<PartnerKbMaintenanceReportT | null>(
    null,
  );
  const [lintCount, setLintCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((): (() => void) | void => {
    const bridge = window.kodaxSpace;
    if (!bridge || !currentProjectPath) {
      setSummary(null);
      setPages([]);
      setSelectedPage(null);
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    setError(null);
    Promise.all([
      bridge.invoke('partner.kb.summary', { projectRoot: currentProjectPath }),
      bridge.invoke('partner.kb.pages', {
        projectRoot: currentProjectPath,
        ...(query.trim() ? { query: query.trim() } : {}),
      }),
      bridge.invoke('partner.kb.config.get', { projectRoot: currentProjectPath }),
      bridge.invoke('partner.kb.maintenance.last', { projectRoot: currentProjectPath }),
    ])
      .then(([summaryResult, pagesResult, configResult, maintenanceResult]) => {
        if (!alive) return;
        if (summaryResult.ok) {
          setSummary({
            pageCount: summaryResult.data.pageCount,
            sourcePageCount: summaryResult.data.sourcePageCount,
            updatedAt: summaryResult.data.updatedAt,
          });
        } else {
          setSummary(null);
          setError(summaryResult.error.message);
        }
        if (pagesResult.ok) {
          setPages(pagesResult.data.pages);
        } else {
          setPages([]);
          setError(pagesResult.error.message);
        }
        if (configResult.ok) {
          setConfig(configResult.data.config);
          setConfigDiagnosticCount(configResult.data.diagnostics.length);
        } else {
          setConfig(null);
          setConfigDiagnosticCount(null);
          setError(configResult.error.message);
        }
        if (maintenanceResult.ok) {
          setMaintenanceReport(maintenanceResult.data.report);
          setLintCount(maintenanceResult.data.report?.issueCount ?? null);
        } else {
          setMaintenanceReport(null);
          setError(maintenanceResult.error.message);
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setSummary(null);
        setPages([]);
        setConfig(null);
        setConfigDiagnosticCount(null);
        setMaintenanceReport(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [currentProjectPath, query]);

  useEffect(() => {
    if (!expanded) {
      setBusy(false);
      return;
    }
    return load();
  }, [expanded, load]);

  useEffect(() => {
    setSummary(null);
    setPages([]);
    setSelectedPage(null);
    setConfig(null);
    setConfigDiagnosticCount(null);
    setMaintenanceReport(null);
    setLintCount(null);
    setError(null);
  }, [currentProjectPath]);

  useEffect(() => {
    const onSourcesChanged = (): void => {
      if (expanded) void load();
    };
    window.addEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
    return () => window.removeEventListener(PARTNER_SOURCES_CHANGED_EVENT, onSourcesChanged);
  }, [expanded, load]);

  async function readPage(page: PartnerKbPageRefT): Promise<void> {
    const bridge = window.kodaxSpace;
    if (!bridge || !currentProjectPath) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.invoke('partner.kb.readPage', {
        projectRoot: currentProjectPath,
        pageId: page.id,
      });
      if (result.ok) {
        setSelectedPage(result.data.page);
      } else {
        setError(result.error.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b border-border-default" data-testid="partner-kb-panel">
      <div className="relative px-2 py-1.5 flex items-center gap-1">
        <button
          type="button"
          data-testid="partner-kb-toggle"
          className="min-w-0 flex-1 h-7 px-1 flex items-center gap-2 rounded text-left hover:bg-hover-bg"
          aria-expanded={expanded}
          aria-controls="partner-kb-content"
          title={expanded ? t('partner.kb.collapse') : t('partner.kb.expand')}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          <BookOpenText className="w-3.5 h-3.5 text-fg-muted" strokeWidth={1.75} aria-hidden />
          <span className="min-w-0 flex-1 text-[11px] uppercase tracking-wider text-fg-muted truncate">
            {t('partner.kb.title')}
          </span>
          {!expanded && summary && (
            <span className="text-[10px] text-fg-faint tabular-nums">
              {t('partner.kb.pages', { count: summary.pageCount })}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 flex-shrink-0 text-fg-muted transition-transform ${
              expanded ? 'rotate-180' : ''
            }`}
            strokeWidth={1.75}
            aria-hidden
          />
        </button>
        {busy && (
          <Loader2
            className="w-3.5 h-3.5 text-fg-muted animate-spin"
            strokeWidth={1.75}
            aria-hidden
          />
        )}
      </div>

      <Collapse open={expanded} lazyMount>
        <div id="partner-kb-content" className="px-3 pb-2 space-y-2">
          <div className="text-[11px] text-fg-secondary flex items-center gap-2">
            <span>{t('partner.kb.pages', { count: summary?.pageCount ?? 0 })}</span>
            <span className="text-fg-muted">·</span>
            <span>{t('partner.kb.sourcePages', { count: summary?.sourcePageCount ?? 0 })}</span>
          </div>
          <div className="text-[10px] text-fg-muted truncate">
            {t('partner.kb.updated', { time: compactTime(summary?.updatedAt ?? null) })}
          </div>
          {config && (
            <div className="text-[10px] text-fg-muted truncate">
              {t('partner.kb.configStatus', {
                policy: config.claimPolicy,
                days: config.freshnessWindowDays,
                diagnostics: configDiagnosticCount ?? 0,
              })}
            </div>
          )}

          <label className="h-7 rounded-md border border-border-default bg-surface-2 flex items-center gap-1.5 px-2">
            <Search
              className="w-3.5 h-3.5 text-fg-muted flex-shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t('partner.kb.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent outline-none text-[11px] text-fg-primary placeholder:text-fg-faint"
            />
          </label>

          {lintCount !== null && (
            <div className="text-[10px] text-fg-muted">
              {t('partner.kb.maintenanceResult', { count: lintCount })}
            </div>
          )}
          {maintenanceReport && maintenanceReport.summaryMarkdown && (
            <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-snug text-fg-muted font-mono">
              {maintenanceReport.summaryMarkdown.slice(0, 900)}
            </pre>
          )}

          <div className="max-h-32 overflow-y-auto">
            {pages.length > 0 ? (
              pages.slice(0, 30).map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => void readPage(page)}
                  className="w-full px-1 py-1 rounded text-left hover:bg-hover-bg flex items-start gap-1.5"
                  title={page.summary || page.title}
                >
                  <FileText
                    className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-fg-muted"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] text-fg-secondary truncate">
                      {page.title}
                    </span>
                    <span className="block text-[10px] text-fg-muted truncate">
                      {page.pageType} · {page.sources.length} src
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <div className="text-[11px] text-fg-faint px-1 py-1">
                {currentProjectPath ? t('partner.kb.empty') : t('partner.sources.openFolderHint')}
              </div>
            )}
          </div>

          {selectedPage && (
            <div className="border-t border-border-default pt-2">
              <div className="text-[11px] text-fg-secondary truncate">{selectedPage.title}</div>
              <pre className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-snug text-fg-muted font-mono">
                {selectedPage.content.slice(0, 1200)}
              </pre>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1.5 text-[10px] text-danger leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden />
              <span>{error}</span>
            </div>
          )}
        </div>
      </Collapse>
    </section>
  );
}
