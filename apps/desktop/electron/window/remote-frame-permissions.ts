import type { Session } from 'electron';

type PermissionSession = Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>;

/**
 * Electron otherwise grants permission requests by default. Remote Partner
 * subframes never receive browser permissions; the trusted app main frame keeps
 * Electron's existing behavior.
 */
export function installRemoteFramePermissionGuards(target: PermissionSession): void {
  target.setPermissionRequestHandler((_webContents, _permission, callback, details) => {
    callback(details.isMainFrame === true);
  });
  target.setPermissionCheckHandler((_webContents, _permission, _origin, details) => {
    return details.isMainFrame === true;
  });
}
