import { Archive, ArchiveRestore, FolderOpen, Pencil, Pin, PinOff, X } from 'lucide-react';
import type { Project } from '@kodax-space/space-ipc-schema';
import { openDirectory } from '../lib/openPath.js';
import { pushToast } from '../store/toastStore.js';
import { requestConfirm } from '../store/confirmStore.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { SidebarContextMenu, type SidebarContextMenuItem } from './SidebarContextMenu.js';
import {
  ARCHIVED_PROJECT_CONTEXT_MENU_GROUPS,
  PROJECT_CONTEXT_MENU_GROUPS,
  type ProjectContextMenuActionId,
} from './sidebarContextMenuModel.js';

interface ProjectContextMenuProps {
  readonly project: Project;
  readonly x: number;
  readonly y: number;
  readonly onClose: () => void;
  /** F149: 置顶 / 取消置顶（置顶区）。 */
  readonly onTogglePin: () => void;
  readonly onStartRename: () => void;
  readonly onProjectsChanged: () => Promise<void>;
}

const ICON_CLASS = 'h-4 w-4';

export function ProjectContextMenu({
  project,
  x,
  y,
  onClose,
  onTogglePin,
  onStartRename,
  onProjectsChanged,
}: ProjectContextMenuProps): JSX.Element {
  const { t } = useI18n();

  async function onRemove(): Promise<void> {
    if (!window.kodaxSpace) return;
    const confirmed = await requestConfirm({
      message: t('menu.project.removeConfirm', { name: project.name }),
      danger: true,
      confirmLabel: t('menu.project.remove'),
    });
    if (!confirmed) return;
    onClose();
    const result = await window.kodaxSpace.invoke('project.recent.remove', { path: project.path });
    if (!result.ok || !result.data.removed) {
      pushToast(t('menu.project.removeFailed'), 'error');
      return;
    }
    pushToast(t('menu.project.removed'), 'info', 1500);
    await onProjectsChanged();
  }

  async function setArchived(archived: boolean): Promise<void> {
    onClose();
    if (!window.kodaxSpace) return;
    const result = await window.kodaxSpace.invoke('project.recent.setArchived', {
      path: project.path,
      archived,
    });
    if (!result.ok || !result.data.ok) {
      pushToast(t('menu.project.archiveUpdateFailed'), 'error');
      return;
    }
    pushToast(t(archived ? 'menu.project.archived' : 'menu.project.unarchived'), 'info', 1500);
    await onProjectsChanged();
  }

  const pinned = project.pinnedIndex !== undefined;
  const actions: Record<ProjectContextMenuActionId, SidebarContextMenuItem> = {
    'pin-project': {
      id: 'pin-project',
      label: pinned ? t('menu.project.unpin') : t('menu.project.pin'),
      icon: pinned ? (
        <PinOff className={ICON_CLASS} strokeWidth={1.75} aria-hidden />
      ) : (
        <Pin className={ICON_CLASS} strokeWidth={1.75} aria-hidden />
      ),
      onSelect: () => {
        onTogglePin();
        onClose();
        pushToast(t(pinned ? 'menu.project.unpinned' : 'menu.project.pinned'), 'success', 1400);
      },
    },
    'open-project-folder': {
      id: 'open-project-folder',
      label: t('menu.project.openInFileManager'),
      icon: <FolderOpen className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
      onSelect: () => {
        onClose();
        void openDirectory(project.path, project.path);
      },
    },
    'rename-project': {
      id: 'rename-project',
      label: t('menu.project.rename'),
      icon: <Pencil className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
      onSelect: onStartRename,
    },
    'archive-project': {
      id: 'archive-project',
      label: t('menu.project.archive'),
      icon: <Archive className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
      onSelect: () => void setArchived(true),
    },
    'unarchive-project': {
      id: 'unarchive-project',
      label: t('menu.project.unarchive'),
      icon: <ArchiveRestore className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
      onSelect: () => void setArchived(false),
    },
    'remove-project': {
      id: 'remove-project',
      label: t('menu.project.remove'),
      icon: <X className={ICON_CLASS} strokeWidth={1.75} aria-hidden />,
      danger: true,
      onSelect: () => void onRemove(),
    },
  };

  const archived = project.archived === true;
  const menuGroups: readonly (readonly ProjectContextMenuActionId[])[] = archived
    ? ARCHIVED_PROJECT_CONTEXT_MENU_GROUPS
    : PROJECT_CONTEXT_MENU_GROUPS;
  const groups = menuGroups.map((group) => group.map((actionId) => actions[actionId]));

  return (
    <SidebarContextMenu
      x={x}
      y={y}
      ariaLabel={t('menu.project.actions', { name: project.name })}
      groups={groups}
      onClose={onClose}
      width={208}
      estimatedHeight={archived ? 102 : 186}
      testId="project-context-menu"
    />
  );
}
