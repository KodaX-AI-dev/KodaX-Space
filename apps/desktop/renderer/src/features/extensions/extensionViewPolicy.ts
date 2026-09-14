import type { SpaceExtensionT, Surface } from '@kodax-space/space-ipc-schema';

export interface ExtensionViewContext {
  readonly surface: Surface;
  readonly projectRoot: string | null;
  readonly sessionId: string | null;
}

export interface ExtensionViewSelection extends ExtensionViewContext {
  readonly extensionId: string;
  readonly version: string;
  readonly installedAt: number;
}

export function enabledPartnerExtensions(
  surface: Surface,
  extensions: readonly SpaceExtensionT[],
): readonly SpaceExtensionT[] {
  return surface === 'partner' ? extensions.filter((extension) => extension.enabled) : [];
}

export function createExtensionViewSelection(
  extension: SpaceExtensionT,
  context: ExtensionViewContext,
): ExtensionViewSelection {
  return {
    ...context,
    extensionId: extension.id,
    version: extension.version,
    installedAt: extension.installedAt,
  };
}

export function resolveExtensionView(
  selection: ExtensionViewSelection | null,
  context: ExtensionViewContext,
  extensions: readonly SpaceExtensionT[],
): SpaceExtensionT | null {
  if (
    !selection ||
    context.surface !== 'partner' ||
    selection.surface !== context.surface ||
    selection.projectRoot !== context.projectRoot ||
    selection.sessionId !== context.sessionId
  )
    return null;
  return (
    extensions.find(
      (extension) =>
        extension.enabled &&
        extension.id === selection.extensionId &&
        extension.version === selection.version &&
        extension.installedAt === selection.installedAt,
    ) ?? null
  );
}

/** The policy precedes every byte of untrusted package HTML. CSP policies only intersect. */
export function buildRestrictedExtensionDocument(html: string): string {
  const policy = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data:',
    'font-src data:',
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "media-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"></head><body>${html}</body></html>`;
}
