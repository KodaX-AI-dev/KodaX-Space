export interface SlashCommandNameLike {
  readonly name: string;
  readonly aliases?: readonly string[];
}

function normalizeSlashToken(value: string): string {
  return value.trim().toLowerCase();
}

export function hasSkillSlashConflict(
  name: string,
  commands: readonly SlashCommandNameLike[] = [],
): boolean {
  const target = normalizeSlashToken(name);
  return commands.some((command) => {
    if (normalizeSlashToken(command.name) === target) return true;
    return (command.aliases ?? []).some((alias) => normalizeSlashToken(alias) === target);
  });
}

export function skillSlashText(name: string): string {
  return `/${name}`;
}

export function safeSkillSlashText(
  name: string,
  commands: readonly SlashCommandNameLike[] = [],
): string {
  return hasSkillSlashConflict(name, commands) ? `/skill:${name}` : skillSlashText(name);
}

export function skillSlashInsertText(
  name: string,
  commands: readonly SlashCommandNameLike[] = [],
): string {
  return `${safeSkillSlashText(name, commands)} `;
}

export function skillSlashEchoText(name: string, args: readonly string[]): string {
  const rest = args.join(' ').trim();
  return rest ? `${skillSlashText(name)} ${rest}` : skillSlashText(name);
}

export function parseLegacySkillToken(token: string): string | null {
  const match = token.match(/^skill:(.+)$/i);
  return match?.[1] ?? null;
}

/** Inline references show their kind with an icon, so the `/` and `/skill:` wire prefixes are noise. */
export function commandReferenceLabel(text: string): string {
  return text.replace(/^\/(?:skill:)?/i, '');
}
