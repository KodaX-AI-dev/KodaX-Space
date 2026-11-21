// ChildAgentLiveRows — what each running child agent is doing, under the bottom spinner.
// Motion reuses the tool-pulse spinner/caret, which styles.css gates for q-minimal and
// reduced motion.

import type { JSX } from 'react';
import { RowIcon } from './ToolClusterLive.js';
import { formatPulseDuration } from './toolClusterPulse.js';
import type { ChildAgentRow } from './childAgentRows.js';

function ChildAgentLiveRow({ row }: { row: ChildAgentRow }): JSX.Element {
  return (
    <li className="child-agent-row" data-testid="child-agent-live-row">
      <RowIcon status={row.status ?? 'running'} />
      <span className="child-agent-row-name">{row.name}</span>
      {row.mode === 'tool' ? (
        <>
          <span className="child-agent-row-tool">{row.tool}</span>
          <span className="child-agent-row-target">{row.text}</span>
        </>
      ) : (
        <span className="child-agent-row-think">
          <span className="tool-pulse-think-text">
            <span>{row.text}</span>
          </span>
          <span className="tool-pulse-caret" aria-hidden />
        </span>
      )}
      <span className="child-agent-row-time">
        {row.tokens && `${row.tokens} · `}
        {formatPulseDuration(row.elapsedMs, true)}
      </span>
    </li>
  );
}

export function ChildAgentLiveRows({
  rows,
  overflow,
}: {
  rows: readonly ChildAgentRow[];
  overflow: number;
}): JSX.Element | null {
  if (rows.length === 0) return null;
  return (
    <ul className="child-agent-rows" data-testid="child-agent-live-rows">
      {rows.map((row) => (
        <ChildAgentLiveRow key={row.id} row={row} />
      ))}
      {overflow > 0 && <li className="child-agent-row is-overflow">+{overflow}</li>}
    </ul>
  );
}
