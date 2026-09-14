import { PARTNER_BROWSER_MAX_URL_LENGTH } from '@kodax-space/space-ipc-schema';

// CSP 相关常量。
// 抽到独立文件 因为单测要 import 但不能拖 electron 模块进 node:test 环境。

/**
 * apps/desktop/index.html 头部 inline theme-bootstrap 脚本的 sha256 base64 hash。
 *
 * 注入到 prod CSP `script-src` 让浏览器允许该 inline 脚本跑。
 * 改 inline 脚本任何字节，hash 都要重算。
 *
 * 防漂移单测：apps/desktop/electron/test/csp-inline-hash.test.ts
 */
export const THEME_BOOTSTRAP_INLINE_HASH = 'sha256-jFAue9erP7/8uXZSCw/NBSbC45sMok1WrPe7p6NDs1Y=';

// Remote pages are rendered only by a renderer-owned iframe without
// allow-same-origin or top-navigation. Keep this directive explicit so adding
// another frame scheme is a reviewed main-process policy change.
export const APP_RENDERER_FRAME_SRC = "frame-src 'self' app: https: http:";

export function isSafeRemoteFrameUrl(raw: string): boolean {
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

export function shouldPreserveRemoteFrameHeaders(
  resourceType: string,
  url: string,
  partnerBrowserFrameAllowed = false,
): boolean {
  return partnerBrowserFrameAllowed && resourceType === 'subFrame' && isSafeRemoteFrameUrl(url);
}
