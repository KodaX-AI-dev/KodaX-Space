/** Legacy values remain accepted by shortcuts and Space Control. */
export type SettingsTab =
  | 'preferences'
  | 'providers'
  | 'runtime'
  | 'extensions'
  | 'diagnostics'
  | 'license';

export type SettingsPageId =
  | 'preferences'
  | 'appearance'
  | 'providers'
  | 'context'
  | 'external-agents'
  | 'mcp'
  | 'skills'
  | 'extensions'
  | 'sandbox'
  | 'diagnostics'
  | 'about';

export type SettingsPageInput = SettingsPageId | SettingsTab;

export function resolveSettingsPage(input: SettingsPageInput): SettingsPageId {
  if (input === 'runtime') return 'context';
  if (input === 'license') return 'about';
  return input;
}

/** Preserve the existing automation observation contract at its boundary. */
export function legacySettingsTab(input: SettingsPageInput): SettingsTab {
  switch (resolveSettingsPage(input)) {
    case 'appearance':
    case 'preferences':
      return 'preferences';
    case 'about':
      return 'license';
    case 'providers':
      return 'providers';
    case 'extensions':
      return 'extensions';
    case 'diagnostics':
      return 'diagnostics';
    default:
      return 'runtime';
  }
}
