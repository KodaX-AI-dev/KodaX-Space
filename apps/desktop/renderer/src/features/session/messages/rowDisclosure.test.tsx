import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../../i18n/I18nProvider.js';
import { SystemNotice, ToolCallCard } from './bubbles.js';
import {
  markRowRevealed,
  RowDisclosureOwner,
  RowDisclosureSession,
  readRowDisclosure,
  useRevealOnce,
  useRowDisclosure,
  writeRowDisclosure,
} from './rowDisclosure.js';

function Probe({ part, initial }: { part: string; initial: boolean }): JSX.Element {
  const [open] = useRowDisclosure(part, initial);
  return <span data-open={String(open)} />;
}

function renderInRow(sessionId: string | null, ownerId: string, node: JSX.Element): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <RowDisclosureSession sessionId={sessionId}>
        <RowDisclosureOwner id={ownerId}>{node}</RowDisclosureOwner>
      </RowDisclosureSession>
    </I18nProvider>,
  );
}

test('a fresh mount restores the choice the user made for the same row in the same session', () => {
  writeRowDisclosure('s-restore', 'row-1', 'details', true);
  assert.match(
    renderInRow('s-restore', 'row-1', <Probe part="details" initial={false} />),
    /data-open="true"/,
  );
  assert.match(
    renderInRow('s-restore', 'row-2', <Probe part="details" initial={false} />),
    /data-open="false"/,
  );
});

test('choices are isolated per session', () => {
  writeRowDisclosure('s-a', 'row', 'details', true);
  assert.match(
    renderInRow('s-b', 'row', <Probe part="details" initial={false} />),
    /data-open="false"/,
  );
});

test('outside a transcript session the default applies and nothing is stored', () => {
  assert.match(
    renderInRow(null, 'row', <Probe part="details" initial={true} />),
    /data-open="true"/,
  );
  assert.equal(readRowDisclosure('', 'row', 'details'), undefined);
});

test('a remounted tool card keeps the expansion the user chose', () => {
  writeRowDisclosure('s-tool', 'tool-1', 'tool-expanded', true);
  const markup = renderInRow(
    's-tool',
    'receipts-1',
    <ToolCallCard
      kind="tool_call"
      id="tool-1"
      toolId="call-1"
      toolName="bash"
      input={{ command: 'ls' }}
      result="done"
      status="done"
    />,
  );
  assert.match(markup, /aria-expanded="true"/);
});

test('a remounted error notice keeps its details open', () => {
  writeRowDisclosure('s-error', 'notice-1', 'error-details', true);
  const markup = renderInRow(
    's-error',
    'notice-1',
    <SystemNotice
      kind="system_notice"
      id="notice-1"
      variant="error"
      text="Provider failed"
      runtimeRunId="run-1"
    />,
  );
  assert.match(markup, /aria-expanded="true"/);
});

function RevealProbe({ wanted }: { wanted: boolean }): JSX.Element {
  return <span data-animate={String(useRevealOnce('row-r', wanted))} />;
}

test('a row already revealed in its session remounts without replaying the entry animation', () => {
  markRowRevealed('s-reveal', 'row-r');
  assert.match(renderInRow('s-reveal', 'row-r', <RevealProbe wanted />), /data-animate="false"/);
  assert.match(renderInRow('s-other', 'row-r', <RevealProbe wanted />), /data-animate="true"/);
  assert.match(
    renderInRow('s-other', 'row-r', <RevealProbe wanted={false} />),
    /data-animate="false"/,
  );
  assert.match(renderInRow(null, 'row-r', <RevealProbe wanted />), /data-animate="true"/);
});
