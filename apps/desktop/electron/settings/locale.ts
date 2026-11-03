import { createRequire } from 'node:module';
import { resolveEffectiveLocale } from '@kodax-space/space-ipc-schema';
import { settingsStore } from './store.js';

export function preferredSystemLanguages(): string[] {
  try {
    const req = typeof require === 'function' ? require : createRequire(import.meta.url);
    return (req('electron') as typeof import('electron')).app.getPreferredSystemLanguages();
  } catch {
    // Non-Electron test/maintenance callers have no app locale provider.
    return [Intl.DateTimeFormat().resolvedOptions().locale];
  }
}

export async function localizedSpaceMessage(zh: string, en: string): Promise<string> {
  const settings = await settingsStore.load();
  return resolveEffectiveLocale(settings.languageMode, preferredSystemLanguages()) === 'zh-CN'
    ? zh
    : en;
}
