// 启动时数据位置不可用(例如移动硬盘被拔、指针文件损坏)的对话框文案。
// 纯函数,便于测试;弹窗与三个按钮的处理在 main.ts。

import type { ResolvedDataRoot } from './data-root.js';

export interface DataRootStartupNotice {
  readonly title: string;
  readonly message: string;
  readonly detail: string;
}

/** 数据位置没问题时返回 null。fallbackRoot 是本次实际使用的根。 */
export function dataRootStartupNotice(
  resolved: ResolvedDataRoot,
  fallbackRoot: string,
  locale: 'zh-CN' | 'en',
): DataRootStartupNotice | null {
  const zh = locale === 'zh-CN';
  if (resolved.problem !== null) {
    const { root, reason } = resolved.problem;
    return zh
      ? {
          title: '数据位置不可用',
          message: `设置的数据位置无法使用:${root}`,
          detail: `${reason}\n\n本次启动将临时使用 ${fallbackRoot}。该位置的会话和设置在本次不可见;重新连接该位置后重启即可恢复。Space 不会自动新建该目录。`,
        }
      : {
          title: 'Data location unavailable',
          message: `The configured data location cannot be used: ${root}`,
          detail: `${reason}\n\nThis session temporarily uses ${fallbackRoot}. Sessions and settings stored at the configured location are not visible now; reconnect it and restart to get them back. Space will not create that folder on its own.`,
        };
  }
  if (resolved.pointerError !== null) {
    return zh
      ? {
          title: '数据位置设置已损坏',
          message: '无法读取已保存的数据位置设置。',
          detail: `${resolved.pointerError}\n\n本次启动将使用 ${fallbackRoot}。`,
        }
      : {
          title: 'Data location setting is damaged',
          message: 'The saved data location setting could not be read.',
          detail: `${resolved.pointerError}\n\nThis session uses ${fallbackRoot}.`,
        };
  }
  return null;
}
