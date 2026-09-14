import type { TransientArtifactSnapshot } from '../artifact/transientArtifact.js';
import type {
  PartnerFeishuBaseCreateTaskT,
  PartnerDeliveryRefT,
  PartnerExpertSnapshotT,
  SkillMeta,
  SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import { partnerDeliveryPreviewVersion } from '../../lib/generatedResourceRef.js';
import { normalizePartnerBrowserUrl } from './partnerBrowserNavigation.js';

export type PartnerDetailTabKind =
  | 'materials'
  | 'outputs'
  | 'collaboration'
  | 'files'
  | 'file'
  | 'artifact'
  | 'baseTask'
  | 'remoteProposal'
  | 'remoteSource'
  | 'browser'
  | 'expert'
  | 'skill'
  | 'connector';

export interface PartnerDetailTab {
  readonly id: string;
  readonly kind: PartnerDetailTabKind;
  readonly title: string;
  readonly snapshot?: TransientArtifactSnapshot;
  readonly artifactId?: string;
  readonly baseTask?: PartnerFeishuBaseCreateTaskT;
  readonly proposalId?: string;
  readonly sourceId?: string;
  readonly browserUrl?: string;
  readonly browserNavigationRevision?: number;
  readonly resourceKey?: string;
  readonly expert?: PartnerExpertSnapshotT;
  readonly skill?: SkillMeta;
  readonly connector?: SpaceConnectorDefinitionT;
  readonly extensionId?: string;
  readonly connectionId?: string;
}

export interface PartnerDetailWorkspaceState {
  readonly tabs: readonly PartnerDetailTab[];
  readonly activeId: string | null;
}

export type PartnerDetailOpenTarget =
  | { readonly kind: 'materials'; readonly openPicker?: boolean }
  | { readonly kind: 'outputs' }
  | { readonly kind: 'collaboration' }
  | { readonly kind: 'files' }
  | { readonly kind: 'file'; readonly snapshot: TransientArtifactSnapshot }
  | {
      readonly kind: 'artifact';
      readonly artifactId: string;
      readonly title?: string;
      readonly snapshot?: TransientArtifactSnapshot;
    }
  | { readonly kind: 'baseTask'; readonly task: PartnerFeishuBaseCreateTaskT }
  | { readonly kind: 'remoteProposal'; readonly proposalId: string; readonly title: string }
  | { readonly kind: 'remoteSource'; readonly sourceId: string; readonly title: string }
  | {
      readonly kind: 'browser';
      readonly initialUrl?: string;
      readonly resourceKey?: string;
      readonly title?: string;
    }
  | { readonly kind: 'expert'; readonly expert: PartnerExpertSnapshotT }
  | { readonly kind: 'skill'; readonly skill: SkillMeta }
  | {
      readonly kind: 'connector';
      readonly extensionId: string;
      readonly connector: SpaceConnectorDefinitionT;
      readonly connectionId?: string;
    };

export interface PartnerDetailWorkspaceContext {
  readonly projectRoot: string | null;
  readonly sessionId: string | null;
}

export interface PartnerDetailOpenRequest {
  readonly revision: number;
  readonly context?: PartnerDetailWorkspaceContext;
  readonly target: PartnerDetailOpenTarget;
}

export function partnerDetailTargetForDelivery(
  delivery: PartnerDeliveryRefT,
): PartnerDetailOpenTarget | null {
  if (delivery.kind !== 'file') return null;
  const version = partnerDeliveryPreviewVersion(delivery.updatedAt);
  return {
    kind: 'file',
    snapshot: {
      id: `delivery-preview-${delivery.id}`,
      kind: 'file',
      title: delivery.title,
      source: 'delivery-preview',
      version,
      path: delivery.relativePath,
      projectRoot: delivery.projectRoot,
      sessionId: delivery.sessionId,
      fileSource: 'delivery-store',
      deliveryId: delivery.id,
      versions: [
        {
          v: version,
          path: delivery.relativePath,
          fileSource: 'delivery-store',
          deliveryId: delivery.id,
        },
      ],
    },
  };
}

export type PartnerDetailWorkspaceAction =
  | { readonly type: 'open'; readonly tab: PartnerDetailTab }
  | { readonly type: 'select'; readonly id: string }
  | { readonly type: 'close'; readonly id: string }
  | { readonly type: 'show-launcher' };

export function createPartnerDetailWorkspaceState(): PartnerDetailWorkspaceState {
  return {
    tabs: [],
    activeId: null,
  };
}

export function createPartnerDetailTab(
  target: PartnerDetailOpenTarget,
  title: string,
  uniqueId: number,
): PartnerDetailTab {
  const staticId =
    target.kind === 'materials' ||
    target.kind === 'outputs' ||
    target.kind === 'collaboration' ||
    target.kind === 'files'
      ? `partner-detail-${target.kind}`
      : null;
  return {
    id:
      target.kind === 'connector'
        ? `partner-detail-connector-${target.extensionId}-${target.connector.id}${target.connectionId ? `-${target.connectionId}` : ''}`
        : target.kind === 'expert'
          ? `partner-detail-expert-${target.expert.extensionId}-${target.expert.expert.id}`
          : target.kind === 'skill'
            ? `partner-detail-skill-${target.skill.name}`
            : target.kind === 'artifact'
              ? `partner-detail-artifact-${target.artifactId}`
              : target.kind === 'remoteSource'
                ? `partner-detail-remote-source-${target.sourceId}`
                : target.kind === 'remoteProposal'
                  ? `partner-detail-remote-proposal-${target.proposalId}`
                  : target.kind === 'baseTask'
                    ? `partner-detail-base-task-${target.task.id}`
                    : target.kind === 'browser' && target.resourceKey
                      ? `partner-detail-${target.resourceKey}`
                      : (staticId ?? `partner-detail-${target.kind}-${uniqueId}`),
    kind: target.kind,
    title:
      target.kind === 'connector'
        ? target.connector.name
        : target.kind === 'expert'
          ? target.expert.expert.name
          : target.kind === 'skill'
            ? target.skill.name
            : target.kind === 'artifact'
              ? (target.title ?? target.snapshot?.title ?? title)
              : target.kind === 'remoteProposal' || target.kind === 'remoteSource'
                ? target.title
                : target.kind === 'baseTask'
                  ? target.task.baseName
                  : target.kind === 'browser' && target.title
                    ? target.title
                    : target.kind === 'file'
                      ? target.snapshot.title
                      : title,
    ...(target.kind === 'file' ? { snapshot: target.snapshot } : {}),
    ...(target.kind === 'artifact'
      ? { artifactId: target.artifactId, snapshot: target.snapshot }
      : {}),
    ...(target.kind === 'baseTask' ? { baseTask: target.task } : {}),
    ...(target.kind === 'remoteProposal' ? { proposalId: target.proposalId } : {}),
    ...(target.kind === 'remoteSource' ? { sourceId: target.sourceId } : {}),
    ...(target.kind === 'browser'
      ? { browserUrl: target.initialUrl, resourceKey: target.resourceKey }
      : {}),
    ...(target.kind === 'expert' ? { expert: target.expert } : {}),
    ...(target.kind === 'skill' ? { skill: target.skill } : {}),
    ...(target.kind === 'connector'
      ? {
          connector: target.connector,
          extensionId: target.extensionId,
          connectionId: target.connectionId,
        }
      : {}),
  };
}

export function consumePartnerDetailOpenRequest(
  request: PartnerDetailOpenRequest | null,
  consumedRevision: number,
): PartnerDetailOpenRequest | null {
  return request?.revision === consumedRevision ? null : request;
}

export function partnerDetailRequestForContext(
  request: PartnerDetailOpenRequest | null,
  context: PartnerDetailWorkspaceContext,
): PartnerDetailOpenRequest | null {
  const requestContext = request?.context;
  if (
    !requestContext ||
    requestContext.projectRoot !== context.projectRoot ||
    requestContext.sessionId !== context.sessionId
  ) {
    return null;
  }
  return request;
}

export function partnerDetailWorkspaceContextKey(context: PartnerDetailWorkspaceContext): string {
  return JSON.stringify([context.projectRoot, context.sessionId]);
}

export function samePartnerBrowserDestination(
  left: PartnerDetailTab,
  right: PartnerDetailTab,
): boolean {
  if (left.kind !== 'browser' || right.kind !== 'browser' || !left.browserUrl || !right.browserUrl)
    return false;
  const leftUrl = normalizePartnerBrowserUrl(left.browserUrl);
  const rightUrl = normalizePartnerBrowserUrl(right.browserUrl);
  return leftUrl.ok && rightUrl.ok && leftUrl.url === rightUrl.url;
}

export function reducePartnerDetailWorkspace(
  state: PartnerDetailWorkspaceState,
  action: PartnerDetailWorkspaceAction,
): PartnerDetailWorkspaceState {
  switch (action.type) {
    case 'open': {
      const browser = state.tabs.find((tab) => samePartnerBrowserDestination(tab, action.tab));
      if (browser) {
        return {
          tabs: state.tabs.map((tab) =>
            tab.id === browser.id
              ? { ...tab, browserNavigationRevision: (tab.browserNavigationRevision ?? 0) + 1 }
              : tab,
          ),
          activeId: browser.id,
        };
      }
      const existingIndex = state.tabs.findIndex((tab) => tab.id === action.tab.id);
      const tabs =
        existingIndex === -1
          ? [...state.tabs, action.tab]
          : state.tabs.map((tab, index) => (index === existingIndex ? action.tab : tab));
      return { tabs, activeId: action.tab.id };
    }
    case 'select':
      return state.tabs.some((tab) => tab.id === action.id)
        ? { ...state, activeId: action.id }
        : state;
    case 'show-launcher':
      return { ...state, activeId: null };
    case 'close': {
      const closingIndex = state.tabs.findIndex((tab) => tab.id === action.id);
      if (closingIndex === -1) return state;

      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      if (state.activeId !== action.id) return { ...state, tabs };

      const nextTab = tabs[closingIndex] ?? tabs[closingIndex - 1];
      return {
        tabs,
        activeId: nextTab?.id ?? null,
      };
    }
  }
}
