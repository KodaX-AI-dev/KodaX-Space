export const PROJECT_CONTEXT_MENU_GROUPS = [
  ['pin-project', 'open-project-folder', 'rename-project'],
  ['archive-project'],
] as const;

// F149: 先归档、再移除——移除只对已归档的项目提供。
export const ARCHIVED_PROJECT_CONTEXT_MENU_GROUPS = [
  ['unarchive-project', 'remove-project'],
] as const;

// F149: 先归档、再删除——日常菜单只有归档；删除只对已归档的任务提供。
export const SESSION_CONTEXT_MENU_GROUPS = [
  ['pin-session', 'rename-session', 'toggle-session-unread'],
  ['open-session-folder', 'copy-working-directory', 'copy-session-id'],
  ['continue-in-new-session'],
  ['archive-session'],
] as const;

export const ARCHIVED_SESSION_CONTEXT_MENU_GROUPS = [
  ['unarchive-session', 'delete-session'],
] as const;

export type ProjectContextMenuActionId =
  | (typeof PROJECT_CONTEXT_MENU_GROUPS)[number][number]
  | (typeof ARCHIVED_PROJECT_CONTEXT_MENU_GROUPS)[number][number];
export type SessionContextMenuActionId =
  | (typeof SESSION_CONTEXT_MENU_GROUPS)[number][number]
  | (typeof ARCHIVED_SESSION_CONTEXT_MENU_GROUPS)[number][number];

interface ContextMenuPositionInput {
  readonly x: number;
  readonly y: number;
  readonly menuWidth: number;
  readonly menuHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly gutter?: number;
}

export function clampSidebarContextMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gutter = 8,
}: ContextMenuPositionInput): { readonly left: number; readonly top: number } {
  const maxLeft = Math.max(gutter, viewportWidth - menuWidth - gutter);
  const maxTop = Math.max(gutter, viewportHeight - menuHeight - gutter);
  return {
    left: Math.max(gutter, Math.min(x, maxLeft)),
    top: Math.max(gutter, Math.min(y, maxTop)),
  };
}
