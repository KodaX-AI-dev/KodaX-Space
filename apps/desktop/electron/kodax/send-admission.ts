/**
 * A session.send failure raised before any Runtime admission call. Retrying the same operation is
 * safe because nothing was submitted, so the send cache must not replay it.
 */
export class SendNotAdmittedError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'SendNotAdmittedError';
  }
}

export function notAdmitted(error: unknown): SendNotAdmittedError {
  return error instanceof SendNotAdmittedError ? error : new SendNotAdmittedError(error);
}
