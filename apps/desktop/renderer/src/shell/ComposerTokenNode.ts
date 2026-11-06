import {
  TextNode,
  $applyNodeReplacement,
  type EditorConfig,
  type NodeKey,
  type SerializedTextNode,
} from 'lexical';

export interface ComposerToken {
  readonly kind: 'file' | 'skill' | 'command';
  readonly label: string;
  /** Existing wire representation, never an expanded prompt or hidden instruction. */
  readonly value: string;
  readonly detail?: string;
}
type SerializedToken = SerializedTextNode & { token: ComposerToken; separator: boolean };

export class ComposerTokenNode extends TextNode {
  __token: ComposerToken;
  __separator: boolean;
  static getType(): string {
    return 'composer-token';
  }
  static clone(node: ComposerTokenNode): ComposerTokenNode {
    return new ComposerTokenNode(node.__token, node.__separator, node.__key);
  }
  constructor(token: ComposerToken, separator = true, key?: NodeKey) {
    super(token.label, key);
    this.__token = token;
    this.__separator = separator;
  }
  static importJSON(data: SerializedToken): ComposerTokenNode {
    return $createComposerToken(data.token, data.separator).setTextContent(data.text);
  }
  exportJSON(): SerializedToken {
    return {
      ...super.exportJSON(),
      type: 'composer-token',
      version: 1,
      token: this.__token,
      separator: this.__separator,
    };
  }
  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.className = 'composer-token';
    dom.dataset.composerToken = this.__token.kind;
    dom.title = this.__token.detail ?? this.__token.value;
    dom.setAttribute('aria-label', this.__token.value);
    dom.spellcheck = false;
    return dom;
  }
  isTextEntity(): true {
    return true;
  }
  canInsertTextBefore(): false {
    return false;
  }
  canInsertTextAfter(): false {
    return false;
  }
}

export function $createComposerToken(token: ComposerToken, separator = true): ComposerTokenNode {
  return $applyNodeReplacement(new ComposerTokenNode(token, separator)).setMode('token');
}

/** An inserted spacer has identity so authored spaces are never removed with a token. */
export class ComposerSeparatorNode extends TextNode {
  static getType(): string {
    return 'composer-separator';
  }
  static clone(node: ComposerSeparatorNode): ComposerSeparatorNode {
    return new ComposerSeparatorNode(node.__key);
  }
  constructor(key?: NodeKey) {
    super(' ', key);
  }
  static importJSON(): ComposerSeparatorNode {
    return $createComposerSeparator();
  }
  exportJSON(): SerializedTextNode {
    return { ...super.exportJSON(), type: 'composer-separator', version: 1 };
  }
  canInsertTextBefore(): false {
    return false;
  }
  canInsertTextAfter(): false {
    return false;
  }
}

export function $createComposerSeparator(): ComposerSeparatorNode {
  return $applyNodeReplacement(new ComposerSeparatorNode()).setMode('token');
}
