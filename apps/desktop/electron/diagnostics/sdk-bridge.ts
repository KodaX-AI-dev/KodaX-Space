import type { StructuredLogger } from './logger.js';

let installation: Promise<void> | undefined;

/** Install the SDK's existing diagnostic sink before Runtime lifecycle work. */
export function initializeSdkDiagnostics(logger: StructuredLogger | null): Promise<void> {
  if (!logger) return Promise.resolve();
  installation ??= import('@kodax-ai/kodax/agent')
    .then(({ setKodaXDiagnosticSink, formatKodaXDiagnostic }) => {
      setKodaXDiagnosticSink((diagnostic) => {
        if (!['runtime:windows', 'runtime.daemon.capabilities'].includes(diagnostic.source)) {
          // Leave unrelated SDK diagnostics silent unless its existing explicit
          // stderr debugging switch is enabled. Do not collect conversation data.
          if (process.env.KODAX_DIAGNOSTICS_STDERR === '1') {
            process.stderr.write(`${formatKodaXDiagnostic(diagnostic)}\n`);
          }
          return;
        }
        logger.log(diagnostic.level, 'kodax-sdk', 'diagnostic', diagnostic.message, {
          source: diagnostic.source,
          detail: diagnostic.detail,
        });
      });
    })
    .catch((error: unknown) => {
      // Observability cannot prevent Runtime initialization or recovery.
      try {
        logger.warn('diagnostics', 'sdk_bridge_unavailable', undefined, error);
      } catch {
        process.stderr.write('[diagnostics] SDK diagnostic bridge unavailable\n');
      }
    });
  return installation;
}
