export type DiagnosticInspection<T> =
  | { readonly status: 'available'; readonly value: T }
  | { readonly status: 'runtime-unavailable' }
  | { readonly status: 'failed'; readonly error: string };

/** Optional live evidence must never prevent exporting the persisted failure logs. */
export async function captureDiagnosticInspection<T>(
  available: boolean,
  inspect: () => Promise<T>,
  timeoutMs = 10_000,
): Promise<DiagnosticInspection<T>> {
  if (!available) return { status: 'runtime-unavailable' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      inspect(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Runtime diagnostic inspection timed out.')),
          timeoutMs,
        );
      }),
    ]);
    return { status: 'available', value };
  } catch (error) {
    return {
      status: 'failed',
      error: (error instanceof Error ? error.message : String(error))
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 512),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
