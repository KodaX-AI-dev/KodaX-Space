import type { InvokeChannelName, SpaceSessionLiveProjectionT } from '@kodax-space/space-ipc-schema';

import {
  runtimeProjectionController,
  type RuntimeProjectionController,
} from '../kodax/runtime/runtime-projection-controller.js';
import { runtimeHostAdapter } from '../kodax/runtime-host-adapter.js';
import { registerChannel } from './register.js';

type RuntimeChannelName = Extract<
  InvokeChannelName,
  'runtime.profileSnapshot' | 'session.liveSnapshot'
>;

type RuntimeChannelRegistrar = <C extends RuntimeChannelName>(
  name: C,
  handler: Parameters<typeof registerChannel<C>>[1],
) => void;

export function registerRuntimeProjectionChannels(
  controller: RuntimeProjectionController = runtimeProjectionController,
  register: RuntimeChannelRegistrar = registerChannel,
  readSessionLiveSnapshot: (sessionId: string) => Promise<SpaceSessionLiveProjectionT> = (
    sessionId,
  ) => runtimeHostAdapter.readSessionLiveSnapshot(sessionId),
  requestRuntimeProfileRefresh: () => void = () =>
    runtimeHostAdapter.requestRuntimeProfileRefresh(),
): void {
  // Return the main-process cache immediately, then reconcile core Runtime status in a separate
  // lane. A renderer reload must never wait for status or daemon management before it can paint.
  register('runtime.profileSnapshot', () => {
    requestRuntimeProfileRefresh();
    return controller.profileSnapshot();
  });
  register('session.liveSnapshot', ({ sessionId }) => readSessionLiveSnapshot(sessionId));
}

export function registerRuntimeStatisticsChannels(): void {
  registerChannel('session.productSnapshot', ({ sessionId }) =>
    runtimeHostAdapter.selectedHost() === 'runtime'
      ? runtimeHostAdapter.readSessionProductView(sessionId)
      : null,
  );
  registerChannel('session.productItem', (input) => runtimeHostAdapter.readProductItem(input));
  registerChannel('session.productSearch', async ({ sessionId, query }) => {
    const result = await runtimeHostAdapter.searchProductHistory(sessionId, query);
    return { ...result, hits: [...result.hits] };
  });
  registerChannel('session.statistics', ({ sessionId }) =>
    runtimeHostAdapter.readSessionStatistics(sessionId),
  );
  registerChannel('session.executionFacts', (input) =>
    runtimeHostAdapter.readSessionExecutionFacts(input),
  );
}
