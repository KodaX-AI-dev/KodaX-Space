import { useLayoutEffect, useState, type RefObject } from 'react';

const EMPTY: readonly string[] = [];
const ROW = '[data-msg-id]';
const HIDDEN = '[hidden], [inert], [aria-hidden="true"], .conversation-message-footer, svg';

/** Read mounted text without forcing layout of content-visibility rows. */
function searchableText(row: Element): string {
  const walk = document.createTreeWalker(row, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Element)) return NodeFilter.FILTER_ACCEPT;
      if (
        node.matches(HIDDEN) ||
        (node.parentElement instanceof HTMLDetailsElement &&
          !node.parentElement.open &&
          node.tagName !== 'SUMMARY')
      )
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_SKIP;
    },
  });
  const text: string[] = [];
  for (let node = walk.nextNode(); node; node = walk.nextNode()) text.push(node.textContent ?? '');
  return text.join('').toLowerCase();
}

/** Observe the selected window only while the user is actively searching it. */
export function usePageFindMatches(
  scroller: RefObject<HTMLElement | null>,
  query: string,
): readonly string[] {
  const [matches, setMatches] = useState<readonly string[]>(EMPTY);
  useLayoutEffect(() => {
    const root = scroller.current;
    const needle = query.trim().toLowerCase();
    if (!root || !needle) {
      setMatches(EMPTY);
      return;
    }
    const cache = new WeakMap<Element, string>();
    let frame = 0;
    function update(): void {
      frame = 0;
      const ids: string[] = [];
      for (const row of root!.querySelectorAll<HTMLElement>(ROW)) {
        const text = cache.get(row) ?? searchableText(row);
        cache.set(row, text);
        if (text.includes(needle)) ids.push(row.dataset.msgId!);
      }
      setMatches((previous) =>
        previous.length === ids.length && previous.every((id, i) => id === ids[i]) ? previous : ids,
      );
    }
    update();
    const observer = new MutationObserver((records) => {
      for (const { target } of records) {
        const element = target instanceof Element ? target : target.parentElement;
        const row = element?.closest(ROW);
        if (row) cache.delete(row);
      }
      if (!frame) frame = requestAnimationFrame(update);
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'inert', 'open', 'hidden', 'data-msg-id'],
    });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [scroller, query]);
  return matches;
}
