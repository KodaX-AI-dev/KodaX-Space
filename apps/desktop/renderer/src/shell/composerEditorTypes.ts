import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { ComposerToken } from './ComposerTokenNode';

export interface ComposerEditorHandle {
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  focus(options?: FocusOptions): void;
  setSelectionRange(start: number, end: number): void;
  insertToken(start: number, end: number, token: ComposerToken): void;
}
export interface ComposerEditorProps {
  value: string;
  readOnly: boolean;
  placeholder: string;
  removeLabel?: string;
  closeLabel?: string;
  copyLabel?: string;
  onCopyReference?(value: string): void;
  onChange(value: string): void;
  /** A negative caret suppresses completion while a text range is selected. */
  onSelectionChange(caret: number): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  onPaste(event: ClipboardEvent<HTMLDivElement>): void;
}
