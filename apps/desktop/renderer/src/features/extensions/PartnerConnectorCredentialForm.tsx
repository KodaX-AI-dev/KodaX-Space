import { useRef } from 'react';
import type {
  PartnerConnectorOnboardingT,
  PartnerConnectorOnboardingValueT,
} from '@kodax-space/space-ipc-schema';
import { useI18n } from '../../i18n/I18nProvider.js';

/** Trusted host form. Secrets stay in DOM refs only and are cleared before IPC submission. */
export function PartnerConnectorCredentialForm({
  kind,
  busy,
  onSubmit,
}: {
  readonly kind: PartnerConnectorOnboardingT['inputKind'];
  readonly busy: boolean;
  readonly onSubmit: (value: PartnerConnectorOnboardingValueT) => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const form = useRef<HTMLFormElement>(null);
  if (!kind || !['slack_token', 'github_token', 'zoom_account'].includes(kind)) return null;
  const fields =
    kind === 'zoom_account'
      ? (['accountId', 'clientId', 'clientSecret'] as const)
      : (['apiToken'] as const);
  return (
    <form
      ref={form}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const data = new FormData(event.currentTarget);
        const value =
          kind === 'zoom_account'
            ? {
                accountId: String(data.get('accountId') ?? '').trim(),
                clientId: String(data.get('clientId') ?? '').trim(),
                clientSecret: String(data.get('clientSecret') ?? '').trim(),
              }
            : { token: String(data.get('apiToken') ?? '').trim() };
        form.current?.reset();
        onSubmit(value);
      }}
    >
      {fields.map((field) => (
        <label key={field} className="block text-sm">
          {t(`connectors.${field}`)}
          <input
            name={field}
            type={field === 'apiToken' || field === 'clientSecret' ? 'password' : 'text'}
            required
            maxLength={field === 'accountId' || field === 'clientId' ? 128 : 8192}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="mt-1 w-full rounded-lg border border-border-default bg-surface px-3 py-2"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={busy}
        className="btn-accent w-full rounded-lg px-4 py-2.5 text-sm disabled:opacity-40"
      >
        {busy ? t('connectors.busy') : t('connectors.verifyCredentials')}
      </button>
    </form>
  );
}
