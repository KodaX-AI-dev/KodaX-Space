import { PARTNER_BROWSER_MAX_URL_LENGTH } from '@kodax-space/space-ipc-schema';

export type PartnerBrowserUrlResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: 'empty' | 'invalid' | 'unsupported' | 'credentials' };

export interface PartnerBrowserHistory {
  readonly entries: readonly string[];
  readonly index: number;
  readonly currentUrl: string | null;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly revision: number;
}

const EXPLICIT_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const HTTP_SCHEME_RE = /^https?:\/\//i;
const HOST_WITH_PORT_RE = /^(?:localhost|(?:[a-z0-9-]+\.)+[a-z0-9-]+):\d+(?:\/|$)/i;
const UNSAFE_INPUT_CHAR_RE = /[\\\s\p{C}]/u;

export function normalizePartnerBrowserUrl(input: string): PartnerBrowserUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'empty' };
  if (UNSAFE_INPUT_CHAR_RE.test(trimmed)) return { ok: false, reason: 'invalid' };

  const hasExplicitScheme = EXPLICIT_SCHEME_RE.test(trimmed) && !HOST_WITH_PORT_RE.test(trimmed);
  if (hasExplicitScheme && !HTTP_SCHEME_RE.test(trimmed)) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const parsed = new URL(HTTP_SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'unsupported' };
    }
    if (!parsed.hostname) return { ok: false, reason: 'invalid' };
    if (parsed.username || parsed.password) return { ok: false, reason: 'credentials' };
    const normalized = parsed.toString();
    if (normalized.length > PARTNER_BROWSER_MAX_URL_LENGTH) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, url: normalized };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

function buildHistory(
  entries: readonly string[],
  index: number,
  revision: number,
): PartnerBrowserHistory {
  const currentUrl = index >= 0 ? (entries[index] ?? null) : null;
  return {
    entries,
    index,
    currentUrl,
    canGoBack: index > 0,
    canGoForward: index >= 0 && index < entries.length - 1,
    revision,
  };
}

export function createPartnerBrowserHistory(initialUrl?: string): PartnerBrowserHistory {
  if (!initialUrl) return buildHistory([], -1, 0);
  const normalized = normalizePartnerBrowserUrl(initialUrl);
  return normalized.ok ? buildHistory([normalized.url], 0, 0) : buildHistory([], -1, 0);
}

export function navigatePartnerBrowser(
  state: PartnerBrowserHistory,
  input: string,
): PartnerBrowserHistory {
  const normalized = normalizePartnerBrowserUrl(input);
  if (!normalized.ok) return state;
  if (normalized.url === state.currentUrl) return reloadPartnerBrowser(state);
  const entries = [...state.entries.slice(0, state.index + 1), normalized.url];
  return buildHistory(entries, entries.length - 1, state.revision);
}

export function synchronizePartnerBrowserUrl(
  state: PartnerBrowserHistory,
  actualUrl: string,
): PartnerBrowserHistory {
  const normalized = normalizePartnerBrowserUrl(actualUrl);
  if (!normalized.ok || normalized.url === state.currentUrl) return state;
  const entries = [...state.entries.slice(0, state.index + 1), normalized.url];
  return buildHistory(entries, entries.length - 1, state.revision);
}

export function partnerBrowserBack(state: PartnerBrowserHistory): PartnerBrowserHistory {
  return state.canGoBack ? buildHistory(state.entries, state.index - 1, state.revision) : state;
}

export function partnerBrowserForward(state: PartnerBrowserHistory): PartnerBrowserHistory {
  return state.canGoForward ? buildHistory(state.entries, state.index + 1, state.revision) : state;
}

export function reloadPartnerBrowser(state: PartnerBrowserHistory): PartnerBrowserHistory {
  return state.currentUrl ? buildHistory(state.entries, state.index, state.revision + 1) : state;
}
