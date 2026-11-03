import { randomUUID } from 'node:crypto';
import type { KodaXDaemonRuntime, RuntimeSessionPromotionResult } from '@kodax-ai/kodax/runtime';
import { getSessionRuntimeStore } from '../session-runtime-store.js';

const pending = new Map<string, Promise<RuntimeSessionPromotionResult>>();

export function promoteHostSession(
  runtime: KodaXDaemonRuntime,
  sessionId: string,
  tag: 'code' | 'partner',
) {
  const key = `${sessionId}:${tag}`;
  const current = pending.get(key);
  if (current) return current;
  const operation = promote(runtime, sessionId, tag).finally(() => pending.delete(key));
  pending.set(key, operation);
  return operation;
}

async function promote(runtime: KodaXDaemonRuntime, sessionId: string, tag: 'code' | 'partner') {
  const capability = runtime.capabilities?.sessionPromotion;
  if (
    !capability ||
    typeof capability !== 'object' ||
    !('version' in capability) ||
    capability.version !== 1
  )
    throw Object.assign(new Error('Quick Ask promotion requires an upgraded Host.'), {
      code: 'daemon_upgrade_required',
    });
  const store = getSessionRuntimeStore();
  let intent = (await store.read(sessionId))?.promotion;
  if (intent && intent.tag !== tag) throw new Error('Quick Ask promotion destination changed.');
  if (!intent) {
    const session = await runtime.sessions.load(sessionId);
    if (!session.metadataRevision)
      throw new Error('Host did not provide a Session metadata revision.');
    intent = {
      requestId: `space-promotion-${randomUUID()}`,
      expectedRevision: session.metadataRevision,
      tag,
    };
    if (!(await store.set(sessionId, { promotion: intent })))
      throw new Error('Quick Ask promotion intent could not be saved.');
  }
  const verify = (receipt: RuntimeSessionPromotionResult) => {
    if (
      receipt.requestId !== intent.requestId ||
      receipt.session.id !== sessionId ||
      receipt.session.tag !== tag
    )
      throw new Error('Host returned a different Quick Ask promotion.');
    return receipt;
  };
  const previous = await runtime.sessions.readPromotion(sessionId, intent.requestId);
  if (previous) return verify(previous);
  try {
    return verify(await runtime.sessions.promote({ sessionId, ...intent }));
  } catch (error) {
    // A lost response may follow a committed mutation. Query the original operation only.
    const committed = await runtime.sessions.readPromotion(sessionId, intent.requestId);
    if (committed) return verify(committed);
    throw error;
  }
}
