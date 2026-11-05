import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export const LOOPBACK_READY_PATH = '/_kodax/ready';

async function closeListener(server: Server, failure: unknown): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(new AggregateError([failure, error], 'Loopback listener cleanup failed'));
      else resolve();
    }),
  );
}

/** A bound TCP port can still be blocked by browser/Fetch HTTP rules. */
export async function listenFetchableLoopback(
  server: Server,
  signal: AbortSignal,
): Promise<AddressInfo> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Loopback listener did not bind');
      const response = await fetch(`http://127.0.0.1:${address.port}${LOOPBACK_READY_PATH}`, {
        signal,
      });
      await response.arrayBuffer();
      if (!response.ok) throw new Error(`Loopback readiness returned ${response.status}`);
      return address;
    } catch (error) {
      await closeListener(server, error);
      const blocked =
        error instanceof TypeError &&
        error.cause instanceof Error &&
        error.cause.message === 'bad port';
      if (!blocked || attempt === 2) throw error;
    }
  }
  throw new Error('Loopback listener could not select a fetchable port');
}
