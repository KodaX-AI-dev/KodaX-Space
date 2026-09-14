import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Link2 } from 'lucide-react';
import type {
  PartnerConnectorConnectionT,
  PartnerConnectorSnapshotT,
  PartnerConnectorStateT,
  SpaceConnectorDefinitionT,
} from '@kodax-space/space-ipc-schema';
import {
  usePartnerConnectors,
  requestPartnerConnectorManagement,
  type PartnerConnectorCatalogEntry,
} from './PartnerConnectorProvider.js';
import { useI18n } from '../../i18n/I18nProvider.js';
import { FloatingSurfaceHost } from '../../shell/FloatingSurfaceHost.js';
import type { FloatingSurfaceDescriptor } from '../../shell/floatingSurfacePolicy.js';
import { PartnerConnectorIcon } from './PartnerConnectorIcon.js';
import { isConfigurationRequiredConnector } from './partnerConnectorPresentation.js';

const popoverSurface: FloatingSurfaceDescriptor = {
  id: 'partner-connectors',
  kind: 'anchored_menu',
  owner: 'environment_hub',
  placement: 'trigger_anchored',
  modality: 'none',
  canAutoOpen: false,
  dismiss: 'outside_or_escape',
  focus: 'move_to_surface',
  label: 'Conversation connectors',
};

interface PartnerConnectorMenuRow {
  readonly extensionId: string;
  readonly connector: SpaceConnectorDefinitionT;
  readonly connection?: PartnerConnectorConnectionT;
  readonly selected?: PartnerConnectorStateT['connectors'][number];
  readonly connected: boolean;
  readonly configurationRequired: boolean;
  readonly index: number;
}

function unavailableConnection(binding: PartnerConnectorSnapshotT): PartnerConnectorConnectionT {
  return {
    id: binding.connectionId,
    extensionId: binding.extensionId,
    connectorId: binding.connectorId,
    revision: binding.connectionRevision,
    ...(binding.adapter ? { adapter: binding.adapter } : {}),
    profile: 'unavailable',
    accountLabel: binding.accountLabel,
    connected: false,
    permissions: { read: false, create: false, append: false, createBase: false },
  };
}

/** Project one connector per definition while retaining a removable row for stale session bindings. */
export function projectPartnerConnectorMenuRows(
  entries: readonly PartnerConnectorCatalogEntry[],
  selected: PartnerConnectorStateT['connectors'],
): readonly PartnerConnectorMenuRow[] {
  const rows: PartnerConnectorMenuRow[] = entries.map((entry, index) => {
    const configurationRequired = isConfigurationRequiredConnector(entry.connector.adapter);
    const selectedItem = selected.find(
      (item) =>
        item.binding.extensionId === entry.extensionId &&
        item.binding.connectorId === entry.connector.id,
    );
    const selectedConnection = configurationRequired
      ? undefined
      : entry.connections.find(
          (item) => item.connected && item.id === selectedItem?.binding.connectionId,
        );
    const firstConnected = configurationRequired
      ? undefined
      : entry.connections.find((item) => item.connected);
    return {
      ...entry,
      connection:
        selectedItem && !selectedConnection
          ? unavailableConnection(selectedItem.binding)
          : (selectedConnection ?? firstConnected),
      selected: selectedItem,
      connected: !!firstConnected,
      configurationRequired,
      index,
    };
  });
  for (const item of selected) {
    if (
      rows.some(
        (row) =>
          row.extensionId === item.binding.extensionId &&
          row.connector.id === item.binding.connectorId,
      )
    )
      continue;
    rows.push({
      extensionId: item.binding.extensionId,
      connector: {
        id: item.binding.connectorId,
        adapter: item.binding.adapter ?? 'feishu-cli',
        name: item.binding.name,
        description: '',
      },
      connection: unavailableConnection(item.binding),
      selected: item,
      connected: false,
      configurationRequired: isConfigurationRequiredConnector(item.binding.adapter ?? 'feishu-cli'),
      index: rows.length,
    });
  }
  return rows
    .sort((left, right) => {
      const selectedOrder = Number(!!right.selected) - Number(!!left.selected);
      const connectionOrder = Number(right.connected) - Number(left.connected);
      return selectedOrder || connectionOrder || left.index - right.index;
    })
    .slice(0, 5);
}

export function PartnerConnectorMenuContent({
  onClose,
  showHeading = true,
  connectedOnly = false,
}: {
  readonly onClose: () => void;
  readonly showHeading?: boolean;
  readonly connectedOnly?: boolean;
}): JSX.Element | null {
  const context = usePartnerConnectors();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const scopeKey = JSON.stringify(context?.snapshot.context);
  useEffect(() => {
    setError(null);
  }, [scopeKey]);
  if (!context || context.snapshot.context.surface !== 'partner') return null;
  const { snapshot, connectorCatalog } = context;
  const selected = snapshot.state.connectors;
  const projectedRows = projectPartnerConnectorMenuRows(connectorCatalog.entries, selected);
  const rows = connectedOnly
    ? projectedRows.filter((row) => row.connected && row.connection?.connected)
    : projectedRows;
  const toggle = async (connection: PartnerConnectorConnectionT): Promise<void> => {
    setError(null);
    try {
      if (selected.some((item) => item.binding.connectionId === connection.id))
        await context.binding.remove(connection.id);
      else
        await context.binding.select({
          extensionId: connection.extensionId,
          connectorId: connection.connectorId,
          connectionId: connection.id,
          connectionRevision: connection.revision,
          ...(connection.adapter ? { adapter: connection.adapter } : {}),
          documents: [],
        });
    } catch (reason) {
      if (JSON.stringify(context.binding.getSnapshot().context) === scopeKey)
        setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const busy = snapshot.loading || snapshot.changing;
  return (
    <div
      data-testid="partner-connector-menu-content"
      className={showHeading ? 'p-3 text-fg-primary' : 'py-1 text-fg-primary'}
    >
      {showHeading && (
        <div className="mb-3 flex items-center justify-between gap-3 text-xs">
          <span className="font-medium">{t('connectors.composer')}</span>
          <span className="text-fg-muted">
            {t('connectors.enabledCount', { count: selected.length })}
          </span>
        </div>
      )}
      {rows.map(({ extensionId, connector, connection, selected: item, configurationRequired }) => {
        const unavailable = !!item && (!item.available || !connection?.connected);
        return (
          <div
            key={`${extensionId}:${connector.id}`}
            data-testid="partner-connector-menu-row"
            className="flex items-center gap-2 px-3 py-2 hover:bg-hover-bg"
          >
            <PartnerConnectorIcon
              adapter={connector.adapter}
              className="h-4 w-4 shrink-0 text-accent-ink"
            />
            <p
              data-connector-name
              className="min-w-0 flex-1 truncate text-xs text-fg-secondary"
              title={item?.unavailableReason ?? connection?.accountLabel}
            >
              {connector.name}
            </p>
            {configurationRequired && item && connection ? (
              <button
                type="button"
                aria-label={t('connectors.removeUnavailable', { name: connector.name })}
                disabled={busy}
                onClick={() => void toggle(connection)}
                className="shrink-0 text-xs text-danger hover:underline disabled:opacity-40"
              >
                {t('connectors.remove')}
              </button>
            ) : connection ? (
              <button
                type="button"
                role="switch"
                aria-label={t('connectors.sessionSwitch', { name: connector.name })}
                aria-checked={!!item}
                disabled={busy || (!item && !snapshot.context.projectRoot)}
                onClick={() => void toggle(connection)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${item ? (unavailable ? 'bg-danger' : 'bg-accent') : 'bg-fg-muted/35'}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${item ? 'left-[18px]' : 'left-0.5'}`}
                />
              </button>
            ) : (
              <button
                type="button"
                aria-label={`${t('connectors.connect')} ${connector.name}`}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-fg-muted hover:text-fg-primary"
                onClick={() => {
                  onClose();
                  requestPartnerConnectorManagement(snapshot.context, extensionId);
                }}
              >
                <Link2 className="h-4 w-4" aria-hidden />
                {t('connectors.connect')}
              </button>
            )}
          </div>
        );
      })}
      {connectorCatalog.loading && (
        <p role="status" className="py-2 text-xs text-fg-muted">
          {t('common.loading')}
        </p>
      )}
      {!connectorCatalog.loading && !connectorCatalog.error && !connectorCatalog.entries.length && (
        <p className="py-2 text-xs leading-5 text-fg-muted">{t('connectors.emptyCatalog')}</p>
      )}
      {(error || snapshot.error || connectorCatalog.error) && (
        <p role="alert" className="py-2 text-xs text-danger">
          {error || snapshot.error || connectorCatalog.error}
        </p>
      )}
      <button
        type="button"
        className="mt-1 flex w-full items-center gap-2 border-t border-border-default px-3 py-2 text-left text-xs text-fg-secondary hover:bg-hover-bg hover:text-fg-primary"
        onClick={() => {
          onClose();
          requestPartnerConnectorManagement(
            snapshot.context,
            rows[0]?.extensionId ?? connectorCatalog.entries[0]?.extensionId,
          );
        }}
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden />
        {t('connectors.more')}
      </button>
    </div>
  );
}

/** One discoverable control; account connection and per-conversation enablement remain separate. */
export function PartnerConnectorChips(): JSX.Element | null {
  const context = usePartnerConnectors();
  const { t } = useI18n();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const scopeKey = JSON.stringify(context?.snapshot.context);
  useEffect(() => setAnchor(null), [scopeKey]);
  useEffect(() => {
    if (!anchor) return;
    const closeOnOutside = (event: MouseEvent): void => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setAnchor(null);
    };
    const closeOnMove = (): void => setAnchor(null);
    document.addEventListener('mousedown', closeOnOutside);
    window.addEventListener('resize', closeOnMove);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      window.removeEventListener('resize', closeOnMove);
    };
  }, [anchor]);
  if (!context || context.snapshot.context.surface !== 'partner') return null;
  const selected = context.snapshot.state.connectors;
  const connectedRows = projectPartnerConnectorMenuRows(
    context.connectorCatalog.entries,
    selected,
  ).filter((row) => row.connected && row.connection?.connected);
  const activeRows = connectedRows.filter(
    (row) =>
      !!row.selected &&
      row.selected.available &&
      row.selected.binding.connectionId === row.connection?.id,
  );
  if (!activeRows.length) return null;
  return (
    <div data-testid="partner-connector-chips" className="inline-flex items-center">
      <button
        ref={trigger}
        type="button"
        aria-label={t('connectors.composer')}
        title={t('connectors.composer')}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={() =>
          setAnchor((current) =>
            current ? null : (trigger.current?.getBoundingClientRect() ?? null),
          )
        }
        className={`inline-flex h-6 items-center rounded-md px-1 hover:bg-hover-bg ${selected.some((item) => !item.available) ? 'text-danger' : 'bg-surface-2 text-fg-muted'}`}
      >
        {activeRows.map((row, index) => (
          <span
            key={`${row.extensionId}:${row.connector.id}`}
            data-testid="partner-connector-active-icon"
            title={row.connector.name}
            className={`flex h-5 w-5 items-center justify-center rounded-full bg-surface ${index ? '-ml-1' : ''}`}
          >
            <PartnerConnectorIcon adapter={row.connector.adapter} className="h-5 w-5" />
          </span>
        ))}
      </button>
      {anchor && (
        <FloatingSurfaceHost
          surface={popoverSurface}
          role="dialog"
          ariaLabel={t('connectors.composer')}
          onClose={() => setAnchor(null)}
          testId="partner-connector-popover"
        >
          <div
            ref={panel}
            className="pointer-events-auto fixed w-60 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-border-default bg-surface shadow-2xl"
            style={{
              left: Math.max(12, Math.min(anchor.left, window.innerWidth - 252)),
              ...(anchor.top > 240
                ? { bottom: window.innerHeight - anchor.top + 8 }
                : { top: anchor.bottom + 8 }),
              maxHeight:
                anchor.top > 240
                  ? Math.min(420, anchor.top - 20)
                  : Math.max(160, window.innerHeight - anchor.bottom - 24),
            }}
          >
            <PartnerConnectorMenuContent
              onClose={() => setAnchor(null)}
              showHeading={false}
              connectedOnly
            />
          </div>
        </FloatingSurfaceHost>
      )}
    </div>
  );
}
