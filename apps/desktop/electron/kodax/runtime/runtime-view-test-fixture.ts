import type { ClientViewItem } from '@kodax-ai/kodax/client';
import type { RuntimeViewReader } from './runtime-view-read.js';

export function viewReader(items: readonly ClientViewItem[], sessionId = 's'): RuntimeViewReader {
  return {
    async observeView(id, listener) {
      listener({
        session: { id: sessionId, title: 'Fixture' },
        items,
        settings: {},
        queue: [],
        interactions: [],
        runs: [],
      });
      return {
        close() {
          if (id !== sessionId) throw new Error('Foreign Session');
        },
      };
    },
    async readViewItem(id, itemId, options) {
      if (id !== sessionId) throw new Error('Foreign Session');
      const item = items.find((value) => value.id === itemId);
      if (!item) return null;
      const text = options?.part === 'input' ? (item.tool?.inputText ?? '') : item.text;
      const offset = options?.offset ?? 0;
      const end = Math.min(text.length, offset + 64_000);
      return {
        id: item.id,
        text: text.slice(offset, end),
        offset,
        totalLength: text.length,
        outputState: item.outputState,
        textRevision: item.textRevision,
        ...(end < text.length ? { nextOffset: end } : {}),
      };
    },
  };
}

export const interruptedViewItems: readonly ClientViewItem[] = [
  { id: 'output', type: 'assistant', text: 'Saved progress', sourceRunId: 'r', sourceTurnId: 't' },
  {
    id: 'execution',
    type: 'tool',
    text: 'receipt',
    sourceRunId: 'r',
    sourceTurnId: 't',
    tool: {
      callId: 'tool',
      name: 'read',
      status: 'success',
      inputText: '{}',
      executionBegan: true,
      resultRecorded: true,
    },
  },
  {
    id: 'thought',
    type: 'thinking',
    text: 'unfinished reasoning',
    sourceRunId: 'r',
    sourceTurnId: 't',
  },
];
