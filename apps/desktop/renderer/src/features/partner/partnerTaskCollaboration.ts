import type { SessionEvent, SkillMeta } from '@kodax-space/space-ipc-schema';

const SKILL_REFERENCE = /\/(?:skill:)?([a-z0-9][a-z0-9._:-]{0,63})(?=$|\s|["'，。；、])/giu;
const EMPTY_SKILLS: readonly SkillMeta[] = [];

export interface PartnerTaskSkillCatalog {
  readonly scopeKey: string;
  readonly skills: readonly SkillMeta[];
}

export function partnerTaskCollaborationScopeKey(
  projectRoot: string | null,
  sessionId: string | null,
): string {
  return JSON.stringify([projectRoot, sessionId]);
}

export function selectPartnerTaskSkillsForScope(
  catalog: PartnerTaskSkillCatalog,
  scopeKey: string,
): readonly SkillMeta[] {
  return catalog.scopeKey === scopeKey ? catalog.skills : EMPTY_SKILLS;
}

function addInstalledSkill(result: string[], installed: ReadonlySet<string>, value: unknown): void {
  if (typeof value !== 'string' || !installed.has(value) || result.includes(value)) return;
  result.push(value);
}

export function collectPartnerTaskSkillNames(input: {
  readonly skills: readonly SkillMeta[];
  readonly messageTexts: readonly string[];
  readonly events: readonly SessionEvent[];
  readonly expertSkillName?: string;
}): readonly string[] {
  const installed = new Set(input.skills.map((skill) => skill.name));
  const result: string[] = [];
  addInstalledSkill(result, installed, input.expertSkillName);

  for (const text of input.messageTexts) {
    for (const match of text.matchAll(SKILL_REFERENCE)) {
      addInstalledSkill(result, installed, match[1]);
    }
  }

  for (const event of input.events) {
    if (event.kind !== 'tool_start' || !['skill', 'skill.invoke'].includes(event.toolName))
      continue;
    addInstalledSkill(result, installed, event.input?.name ?? event.input?.skillName);
  }
  return result;
}
