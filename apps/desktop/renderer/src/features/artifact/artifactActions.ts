import { translateMessage } from '../../i18n/I18nProvider.js';
import { pushToast } from '../../store/toastStore.js';

export async function saveArtifactAs(id: string, version?: number): Promise<void> {
  try {
    const bridge = window.kodaxSpace;
    if (!bridge) throw new Error(translateMessage('artifact.runtimeUnavailable'));
    const result = await bridge.invoke('artifact.export', {
      id,
      ...(version !== undefined ? { version } : {}),
    });
    if (!result.ok) throw new Error(result.error.message);
    if (result.data.canceled) return;
    if (!result.data.ok)
      throw new Error(result.data.error ?? translateMessage('artifact.saveFailed'));
    pushToast(
      result.data.path
        ? translateMessage('artifact.savedPath', { path: result.data.path })
        : translateMessage('artifact.saved'),
      'success',
    );
  } catch (error) {
    pushToast(
      error instanceof Error ? error.message : translateMessage('artifact.saveFailed'),
      'error',
    );
  }
}

export async function copyArtifactPath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
    pushToast(translateMessage('fileActions.copySucceeded'), 'success', 1400);
  } catch {
    pushToast(translateMessage('fileActions.copyFailed'), 'error');
  }
}
