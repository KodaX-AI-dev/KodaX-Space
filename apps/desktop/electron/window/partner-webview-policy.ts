import {
  PARTNER_BROWSER_MAX_URL_LENGTH,
  PARTNER_BROWSER_PARTITION,
} from '@kodax-space/space-ipc-schema';

export { PARTNER_BROWSER_PARTITION };

export function isSafePartnerWebviewUrl(raw: string): boolean {
  if (raw.length > PARTNER_BROWSER_MAX_URL_LENGTH) return false;
  try {
    const url = new URL(raw);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === '' &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

/** Mutates Electron's guest preferences only after validating host-owned attachment parameters. */
export function preparePartnerWebviewAttachment(
  preferences: Record<string, unknown>,
  params: Record<string, string | undefined>,
): boolean {
  if (
    params.partition !== PARTNER_BROWSER_PARTITION ||
    !params.src ||
    !isSafePartnerWebviewUrl(params.src)
  )
    return false;
  delete preferences.preload;
  delete params.preload;
  delete params.allowpopups;
  delete params.webpreferences;
  Object.assign(preferences, {
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    partition: PARTNER_BROWSER_PARTITION,
  });
  return true;
}
