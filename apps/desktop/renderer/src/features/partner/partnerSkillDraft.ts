import type { Surface } from '@kodax-space/space-ipc-schema';

export const INSERT_PARTNER_SKILL_DRAFT_EVENT = 'kodax-space.partner-insert-skill-draft';

export interface InsertPartnerSkillDraftDetail {
  readonly text: string;
}

export function partnerSkillDraftTextForSurface(surface: Surface, text: string): string | null {
  return surface === 'partner' && text.trim() ? text : null;
}

export function requestPartnerSkillDraft(text: string): void {
  window.dispatchEvent(
    new CustomEvent<InsertPartnerSkillDraftDetail>(INSERT_PARTNER_SKILL_DRAFT_EVENT, {
      detail: { text },
    }),
  );
}
