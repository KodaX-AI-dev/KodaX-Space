// Pure scroll math for PdfViewer page navigation.

export interface PdfScrollTargetInput {
  /** Current scroller.scrollTop. */
  readonly scrollTop: number;
  /** Page top relative to the scroller viewport top (pageRect.top - scrollerRect.top). */
  readonly pageOffsetInViewport: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  /** Breathing room kept above the target page. */
  readonly margin: number;
}

/** scrollTop that puts the page at the viewport top, clamped to the scrollable range. */
export function pdfScrollTopForPage(input: PdfScrollTargetInput): number {
  const maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
  const desired = input.scrollTop + input.pageOffsetInViewport - input.margin;
  return Math.min(maxScrollTop, Math.max(0, desired));
}
