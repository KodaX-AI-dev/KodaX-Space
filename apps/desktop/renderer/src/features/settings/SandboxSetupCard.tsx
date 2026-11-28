// Floating, non-blocking card for Windows command sandbox setup: it offers setup after launch,
// tracks the run and explains a failure. Setup takes minutes and its UAC prompt can open behind
// Space, so the user needs one visible place that says what to approve and how long it has run.

import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { SandboxStatusT } from '@kodax-space/space-ipc-schema';
import { useI18n, type translateMessage } from '../../i18n/I18nProvider.js';
import type { MessageKey } from '../../i18n/messages.js';
import { pushToast } from '../../store/toastStore.js';
import { useSandboxSetupStore, type SandboxRequestError } from '../../store/sandboxSetupStore.js';

export const SANDBOX_OFFER_DISMISSED_KEY = 'kodax-space.sandbox-setup-offer.dismissed';
const STARTUP_OFFER_DELAY_MS = 2_500;

/** Offer after launch until Later; a setup that stopped part-way is offered again regardless. */
export function shouldOfferSandboxSetup(
  status: SandboxStatusT | null,
  dismissed: boolean,
): boolean {
  return (
    status?.readiness === 'setup-required' &&
    status.setup.canSetup &&
    (!dismissed || status.setup.interrupted === true)
  );
}

export function sandboxSetupFailureText(
  t: typeof translateMessage,
  status: SandboxStatusT | null,
  error: SandboxRequestError,
): string {
  if (error === 'setup') return t('settings.sandbox.setupFailed');
  const operation = status?.lastOperation;
  if (operation?.outcome === 'cancelled') return t('settings.sandbox.cancelled');
  if (operation?.reason) return t(`settings.sandbox.reason.${operation.reason}` as MessageKey);
  return operation?.message ?? t('settings.sandbox.reason.incomplete');
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(SANDBOX_OFFER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissSandboxSetupOffer(): void {
  try {
    window.localStorage.setItem(SANDBOX_OFFER_DISMISSED_KEY, '1');
  } catch {
    // Without storage the offer simply returns on the next launch.
  }
}

/** Whether this launch should offer setup; reads status once, never starts setup. */
export async function checkSandboxSetupOffer(): Promise<boolean> {
  return shouldOfferSandboxSetup(await useSandboxSetupStore.getState().load(), readDismissed());
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === null ? 0 : now - startedAt;
}

const BUTTON = 'rounded-md px-3 py-1.5';
const SECONDARY_BUTTON = `${BUTTON} border border-border-default text-fg-secondary hover:bg-hover-bg hover:text-fg-primary`;
const PRIMARY_BUTTON = `${BUTTON} btn-accent text-white`;

export function SandboxSetupCard({
  onOpenSettings,
}: {
  readonly onOpenSettings: () => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const status = useSandboxSetupStore((s) => s.status);
  const busy = useSandboxSetupStore((s) => s.busy);
  const error = useSandboxSetupStore((s) => s.error);
  const startedAt = useSandboxSetupStore((s) => s.setupStartedAt);
  const phase = useSandboxSetupStore((s) => s.setupPhase);
  const failed = useSandboxSetupStore((s) => s.setupFailed);
  const setup = useSandboxSetupStore((s) => s.setup);
  const dismissFailure = useSandboxSetupStore((s) => s.dismissFailure);
  const elapsed = useElapsed(startedAt);
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    if (window.kodaxSpace?.platform !== 'win32') return;
    let active = true;
    const timer = setTimeout(() => {
      void checkSandboxSetupOffer().then((offer) => {
        if (active && offer) setOffered(true);
      });
    }, STARTUP_OFFER_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const view =
    busy === 'setup'
      ? 'running'
      : failed
        ? 'failed'
        : offered && status?.setup.canSetup
          ? 'offer'
          : null;
  if (view === null) return null;

  const startSetup = (): void => {
    setOffered(false);
    void setup();
  };
  const later = (): void => {
    setOffered(false);
    dismissSandboxSetupOffer();
    pushToast(t('settings.sandbox.offer.laterHint'), 'info', 5000);
  };
  const Icon = view === 'running' ? Loader2 : view === 'failed' ? ShieldAlert : ShieldCheck;
  const resume = view === 'offer' && status?.setup.interrupted === true;
  const title = resume
    ? t('settings.sandbox.offer.resumeTitle')
    : t(`settings.sandbox.${view}.title`);
  const body =
    view === 'failed'
      ? sandboxSetupFailureText(t, status, error)
      : view === 'running' && phase !== null
        ? t(`settings.sandbox.running.phase.${phase}`)
        : resume
          ? t('settings.sandbox.offer.resumeBody')
          : t(`settings.sandbox.${view}.body`);

  return (
    <div
      data-testid="sandbox-setup-card"
      data-view={view}
      role={view === 'failed' ? 'alert' : 'status'}
      aria-live="polite"
      className={`notice-in fixed bottom-24 right-4 z-40 w-[360px] max-w-[calc(100vw-2rem)] rounded-lg border bg-surface-2 px-3.5 py-3 text-xs shadow-lg ${
        view === 'failed' ? 'border-danger/40' : 'border-warn/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 ${view === 'failed' ? 'text-danger' : 'text-warn'} ${
            view === 'running' ? 'animate-spin' : ''
          }`}
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="min-w-0 flex-1 font-semibold text-fg-primary">{title}</span>
        {view === 'running' && (
          <span className="tnum text-fg-muted">
            {t('settings.sandbox.running.elapsed', { time: formatElapsed(elapsed) })}
          </span>
        )}
        {view === 'failed' && (
          <button
            type="button"
            data-testid="sandbox-setup-card-dismiss"
            onClick={dismissFailure}
            title={t('notification.dismiss')}
            aria-label={t('notification.dismiss')}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover-bg hover:text-fg-primary"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
      <p
        data-testid="sandbox-setup-card-body"
        className="mt-2 whitespace-pre-line leading-5 text-fg-secondary"
      >
        {body}
      </p>
      {view === 'offer' && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            data-testid="sandbox-setup-card-later"
            onClick={later}
            className={SECONDARY_BUTTON}
          >
            {t('settings.sandbox.offer.later')}
          </button>
          <button
            type="button"
            data-testid="sandbox-setup-card-start"
            onClick={startSetup}
            className={PRIMARY_BUTTON}
          >
            {resume ? t('settings.sandbox.offer.resume') : t('settings.sandbox.offer.start')}
          </button>
        </div>
      )}
      {view === 'failed' && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            data-testid="sandbox-setup-card-settings"
            onClick={() => {
              dismissFailure();
              onOpenSettings();
            }}
            className={SECONDARY_BUTTON}
          >
            {t('settings.sandbox.failed.openSettings')}
          </button>
          {status?.setup.canSetup && (
            <button
              type="button"
              data-testid="sandbox-setup-card-retry"
              onClick={() => void setup()}
              className={PRIMARY_BUTTON}
            >
              {t('settings.sandbox.failed.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
