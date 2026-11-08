/** @type {{ status: 'timed_out' }} */
const TIMED_OUT = { status: 'timed_out' };
/** @type {{ status: 'query_failed' }} */
const QUERY_FAILED = { status: 'query_failed' };

/**
 * Bound observation only; never consume the test's original failure or wait budget.
 * @template T
 * @param {Promise<T>} probe
 * @returns {Promise<T | typeof TIMED_OUT | typeof QUERY_FAILED>}
 */
export async function captureWithEvidenceBudget(probe) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {Promise<typeof TIMED_OUT>} */
  const expiry = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), 2000);
  });
  try {
    return await Promise.race([probe.catch(() => QUERY_FAILED), expiry]);
  } finally {
    clearTimeout(timer);
  }
}
