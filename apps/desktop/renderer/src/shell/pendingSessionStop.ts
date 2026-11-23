import { z } from 'zod';

const key = 'kodax-space.pending-session-stops.v1';
const id = z.string().min(1).max(128);
const pendingSchema = z.record(
  z.object({ sessionId: id, runId: id, requestId: id, accepted: z.boolean().optional() }).strict(),
);
export type PendingSessionStops = z.infer<typeof pendingSchema>;
type StopStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readPendingSessionStops(storage: StopStorage): PendingSessionStops {
  const value = storage.getItem(key);
  if (!value) return {};
  const records = pendingSchema.parse(JSON.parse(value));
  if (Object.entries(records).some(([requestId, request]) => requestId !== request.requestId)) {
    throw new Error('Pending Stop request identity does not match its record.');
  }
  return records;
}

export function writePendingSessionStops(storage: StopStorage, records: PendingSessionStops): void {
  storage.setItem(key, JSON.stringify(pendingSchema.parse(records)));
}

/**
 * A terminal Run needs no Stop retry: drop its pending records so no stale retry control remains.
 * Returns the remaining records, or undefined when nothing was settled (storage untouched).
 */
export function settlePendingSessionStops(
  storage: StopStorage,
  sessionId: string,
  terminalRunIds: readonly string[],
): PendingSessionStops | undefined {
  const records = readPendingSessionStops(storage);
  const settled = Object.values(records).filter(
    (request) => request.sessionId === sessionId && terminalRunIds.includes(request.runId),
  );
  if (settled.length === 0) return undefined;
  for (const request of settled) delete records[request.requestId];
  writePendingSessionStops(storage, records);
  return records;
}
