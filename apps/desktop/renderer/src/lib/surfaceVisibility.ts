/** Global keyboard listeners must leave a hidden or inert work surface untouched. */
export function isSurfaceInteractive(element: Element | null): boolean {
  return (
    element !== null && !element.closest('[inert], [hidden]') && element.getClientRects().length > 0
  );
}
