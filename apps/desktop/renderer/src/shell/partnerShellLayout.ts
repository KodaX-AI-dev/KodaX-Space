export const PARTNER_MIN_CENTER_PX = 420;

const PARTNER_MIN_RIGHT_SIDEBAR_PX = 180;
const SHELL_HORIZONTAL_PADDING_PX = 20;
const SHELL_PANEL_GAP_PX = 10;
const RESIZE_HANDLE_WIDTH_PX = 4;

export interface PartnerShellLayoutInput {
  readonly viewportWidth: number;
  readonly preferredLeftSidebarVisible: boolean;
  readonly leftWidth: number;
  readonly rightSidebarVisible: boolean;
  readonly requestedRightWidth: number;
  readonly widthMode: 'default' | 'half' | 'custom';
}

export interface PartnerShellLayout {
  readonly leftSidebarVisible: boolean;
  readonly rightSidebarWidth: number;
  readonly centerWidth: number;
}

function availablePanelWidth(
  viewportWidth: number,
  leftSidebarVisible: boolean,
  leftWidth: number,
  rightSidebarVisible: boolean,
): number {
  const leftChrome = leftSidebarVisible
    ? leftWidth + RESIZE_HANDLE_WIDTH_PX + SHELL_PANEL_GAP_PX * 2
    : 0;
  const rightChrome = rightSidebarVisible ? RESIZE_HANDLE_WIDTH_PX + SHELL_PANEL_GAP_PX * 2 : 0;
  return Math.max(0, viewportWidth - SHELL_HORIZONTAL_PADDING_PX - leftChrome - rightChrome);
}

export function resolvePartnerShellLayout({
  viewportWidth,
  preferredLeftSidebarVisible,
  leftWidth,
  rightSidebarVisible,
  requestedRightWidth,
  widthMode,
}: PartnerShellLayoutInput): PartnerShellLayout {
  if (!rightSidebarVisible) {
    const centerWidth = availablePanelWidth(
      viewportWidth,
      preferredLeftSidebarVisible,
      leftWidth,
      false,
    );
    return { leftSidebarVisible: preferredLeftSidebarVisible, rightSidebarWidth: 0, centerWidth };
  }

  const leftFits =
    !preferredLeftSidebarVisible ||
    availablePanelWidth(viewportWidth, true, leftWidth, true) >=
      PARTNER_MIN_CENTER_PX + PARTNER_MIN_RIGHT_SIDEBAR_PX;
  const leftSidebarVisible = preferredLeftSidebarVisible && leftFits;
  const pairedWidth = availablePanelWidth(viewportWidth, leftSidebarVisible, leftWidth, true);
  const balancedWidth = Math.round(pairedWidth / 2);
  const mustBalance =
    widthMode === 'half' || pairedWidth < PARTNER_MIN_CENTER_PX + PARTNER_MIN_RIGHT_SIDEBAR_PX;
  const finiteRequested = Number.isFinite(requestedRightWidth)
    ? requestedRightWidth
    : PARTNER_MIN_RIGHT_SIDEBAR_PX;
  const rightSidebarWidth = mustBalance
    ? balancedWidth
    : Math.round(
        Math.min(
          pairedWidth - PARTNER_MIN_CENTER_PX,
          Math.max(PARTNER_MIN_RIGHT_SIDEBAR_PX, finiteRequested),
        ),
      );
  return {
    leftSidebarVisible,
    rightSidebarWidth,
    centerWidth: pairedWidth - rightSidebarWidth,
  };
}
