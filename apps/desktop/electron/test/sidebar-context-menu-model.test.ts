import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARCHIVED_PROJECT_CONTEXT_MENU_GROUPS,
  ARCHIVED_SESSION_CONTEXT_MENU_GROUPS,
  clampSidebarContextMenuPosition,
  PROJECT_CONTEXT_MENU_GROUPS,
  SESSION_CONTEXT_MENU_GROUPS,
} from '../../renderer/src/shell/sidebarContextMenuModel.js';

test('project context menu archives first; remove is offered only once archived', () => {
  assert.deepEqual(PROJECT_CONTEXT_MENU_GROUPS, [
    ['pin-project', 'open-project-folder', 'rename-project'],
    ['archive-project'],
  ]);
  assert.deepEqual(ARCHIVED_PROJECT_CONTEXT_MENU_GROUPS, [['unarchive-project', 'remove-project']]);
});

test('session context menu groups task state, project facts, continuation, and archive', () => {
  assert.deepEqual(SESSION_CONTEXT_MENU_GROUPS, [
    ['pin-session', 'rename-session', 'toggle-session-unread'],
    ['open-session-folder', 'copy-working-directory', 'copy-session-id'],
    ['continue-in-new-session'],
    ['archive-session'],
  ]);
  assert.deepEqual(ARCHIVED_SESSION_CONTEXT_MENU_GROUPS, [['unarchive-session', 'delete-session']]);
});

test('context menu placement keeps every edge inside the viewport gutter', () => {
  assert.deepEqual(
    clampSidebarContextMenuPosition({
      x: -20,
      y: -10,
      menuWidth: 208,
      menuHeight: 240,
      viewportWidth: 800,
      viewportHeight: 600,
    }),
    { left: 8, top: 8 },
  );

  assert.deepEqual(
    clampSidebarContextMenuPosition({
      x: 760,
      y: 580,
      menuWidth: 208,
      menuHeight: 240,
      viewportWidth: 800,
      viewportHeight: 600,
    }),
    { left: 584, top: 352 },
  );
});
