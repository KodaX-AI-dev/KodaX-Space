/** Statistics reads may restart after projection replacement; executable input is never replayed. */
export async function readExecutionFactsPage<T extends object>(
  read: (options: { readonly cursor?: string; readonly limit?: number }) => Promise<T>,
  options: { readonly cursor?: string; readonly limit?: number },
): Promise<T & { readonly reset?: true }> {
  try {
    return await read(options);
  } catch (error: unknown) {
    if (
      options.cursor === undefined ||
      !error ||
      typeof error !== 'object' ||
      !('code' in error) ||
      error.code !== 'conflict'
    )
      throw error;
    return { ...(await read({ limit: options.limit })), reset: true };
  }
}
