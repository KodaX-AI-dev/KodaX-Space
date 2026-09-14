import { PARTNER_BROWSER_PARTITION } from '@kodax-space/space-ipc-schema';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe2,
  Loader2,
  RotateCw,
  ShieldAlert,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.js';
import type { MessageKey } from '../../i18n/messages.js';
import { openExternalUrl } from '../../lib/openPath.js';
import {
  createPartnerBrowserHistory,
  navigatePartnerBrowser,
  normalizePartnerBrowserUrl,
  partnerBrowserBack,
  partnerBrowserForward,
  reloadPartnerBrowser,
  synchronizePartnerBrowserUrl,
  type PartnerBrowserHistory,
  type PartnerBrowserUrlResult,
} from './partnerBrowserNavigation.js';

interface PartnerBrowserPanelProps {
  readonly initialUrl?: string;
  readonly navigationRevision?: number;
}

interface BrowserToolbarButtonProps {
  readonly label: string;
  readonly disabled: boolean;
  readonly Icon: LucideIcon;
  readonly onClick: () => void;
}

function BrowserToolbarButton({
  label,
  disabled,
  Icon,
  onClick,
}: BrowserToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      title={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function errorMessageKey(
  result: Exclude<PartnerBrowserUrlResult, { readonly ok: true }>,
): MessageKey {
  switch (result.reason) {
    case 'empty':
      return 'partner.browser.error.empty';
    case 'unsupported':
      return 'partner.browser.error.unsupported';
    case 'credentials':
      return 'partner.browser.error.credentials';
    default:
      return 'partner.browser.error.invalid';
  }
}

export function PartnerBrowserPanel({
  initialUrl,
  navigationRevision = 0,
}: PartnerBrowserPanelProps): JSX.Element {
  const { t } = useI18n();
  const [history, setHistory] = useState<PartnerBrowserHistory>(() =>
    createPartnerBrowserHistory(initialUrl),
  );
  const [frameNavigation, setFrameNavigation] = useState(history);
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const [draft, setDraft] = useState(history.currentUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(history.currentUrl));
  const lastNavigationRef = useRef({ initialUrl, navigationRevision });

  const applyHistory = useCallback((next: PartnerBrowserHistory): void => {
    setHistory(next);
    setFrameNavigation((current) => ({ ...next, revision: current.revision + 1 }));
    setDraft(next.currentUrl ?? '');
    setError(null);
    setLoading(Boolean(next.currentUrl));
  }, []);

  useEffect(() => {
    const previous = lastNavigationRef.current;
    if (previous.initialUrl === initialUrl && previous.navigationRevision === navigationRevision)
      return;
    lastNavigationRef.current = { initialUrl, navigationRevision };
    if (initialUrl) applyHistory(navigatePartnerBrowser(history, initialUrl));
  }, [applyHistory, history, initialUrl, navigationRevision]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const started = (): void => setLoading(true);
    const stopped = (): void => {
      setLoading(false);
      const normalized = normalizePartnerBrowserUrl(webview.getURL());
      if (!normalized.ok) return;
      setHistory((current) => synchronizePartnerBrowserUrl(current, normalized.url));
      setDraft(normalized.url);
      setError(null);
    };
    webview.addEventListener('did-start-loading', started);
    webview.addEventListener('did-stop-loading', stopped);
    return () => {
      webview.removeEventListener('did-start-loading', started);
      webview.removeEventListener('did-stop-loading', stopped);
    };
  }, [frameNavigation.currentUrl, frameNavigation.revision]);

  const submitAddress = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const normalized = normalizePartnerBrowserUrl(draft);
    if (!normalized.ok) {
      setError(t(errorMessageKey(normalized)));
      return;
    }
    applyHistory(navigatePartnerBrowser(history, normalized.url));
  };

  const openInSystemBrowser = (): void => {
    if (history.currentUrl) void openExternalUrl(history.currentUrl);
  };

  return (
    <section
      className="flex h-full min-h-0 flex-1 flex-col bg-surface"
      data-testid="partner-browser-panel"
      aria-label={t('partner.browser.label')}
    >
      <form
        className="flex h-11 flex-shrink-0 items-center gap-1 border-b border-border-default px-2"
        onSubmit={submitAddress}
      >
        <BrowserToolbarButton
          label={t('partner.browser.back')}
          disabled={!history.canGoBack}
          Icon={ArrowLeft}
          onClick={() => applyHistory(partnerBrowserBack(history))}
        />
        <BrowserToolbarButton
          label={t('partner.browser.forward')}
          disabled={!history.canGoForward}
          Icon={ArrowRight}
          onClick={() => applyHistory(partnerBrowserForward(history))}
        />
        <BrowserToolbarButton
          label={t('common.refresh')}
          disabled={!history.currentUrl}
          Icon={RotateCw}
          onClick={() => applyHistory(reloadPartnerBrowser(history))}
        />
        <label className="ml-1 min-w-0 flex-1">
          <span className="sr-only">{t('partner.browser.address')}</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              if (error) setError(null);
            }}
            placeholder={t('partner.browser.placeholder')}
            className="h-7 w-full rounded-md border border-border-default bg-surface-2 px-2 text-[11px] text-fg-primary outline-none transition-colors placeholder:text-fg-muted focus:border-accent-ink"
          />
        </label>
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover-bg hover:text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label={t('partner.browser.go')}
          title={t('partner.browser.go')}
        >
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        </button>
        <BrowserToolbarButton
          label={t('partner.browser.openExternal')}
          disabled={!history.currentUrl}
          Icon={ExternalLink}
          onClick={openInSystemBrowser}
        />
      </form>

      {error ? (
        <div
          role="alert"
          className="border-b border-danger/20 bg-danger/5 px-3 py-2 text-[11px] text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col bg-surface-2">
        {frameNavigation.currentUrl ? (
          <div className="relative flex min-h-0 flex-1">
            {loading ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface-2">
                <Loader2
                  className="h-4 w-4 animate-spin text-fg-muted"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>
            ) : null}
            <webview
              ref={webviewRef}
              key={`${frameNavigation.currentUrl}:${frameNavigation.revision}`}
              title={t('partner.browser.frameTitle')}
              src={frameNavigation.currentUrl}
              {...{ partition: PARTNER_BROWSER_PARTITION }}
              data-testid="partner-browser-webview"
              className="h-full min-h-0 w-full flex-1 border-0 bg-white"
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-default bg-surface">
              <Globe2 className="h-5 w-5 text-fg-muted" strokeWidth={1.5} aria-hidden />
            </div>
            <div>
              <div className="text-xs font-medium text-fg-primary">
                {t('partner.browser.emptyTitle')}
              </div>
              <div className="mt-1 max-w-xs text-[11px] leading-relaxed text-fg-muted">
                {t('partner.browser.emptyBody')}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-shrink-0 items-start gap-2 border-t border-border-default px-3 py-2 text-[10px] leading-relaxed text-fg-muted">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} aria-hidden />
        <span>{t('partner.browser.securityNote')}</span>
      </div>
    </section>
  );
}
