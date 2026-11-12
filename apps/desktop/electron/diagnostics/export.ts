import JSZip from 'jszip';
import type { DiagnosticsExportCategory } from '@kodax-space/space-ipc-schema';
import { redactDiagnosticValue } from './redaction.js';
import {
  collectDiagnosticLogs,
  type DiagnosticLogOptions,
  type DiagnosticLogSource,
} from './log-collection.js';

const DEFAULT_CATEGORIES: readonly DiagnosticsExportCategory[] = [
  'manifest',
  'logs',
  'capabilities',
  'release',
  'degradations',
];

export interface DiagnosticBundleOptions extends DiagnosticLogOptions {
  readonly spaceVersion: string;
  readonly sdkVersion: string;
  readonly hostSdkVersion?: string;
  readonly platform: string;
  readonly categories?: readonly DiagnosticsExportCategory[];
  readonly capabilities?: unknown;
  readonly release?: unknown;
  readonly degradations?: unknown;
  readonly now?: () => Date;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function buildDiagnosticBundle(options: DiagnosticBundleOptions): Promise<Uint8Array> {
  const categories = [...new Set(options.categories ?? DEFAULT_CATEGORIES)];
  const included = new Set(categories);
  const now = options.now?.() ?? new Date();
  const zip = new JSZip();
  const notices: string[] = [];

  let logSources: readonly DiagnosticLogSource[] = [];
  if (included.has('logs')) {
    const collected = await collectDiagnosticLogs(options);
    for (const file of collected.files) zip.file(file.path, file.content);
    notices.push(...collected.notices);
    logSources = collected.sources;
  }

  const redact = (value: unknown): unknown =>
    redactDiagnosticValue(value, {
      secretValues: options.secretValues,
      privatePathPrefixes: options.privatePathPrefixes,
      maxStringLength: 16 * 1024,
    });

  if (included.has('capabilities')) {
    zip.file('capabilities.json', json(redact(options.capabilities ?? { unavailable: true })));
  }
  if (included.has('release')) {
    zip.file('release.json', json(redact(options.release ?? { unavailable: true })));
  }
  if (included.has('degradations')) {
    zip.file(
      'known-degradations.json',
      json(redact(options.degradations ?? { unavailable: true })),
    );
  }
  if (included.has('manifest')) {
    zip.file(
      'manifest.json',
      json({
        formatVersion: 1,
        generatedAt: now.toISOString(),
        spaceVersion: options.spaceVersion,
        sdkVersion: options.sdkVersion,
        ...(options.hostSdkVersion === undefined ? {} : { hostSdkVersion: options.hostSdkVersion }),
        platform: options.platform,
        categories,
        notices,
        ...(included.has('logs') ? { logSources } : {}),
        remoteUpload: false,
      }),
    );
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX',
  });
}
