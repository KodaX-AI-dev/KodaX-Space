import {
  SPACE_EXTENSION_FRAME_MESSAGE_TYPE,
  SPACE_EXTENSION_FRAME_URL,
  SPACE_EXTENSION_MAX_FRAME_DOCUMENT_CHARACTERS,
} from '@kodax-space/space-ipc-schema';

/** Kept on this exact child response, never applied to the trusted renderer. */
export const SPACE_EXTENSION_FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const SPACE_EXTENSION_FRAME_BOOTSTRAP = `<!doctype html>
<html><head><meta charset="utf-8"><title>Space extension</title></head>
<body><script>
window.addEventListener('message', function receiveExtension(event) {
  var payload = event.data;
  if (event.source !== parent || !payload || payload.type !== ${JSON.stringify(SPACE_EXTENSION_FRAME_MESSAGE_TYPE)} || typeof payload.documentHtml !== 'string' || payload.documentHtml.length > ${SPACE_EXTENSION_MAX_FRAME_DOCUMENT_CHARACTERS}) return;
  window.removeEventListener('message', receiveExtension);
  document.open();
  document.write(payload.documentHtml);
  document.close();
});
</script></body></html>`;

export function isSpaceExtensionFrameUrl(raw: string): boolean {
  const [base, query, ...extra] = raw.split('?');
  return (
    base === SPACE_EXTENSION_FRAME_URL &&
    extra.length === 0 &&
    (query === undefined || /^v=[A-Za-z0-9-]{1,64}$/.test(query))
  );
}

/** Public protocol boundary, usable without importing Electron in tests. */
export function spaceExtensionFrameResponse(url: string, method: string): Response | null {
  if (!isSpaceExtensionFrameUrl(url)) return null;
  const allowed = method === 'GET' || method === 'HEAD';
  return new Response(allowed && method !== 'HEAD' ? SPACE_EXTENSION_FRAME_BOOTSTRAP : null, {
    status: allowed ? 200 : 405,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': SPACE_EXTENSION_FRAME_CSP,
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}
