import {
  useRef,
  useEffect,
  useImperativeHandle,
  type ForwardedRef,
  type MutableRefObject,
} from 'react';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isElementNode,
  COPY_COMMAND,
  CUT_COMMAND,
  PASTE_COMMAND,
  KEY_BACKSPACE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  CLEAR_HISTORY_COMMAND,
  type SerializedEditorState,
  type LexicalEditor,
} from 'lexical';
import { $generateJSONFromSelectedNodes, $insertDataTransferForRichText } from '@lexical/clipboard';
import {
  ComposerTokenNode,
  ComposerSeparatorNode,
  $createComposerToken,
  $createComposerSeparator,
} from './ComposerTokenNode';
import { editorText, selectOffsets, selectionOffsets, wireText } from './composerEditorProjection';
import type { ComposerEditorHandle, ComposerEditorProps } from './composerEditorTypes';
type Snapshot = { value: string; start: number; end: number };

export function useComposerState(props: ComposerEditorProps, editor: LexicalEditor) {
  const current = useRef(props);
  current.current = props;
  const snapshot = useRef({ value: '', start: 0, end: 0 });
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
        editorState.read(() => {
          const value = editorText();
          const [start, end] = selectionOffsets();
          snapshot.current = { value, start, end };
          current.current.onSelectionChange(start === end ? start : -1);
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
          if (value !== current.current.value) current.current.onChange(value);
        });
      }),
    [editor],
  );
  useEffect(() => {
    editor.setEditable(!props.readOnly);
  }, [editor, props.readOnly]);
  useExternalDraft(editor, props.value, snapshot);
  return snapshot;
}

function replaceDraft(value: string, before: string): void {
  if (before) {
    let start = 0;
    while (start < before.length && start < value.length && before[start] === value[start]) start++;
    let tail = 0;
    while (
      tail < before.length - start &&
      tail < value.length - start &&
      before.at(-tail - 1) === value.at(-tail - 1)
    )
      tail++;
    selectOffsets(start, before.length - tail);
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const [expandedStart, expandedEnd] = selectionOffsets();
      const inserted = value.slice(
        expandedStart,
        value.length - tail + expandedEnd - (before.length - tail),
      );
      if (inserted) selection.insertRawText(inserted);
      else selection.removeText();
    }
    return;
  }
  const root = $getRoot();
  root.clear();
  for (const line of value.split('\n'))
    root.append($createParagraphNode().append($createTextNode(line)));
}

function useExternalDraft(
  editor: LexicalEditor,
  value: string,
  snapshot: MutableRefObject<Snapshot>,
): void {
  const drafts = useRef(new Map<string, SerializedEditorState>());
  useEffect(() => {
    if (value === snapshot.current.value) return;
    // Snapshot only when replacing a draft, never on every keystroke/selection.
    if (snapshot.current.value) {
      drafts.current.set(snapshot.current.value, editor.getEditorState().toJSON());
      if (drafts.current.size > 20) drafts.current.delete(drafts.current.keys().next().value!);
    }
    const saved = drafts.current.get(value);
    if (saved) editor.setEditorState(editor.parseEditorState(saved));
    else editor.update(() => replaceDraft(value, snapshot.current.value), { discrete: true });
    if (!value) editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
  }, [editor, value, snapshot]);
}

export function useComposerHandle(
  ref: ForwardedRef<ComposerEditorHandle>,
  editor: LexicalEditor,
  snapshot: MutableRefObject<Snapshot>,
): void {
  useImperativeHandle(
    ref,
    () => ({
      get value() {
        return snapshot.current.value;
      },
      get selectionStart() {
        return snapshot.current.start;
      },
      get selectionEnd() {
        return snapshot.current.end;
      },
      focus(options) {
        editor.getRootElement()?.focus(options);
      },
      setSelectionRange(start, end) {
        editor.update(() => selectOffsets(start, end), { discrete: true });
      },
      insertToken(start, end, token) {
        if (!editor.isEditable()) return;
        editor.update(
          () => {
            const before = editorText();
            selectOffsets(start, end);
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            if (start === end && end === before.length && before && !/\s$/.test(before))
              selection.insertText(' ');
            const reuseWhitespace = /\s/.test(before[end] ?? '');
            const label = disambiguateFileToken(token);
            const node = $createComposerToken(token, !reuseWhitespace).setTextContent(label);
            if (reuseWhitespace) {
              selection.insertNodes([node]);
              selectOffsets(start + token.value.length + 1, start + token.value.length + 1);
            } else {
              const space = $createComposerSeparator();
              selection.insertNodes([node, space]);
              space.selectEnd();
            }
          },
          { discrete: true, tag: HISTORY_PUSH_TAG },
        );
        editor.focus();
      },
    }),
    [editor, snapshot],
  );
}

function disambiguateFileToken(token: import('./ComposerTokenNode').ComposerToken): string {
  if (token.kind !== 'file') return token.label;
  const siblings = $getRoot()
    .getAllTextNodes()
    .filter(
      (node): node is ComposerTokenNode =>
        node instanceof ComposerTokenNode &&
        node.__token.kind === 'file' &&
        node.__token.label === token.label,
    );
  const tokens = [...siblings.map((node) => node.__token), token];
  const unique = [...new Map(tokens.map((item) => [item.value, item])).values()];
  if (unique.length < 2) return token.label;
  const segments = (item: typeof token) =>
    (item.detail ?? item.value).replace(/^@/, '').replace(/\\/g, '/').split('/');
  let depth = 2;
  const maxDepth = Math.max(...unique.map((item) => segments(item).length));
  while (
    depth < maxDepth &&
    new Set(unique.map((item) => segments(item).slice(-depth).join('/'))).size < unique.length
  )
    depth++;
  const label = (item: typeof token) => segments(item).slice(-depth).join('/');
  for (const sibling of siblings) sibling.setTextContent(label(sibling.__token));
  return label(token);
}

export function useComposerCommands(editor: LexicalEditor): void {
  useEffect(
    () =>
      editor.registerNodeTransform(ComposerTokenNode, (node) => {
        if (node.__token.kind !== 'command') return;
        const block = node.getTopLevelElementOrThrow();
        const prefix = [...block.getPreviousSiblings(), ...node.getPreviousSiblings()]
          .map((item) => item.getTextContent())
          .join('');
        if (prefix.trim()) node.replace($createTextNode(node.__token.value));
      }),
    [editor],
  );
  useEffect(() => {
    const backspace = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      deleteAutoSeparator,
      COMMAND_PRIORITY_HIGH,
    );
    const copy = editor.registerCommand(
      COPY_COMMAND,
      (event) => copySelection(editor, event as globalThis.ClipboardEvent, false),
      COMMAND_PRIORITY_HIGH,
    );
    const cut = editor.registerCommand(
      CUT_COMMAND,
      (event) => copySelection(editor, event as globalThis.ClipboardEvent, true),
      COMMAND_PRIORITY_HIGH,
    );
    const paste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => pasteSelection(editor, event),
      COMMAND_PRIORITY_HIGH,
    );
    return () => {
      backspace();
      copy();
      cut();
      paste();
    };
  }, [editor]);
}

function deleteAutoSeparator(event: globalThis.KeyboardEvent | null): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const [caret] = selectionOffsets();
  let offset = 0;
  for (const block of $getRoot().getChildren()) {
    if (!$isElementNode(block)) continue;
    for (const node of block.getChildren()) {
      const end = offset + wireText(node).length;
      const next = node.getNextSibling();
      if (
        node instanceof ComposerTokenNode &&
        node.__separator &&
        caret === end + 1 &&
        next instanceof ComposerSeparatorNode
      ) {
        event?.preventDefault();
        selectOffsets(offset, caret);
        const range = $getSelection();
        if ($isRangeSelection(range)) range.removeText();
        return true;
      }
      offset = end;
    }
    offset++;
  }
  return false;
}

function copySelection(
  editor: LexicalEditor,
  event: globalThis.ClipboardEvent | null,
  cut: boolean,
): boolean {
  if (!event || !('clipboardData' in event) || !event.clipboardData) return false;
  const [start, end] = selectionOffsets();
  if (start === end) return false;
  event.preventDefault();
  event.clipboardData.setData('text/plain', editorText().slice(start, end));
  selectOffsets(start, end);
  event.clipboardData.setData(
    'application/x-lexical-editor',
    JSON.stringify($generateJSONFromSelectedNodes(editor, $getSelection())),
  );
  if (cut && editor.isEditable()) {
    selectOffsets(start, end);
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.removeText();
  }
  return true;
}

function pasteSelection(editor: LexicalEditor, event: unknown): boolean {
  if (!editor.isEditable() || !(event instanceof globalThis.ClipboardEvent) || !event.clipboardData)
    return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  event.preventDefault();
  if (event.clipboardData.getData('application/x-lexical-editor'))
    $insertDataTransferForRichText(event.clipboardData, selection, editor);
  else selection.insertRawText(event.clipboardData.getData('text/plain'));
  return true;
}
