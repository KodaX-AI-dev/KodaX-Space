const PARTNER_CONTEXT_WITH_DETAIL_MIN_WIDTH = 760;

export function shouldAutoHidePartnerContextRail(
  detailOpen: boolean,
  workspaceWidth: number | null,
): boolean {
  return (
    detailOpen && workspaceWidth !== null && workspaceWidth < PARTNER_CONTEXT_WITH_DETAIL_MIN_WIDTH
  );
}
