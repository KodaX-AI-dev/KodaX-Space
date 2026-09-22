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

// Remote HTTPS frames additionally require a window-owned ProjectWebPreview grant
// at the navigation guard. Plugin/artifact frame policies remain independent.
export const APP_RENDERER_FRAME_SRC = "frame-src 'self' app: https:";

export function applyAppResponseCsp(
  url: string,
  headers: Record<string, string[]> | undefined,
  csp: string,
): Record<string, string[]> | undefined {
  // Remote documents bring their own policy. Applying Space's script/connect
  // allowlist here breaks their login and must never overwrite frame-ancestors.
  if (url.startsWith('https://')) return headers;
  return { ...headers, 'Content-Security-Policy': [csp] };
}
