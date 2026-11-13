import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $isElementNode,
  $isLineBreakNode,
  $createRangeSelection,
  $setSelection,
  type LexicalNode,
} from 'lexical';
import { ComposerTokenNode } from './ComposerTokenNode';

export function wireText(node: LexicalNode): string {
  if (node instanceof ComposerTokenNode) return node.__token.value;
  return node.getTextContent();
}
export function editorText(): string {
  return $getRoot()
    .getChildren()
    .map((block) => {
      if ($isElementNode(block)) return block.getChildren().map(wireText).join('');
      return wireText(block);
    })
    .join('\n');
}
export function selectionOffsets(): [number, number] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [0, 0];
  const offsetOf = (point: typeof selection.anchor, end: boolean): number => {
    const blocks = $getRoot().getChildren();
    if (point.key === $getRoot().getKey())
      return Math.min(
        editorText().length,
        blocks
          .slice(0, point.offset)
          .reduce(
            (sum, block) =>
              sum +
              ($isElementNode(block)
                ? block.getChildren().map(wireText).join('').length
                : wireText(block).length) +
              1,
            0,
          ),
      );
    let offset = 0;
    for (const block of blocks) {
      if (point.key === block.getKey() && $isElementNode(block))
        return offset + block.getChildren().slice(0, point.offset).map(wireText).join('').length;
      if ($isElementNode(block))
        for (const node of block.getChildren()) {
          if (point.key === node.getKey())
            return (
              offset +
              (node instanceof ComposerTokenNode
                ? point.offset === 0 || (!end && point.offset < node.getTextContentSize())
                  ? 0
                  : wireText(node).length
                : point.offset)
            );
          offset += wireText(node).length;
        }
      offset += 1;
    }
    return Math.max(0, offset - 1);
  };
  const backward = selection.isBackward();
  return backward
    ? [offsetOf(selection.focus, false), offsetOf(selection.anchor, true)]
    : [offsetOf(selection.anchor, false), offsetOf(selection.focus, !selection.isCollapsed())];
}
export function selectOffsets(start: number, end: number): void {
  const selection = $createRangeSelection();
  const setPoint = (point: typeof selection.anchor, target: number, endBias: boolean): void => {
    let offset = 0;
    for (const block of $getRoot().getChildren()) {
      const children = $isElementNode(block) ? block.getChildren() : [];
      for (const [index, node] of children.entries()) {
        const size = wireText(node).length;
        if (target <= offset + size && $isTextNode(node)) {
          point.set(
            node.getKey(),
            node instanceof ComposerTokenNode
              ? target <= offset || (!endBias && target < offset + size)
                ? 0
                : node.getTextContentSize()
              : Math.max(0, target - offset),
            'text',
          );
          return;
        }
        // Line breaks are not text nodes: address the gap before them by child index.
        if (target <= offset) {
          point.set(block.getKey(), index, 'element');
          return;
        }
        offset += $isLineBreakNode(node) ? 1 : size;
      }
      if (target <= offset) {
        point.set(block.getKey(), children.length, 'element');
        return;
      }
      offset += 1;
    }
    const last = $getRoot().getLastChild();
    if ($isElementNode(last)) point.set(last.getKey(), last.getChildrenSize(), 'element');
  };
  setPoint(selection.anchor, start, false);
  setPoint(selection.focus, end, true);
  $setSelection(selection);
}
