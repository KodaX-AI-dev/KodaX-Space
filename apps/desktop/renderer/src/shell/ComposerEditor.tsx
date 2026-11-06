import {
  forwardRef,
  useState,
  useEffect,
  useRef,
  type KeyboardEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getNodeByKey,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  HISTORY_PUSH_TAG,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { useComposerState, useComposerHandle, useComposerCommands } from './useComposerEditor';
import { ComposerTokenNode, ComposerSeparatorNode, type ComposerToken } from './ComposerTokenNode';

import type { ComposerEditorHandle, ComposerEditorProps } from './composerEditorTypes';
export type { ComposerEditorHandle } from './composerEditorTypes';

type Detail = { key: string; token: ComposerToken } | null;
type DetailProps = {
  editor: LexicalEditor;
  detail: NonNullable<Detail>;
  props: ComposerEditorProps;
  close(): void;
};

const Bridge = forwardRef<ComposerEditorHandle, ComposerEditorProps>(function Bridge(props, ref) {
  const [editor] = useLexicalComposerContext();
  const snapshot = useComposerState(props, editor);
  useComposerHandle(ref, editor, snapshot);
  useComposerCommands(editor);
  const [detail, setDetail] = useState<{ key: string; token: ComposerToken } | null>(null);
  return (
    <div
      className="relative"
      onBlurCapture={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
          setDetail(null);
      }}
      onKeyDownCapture={(event) => {
        if (detail && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setDetail(null);
          editor.focus();
        }
      }}
    >
      {detail && (
        <TokenDetails editor={editor} detail={detail} props={props} close={() => setDetail(null)} />
      )}
      <EditorSurface editor={editor} props={props} setDetail={setDetail} />
    </div>
  );
});

function TokenDetails({ editor, detail, props, close }: DetailProps) {
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.querySelector('button')?.focus();
  }, []);
  return (
    <div
      ref={detailRef}
      role="dialog"
      aria-label={detail.token.label}
      className="composer-token-details"
      data-composer-no-focus
    >
      <strong>{detail.token.label}</strong>
      <div>{detail.token.value}</div>
      {detail.token.detail && <div className="text-fg-muted">{detail.token.detail}</div>}
      {props.onCopyReference && (
        <button type="button" onClick={() => props.onCopyReference?.(detail.token.value)}>
          {props.copyLabel}
        </button>
      )}
      <button
        type="button"
        disabled={props.readOnly}
        onClick={() => {
          removeToken(editor, detail.key);
          close();
          editor.focus();
        }}
      >
        {props.removeLabel ?? 'Remove'}
      </button>
      <button
        type="button"
        onClick={() => {
          close();
          editor.focus();
        }}
      >
        {props.closeLabel ?? 'Close'}
      </button>
    </div>
  );
}
function removeToken(editor: LexicalEditor, key: string): void {
  editor.update(
    () => {
      const node = $getNodeByKey(key);
      if (!(node instanceof ComposerTokenNode)) return;
      const next = node.getNextSibling();
      node.selectPrevious();
      if (node.__separator && next instanceof ComposerSeparatorNode) next.remove();
      node.remove();
    },
    { tag: HISTORY_PUSH_TAG },
  );
}

function EditorSurface({
  editor,
  props,
  setDetail,
}: {
  editor: LexicalEditor;
  props: ComposerEditorProps;
  setDetail: Dispatch<SetStateAction<Detail>>;
}) {
  return (
    <PlainTextPlugin
      contentEditable={
        <ContentEditable
          className="composer-editor"
          data-testid="composer-input"
          role="textbox"
          aria-multiline="true"
          aria-label={props.placeholder}
          data-placeholder={props.placeholder}
          onKeyDownCapture={(event) => handleEditorKey(event, editor, props, setDetail)}
          onClickCapture={(event) => showTokenDetail(event.target, editor, setDetail)}
          onPasteCapture={(event) => {
            props.onPaste(event);
            if (event.defaultPrevented) event.stopPropagation();
          }}
        />
      }
      placeholder={null}
      ErrorBoundary={LexicalErrorBoundary}
    />
  );
}

function handleEditorKey(
  event: KeyboardEvent<HTMLDivElement>,
  editor: LexicalEditor,
  props: ComposerEditorProps,
  setDetail: Dispatch<SetStateAction<Detail>>,
): void {
  if (!editor.isEditable()) return;
  if (editor.isComposing() || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
    return;
  const deletion =
    event.key === 'Backspace'
      ? KEY_BACKSPACE_COMMAND
      : event.key === 'Delete'
        ? KEY_DELETE_COMMAND
        : null;
  if (
    deletion &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    editor.dispatchCommand(deletion, event.nativeEvent)
  ) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.altKey && event.key === 'ArrowDown')
    editor.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const anchor = selection.anchor.getNode();
      const node = anchor instanceof ComposerTokenNode ? anchor : anchor.getPreviousSibling();
      if (node instanceof ComposerTokenNode) {
        event.preventDefault();
        setDetail({ key: node.getKey(), token: node.__token });
      }
    });
  if (event.defaultPrevented) {
    event.stopPropagation();
    return;
  }
  if (!editor.isComposing() && !event.nativeEvent.isComposing) props.onKeyDown(event);
  if (event.defaultPrevented || event.nativeEvent.defaultPrevented) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function showTokenDetail(
  targetEvent: EventTarget,
  editor: LexicalEditor,
  setDetail: Dispatch<SetStateAction<Detail>>,
): void {
  editor.read(() => {
    const target =
      targetEvent instanceof HTMLElement ? targetEvent.closest('[data-composer-token]') : null;
    const node = target ? $getNearestNodeFromDOMNode(target) : null;
    setDetail(
      node instanceof ComposerTokenNode ? { key: node.getKey(), token: node.__token } : null,
    );
  });
}

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(props, ref) {
    return (
      <LexicalComposer
        initialConfig={{
          namespace: 'SpaceComposer',
          nodes: [ComposerTokenNode, ComposerSeparatorNode],
          onError: (error) => {
            throw error;
          },
          theme: { paragraph: 'composer-paragraph' },
        }}
      >
        <Bridge {...props} ref={ref} />
        <HistoryPlugin />
      </LexicalComposer>
    );
  },
);
