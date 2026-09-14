import { useAppStore } from './appStore.js';

export const NEW_CONVERSATION_EVENT = 'kodax-space.new-conversation';

/** Explicit intent, including null → null. Ordinary session navigation must not reset a draft. */
export function startNewConversation(projectPath?: string): void {
  // Notify synchronously before a pending create can activate the previous draft.
  // Each surface retains its existing composer-text and focus policy.
  window.dispatchEvent(new Event(NEW_CONVERSATION_EVENT));
  const state = useAppStore.getState();
  if (projectPath !== undefined) state.setCurrentProject(projectPath);
  state.setCurrentSession(null);
}
