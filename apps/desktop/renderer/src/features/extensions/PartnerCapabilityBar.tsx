import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider.js';
import { usePartnerExpert } from './PartnerExpertProvider.js';
import { usePartnerConnectors } from './PartnerConnectorProvider.js';
import { projectPartnerConnectorGuidance } from './partnerConnectorGuidance.js';
import {
  type PartnerExpertCapabilityGroup,
  type PartnerExpertCapabilitySelection,
} from './partnerExpertCapabilityGuide.js';

export interface PartnerCapabilityBarProps {
  readonly onInsertDraft: (text: string) => void;
}

interface CapabilityChoicesProps {
  readonly groups: readonly PartnerExpertCapabilityGroup[];
  readonly selectedGroup: PartnerExpertCapabilityGroup | null;
  readonly disabled: boolean;
  readonly scopeKey: string;
  readonly onSelect: (selection: PartnerExpertCapabilitySelection | null) => void;
  readonly onInsertDraft: (text: string) => void;
}

function CapabilityGroups({
  groups,
  disabled,
  scopeKey,
  onSelect,
}: Pick<CapabilityChoicesProps, 'groups' | 'disabled' | 'scopeKey' | 'onSelect'>): JSX.Element {
  return (
    <>
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect({ scopeKey, groupId: group.id })}
          title={group.description}
          className="inline-flex min-h-8 items-center rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs text-fg-primary hover:border-accent/40 hover:bg-hover-bg disabled:opacity-50"
        >
          {group.label}
        </button>
      ))}
    </>
  );
}

function CapabilityActions({
  selectedGroup,
  disabled,
  onSelect,
  onInsertDraft,
}: Pick<CapabilityChoicesProps, 'disabled' | 'onSelect' | 'onInsertDraft'> & {
  readonly selectedGroup: PartnerExpertCapabilityGroup;
}): JSX.Element {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect(null)}
        aria-label={t('extensions.expertCapabilityBack')}
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border-default bg-surface px-2 text-xs text-fg-secondary hover:bg-hover-bg disabled:opacity-50"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        <span>{selectedGroup.label}</span>
      </button>
      {selectedGroup.actions.map((action) => (
        <button
          key={action.id}
          type="button"
          disabled={disabled}
          onClick={() => onInsertDraft(action.promptTemplate)}
          title={action.description}
          className="inline-flex min-h-8 items-center rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs text-fg-primary hover:border-accent/40 hover:bg-hover-bg disabled:opacity-50"
        >
          {action.label}
        </button>
      ))}
    </>
  );
}

function CapabilityChoices({
  groups,
  selectedGroup,
  disabled,
  scopeKey,
  onSelect,
  onInsertDraft,
}: CapabilityChoicesProps): JSX.Element {
  if (!selectedGroup) {
    return (
      <CapabilityGroups
        groups={groups}
        disabled={disabled}
        scopeKey={scopeKey}
        onSelect={onSelect}
      />
    );
  }
  return (
    <CapabilityActions
      selectedGroup={selectedGroup}
      disabled={disabled}
      onSelect={onSelect}
      onInsertDraft={onInsertDraft}
    />
  );
}

export function PartnerCapabilityBar({
  onInsertDraft,
}: PartnerCapabilityBarProps): JSX.Element | null {
  const context = usePartnerExpert();
  const connectors = usePartnerConnectors();
  const { t } = useI18n();
  const [selection, setSelection] = useState<PartnerExpertCapabilitySelection | null>(null);
  const viewContext = connectors?.snapshot.context ?? context?.snapshot.context;
  if (viewContext?.surface !== 'partner') return null;
  const expert = context?.snapshot.state.expert;
  const connectorGroups = connectors
    ? projectPartnerConnectorGuidance(connectors.snapshot.state, t)
    : [];
  // User copies and old package guides keep their own authored shortcuts.
  const legacyGroups = expert?.expert.capabilityGuide?.groups ?? [];
  const groups = [...connectorGroups, ...legacyGroups];
  if (groups.length === 0) return null;
  const scopeKey = JSON.stringify([viewContext, connectors?.snapshot.state, expert]);
  const selectedGroup =
    selection?.scopeKey === scopeKey
      ? (groups.find((group) => group.id === selection.groupId) ?? null)
      : null;
  const disabled =
    connectors?.snapshot.loading === true ||
    connectors?.snapshot.changing === true ||
    context?.snapshot.loading === true ||
    context?.snapshot.changing === true ||
    (connectorGroups.length === 0 && context?.snapshot.state.available !== true);
  return (
    <div
      data-testid="partner-capability-bar"
      role="group"
      aria-label={t('extensions.connectorActions')}
      className="flex min-w-0 flex-wrap items-center gap-1.5"
    >
      <CapabilityChoices
        groups={groups}
        selectedGroup={selectedGroup}
        disabled={disabled}
        scopeKey={scopeKey}
        onSelect={setSelection}
        onInsertDraft={onInsertDraft}
      />
    </div>
  );
}
