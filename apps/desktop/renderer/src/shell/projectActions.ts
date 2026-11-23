// F149: 项目归档 / 移除——项目右键菜单与已归档项目行的悬停按钮共用。
// 两者都在主进程写入成功后才返回 true；调用方随后刷新项目列表。

import type { Project } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../i18n/messages.js';
import { requestConfirm } from '../store/confirmStore.js';
import { pushToast } from '../store/toastStore.js';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export async function setProjectArchived(
  project: Project,
  archived: boolean,
  t: Translate,
): Promise<boolean> {
  if (!window.kodaxSpace) return false;
  const result = await window.kodaxSpace.invoke('project.recent.setArchived', {
    path: project.path,
    archived,
  });
  if (!result.ok || !result.data.ok) {
    pushToast(t('menu.project.archiveUpdateFailed'), 'error');
    return false;
  }
  pushToast(t(archived ? 'menu.project.archived' : 'menu.project.unarchived'), 'info', 1500);
  return true;
}

/** 先确认，再从最近项目列表移除（磁盘上的文件夹不动）。 */
export async function confirmRemoveProject(project: Project, t: Translate): Promise<boolean> {
  if (!window.kodaxSpace) return false;
  const confirmed = await requestConfirm({
    message: t('menu.project.removeConfirm', { name: project.name }),
    danger: true,
    confirmLabel: t('menu.project.remove'),
  });
  if (!confirmed) return false;
  const result = await window.kodaxSpace.invoke('project.recent.remove', { path: project.path });
  if (!result.ok || !result.data.removed) {
    pushToast(t('menu.project.removeFailed'), 'error');
    return false;
  }
  pushToast(t('menu.project.removed'), 'info', 1500);
  return true;
}
