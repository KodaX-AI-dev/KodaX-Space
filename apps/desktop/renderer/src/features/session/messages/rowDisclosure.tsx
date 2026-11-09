// Row disclosure choices (expanded tools, open error details, long-query expansion) outlive the
// row component. Rows may unmount and remount (session switches today, transcript windowing in
// F144), and a remount must not reset what the user opened or change the row height under them.
//
// Only explicit user choices are stored, scoped by Session and owning row identity. Outside a
// transcript Session (popouts, isolated renders) the hook is plain local state.
//
// Entry animation follows the same rule: a row plays it on its first mount in a Session only.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface RowDisclosureScope {
  readonly sessionId: string;
  readonly ownerId?: string;
}

const RowDisclosureContext = createContext<RowDisclosureScope | null>(null);

const choicesBySession = new Map<string, Map<string, boolean>>();

function choiceKey(ownerId: string, part: string): string {
  return `${ownerId}\u0000${part}`;
}

export function readRowDisclosure(
  sessionId: string,
  ownerId: string,
  part: string,
): boolean | undefined {
  return choicesBySession.get(sessionId)?.get(choiceKey(ownerId, part));
}

export function writeRowDisclosure(
  sessionId: string,
  ownerId: string,
  part: string,
  open: boolean,
): void {
  let choices = choicesBySession.get(sessionId);
  if (!choices) {
    choices = new Map();
    choicesBySession.set(sessionId, choices);
  }
  choices.set(choiceKey(ownerId, part), open);
}

/** Transcript-level scope; `null` keeps every disclosure local. */
export function RowDisclosureSession({
  sessionId,
  children,
}: {
  readonly sessionId: string | null;
  readonly children: ReactNode;
}): JSX.Element {
  const scope = useMemo(() => (sessionId ? { sessionId } : null), [sessionId]);
  return <RowDisclosureContext.Provider value={scope}>{children}</RowDisclosureContext.Provider>;
}

/** Names the row (or nested card) that owns the disclosures rendered below it. */
export function RowDisclosureOwner({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): JSX.Element {
  const sessionId = useContext(RowDisclosureContext)?.sessionId;
  const scope = useMemo(() => (sessionId ? { sessionId, ownerId: id } : null), [sessionId, id]);
  return <RowDisclosureContext.Provider value={scope}>{children}</RowDisclosureContext.Provider>;
}

type DisclosureUpdate = boolean | ((open: boolean) => boolean);

export function useRowDisclosure(
  part: string,
  initial: boolean | (() => boolean),
): readonly [boolean, (update: DisclosureUpdate) => void] {
  const scope = useContext(RowDisclosureContext);
  const sessionId = scope?.sessionId;
  const ownerId = scope?.ownerId;
  const [open, setOpen] = useState(() => {
    const stored = sessionId && ownerId ? readRowDisclosure(sessionId, ownerId, part) : undefined;
    return stored ?? (typeof initial === 'function' ? initial() : initial);
  });
  const update = useCallback(
    (next: DisclosureUpdate) => {
      const resolved = typeof next === 'function' ? next(open) : next;
      setOpen(resolved);
      if (sessionId && ownerId) writeRowDisclosure(sessionId, ownerId, part, resolved);
    },
    [open, sessionId, ownerId, part],
  );
  return [open, update];
}

const revealedBySession = new Map<string, Set<string>>();

export function markRowRevealed(sessionId: string, rowId: string): void {
  let revealed = revealedBySession.get(sessionId);
  if (!revealed) {
    revealed = new Set();
    revealedBySession.set(sessionId, revealed);
  }
  revealed.add(rowId);
}

/** Latches at mount whether this row should play its entry animation. */
export function useRevealOnce(rowId: string, wanted: boolean): boolean {
  const sessionId = useContext(RowDisclosureContext)?.sessionId;
  const [play] = useState(
    () => wanted && !(sessionId && revealedBySession.get(sessionId)?.has(rowId)),
  );
  useEffect(() => {
    if (sessionId) markRowRevealed(sessionId, rowId);
  }, [sessionId, rowId]);
  return play;
}
