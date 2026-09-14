import type { Surface } from '@kodax-space/space-ipc-schema';
import type { MessageKey } from '../../i18n/messages.js';
import type { PartnerWorkbenchScenarioId } from './partnerWorkbench.js';

export interface PartnerSceneTemplate {
  readonly sceneId: PartnerWorkbenchScenarioId;
  readonly labelKey: MessageKey;
  readonly descriptionKey: MessageKey;
  readonly promptTemplateKey: MessageKey;
}

export const PARTNER_SCENE_TEMPLATES: readonly PartnerSceneTemplate[] = [
  {
    sceneId: 'document-processing',
    labelKey: 'partner.workbench.scenario.document',
    descriptionKey: 'partner.workbench.scenario.document.desc',
    promptTemplateKey: 'partner.sceneTemplate.document',
  },
  {
    sceneId: 'deep-research',
    labelKey: 'partner.workbench.scenario.research',
    descriptionKey: 'partner.workbench.scenario.research.desc',
    promptTemplateKey: 'partner.sceneTemplate.research',
  },
  {
    sceneId: 'data-analysis',
    labelKey: 'partner.workbench.scenario.data',
    descriptionKey: 'partner.workbench.scenario.data.desc',
    promptTemplateKey: 'partner.sceneTemplate.data',
  },
  {
    sceneId: 'presentation',
    labelKey: 'partner.workbench.scenario.presentation',
    descriptionKey: 'partner.workbench.scenario.presentation.desc',
    promptTemplateKey: 'partner.sceneTemplate.presentation',
  },
  {
    sceneId: 'finance',
    labelKey: 'partner.workbench.scenario.finance',
    descriptionKey: 'partner.workbench.scenario.finance.desc',
    promptTemplateKey: 'partner.sceneTemplate.finance',
  },
  {
    sceneId: 'product-management',
    labelKey: 'partner.workbench.scenario.product',
    descriptionKey: 'partner.workbench.scenario.product.desc',
    promptTemplateKey: 'partner.sceneTemplate.product',
  },
  {
    sceneId: 'design',
    labelKey: 'partner.workbench.scenario.design',
    descriptionKey: 'partner.workbench.scenario.design.desc',
    promptTemplateKey: 'partner.sceneTemplate.design',
  },
  {
    sceneId: 'email-editing',
    labelKey: 'partner.workbench.scenario.email',
    descriptionKey: 'partner.workbench.scenario.email.desc',
    promptTemplateKey: 'partner.sceneTemplate.email',
  },
];

export function applyPartnerSceneTemplate(input: {
  readonly currentDraft: string;
  readonly previousGeneratedTemplate: string | null;
  readonly nextTemplate: string;
}): {
  readonly draft: string;
  readonly generatedTemplate: string | null;
  readonly applied: boolean;
} {
  const canReplace =
    input.currentDraft.trim().length === 0 ||
    (input.previousGeneratedTemplate !== null &&
      input.currentDraft === input.previousGeneratedTemplate);
  if (!canReplace) {
    return {
      draft: input.currentDraft,
      generatedTemplate: input.previousGeneratedTemplate,
      applied: false,
    };
  }
  return {
    draft: input.nextTemplate,
    generatedTemplate: input.nextTemplate,
    applied: true,
  };
}

interface PartnerUserMessageAdmission {
  readonly operationId?: string;
  readonly sendAdmissionSettled?: true;
  readonly turnId?: string;
  readonly canonicalIndex?: number;
}

export function hasAcceptedPartnerUserMessage(
  messages: readonly PartnerUserMessageAdmission[],
): boolean {
  return messages.some(
    (message) =>
      message.sendAdmissionSettled === true ||
      message.turnId !== undefined ||
      message.canonicalIndex !== undefined,
  );
}

export function shouldShowPartnerSceneShortcuts(input: {
  readonly surface: Surface;
  readonly hasAcceptedUserMessage: boolean;
}): boolean {
  return input.surface === 'partner' && !input.hasAcceptedUserMessage;
}
