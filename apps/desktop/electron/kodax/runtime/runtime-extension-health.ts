import path from 'node:path';
import type { KodaXDaemonRuntime } from '@kodax-ai/kodax/runtime';
import { redactDiagnosticText } from '../../diagnostics/redaction.js';

type Catalog = Awaited<ReturnType<KodaXDaemonRuntime['catalog']['extensions']>>;
const label = (value: string) =>
  redactDiagnosticText(path.basename(value.replaceAll('\\', '/').split(/[?#]/)[0]!), {
    maxStringLength: 160,
  }).slice(0, 160);
function failureReason(message: string): string {
  if (/real Node\.js|Node\.js.*(?:PATH|worker)|worker.*Node\.js/i.test(message))
    return 'Artifact worker requires real Node.js >=20.16 on the shell PATH. Other conversation tools remain available.';
  if (/not started by KodaX Space/.test(message))
    return 'Artifact tools need the Host started by KodaX Space; another KodaX installation such as the CLI started this one.';
  if (/Cannot find (?:module|package)|ENOENT|module not found/i.test(message))
    return 'An extension module or dependency is missing. Check the installed package resources.';
  if (/EACCES|EPERM|permission denied/i.test(message))
    return 'The extension could not access a required resource. Check its file permissions.';
  return 'The extension reported a failure. Consult Host diagnostics for details.';
}
/** Loaded catalog and failure history are separate facts; a prior failure cannot prove current unavailability. */
export function projectExtensionHealth(catalog: Catalog) {
  const extensions = catalog.extensions
    .slice(0, 128)
    .map((entry) => ({ name: label(entry.path), loaded: true }));
  const tools = (catalog.diagnostics?.tools ?? [])
    .slice(0, 256)
    .map((tool) => tool.name.slice(0, 160));
  const skills = extensions.some((entry) => entry.name === 'space-builtins.mjs');
  const artifacts =
    extensions.some((entry) => entry.name === 'space-artifacts.mjs') &&
    (catalog.diagnostics?.tools ?? []).some((tool) => tool.name.startsWith('artifact_'));
  return {
    state: !catalog.active
      ? ('unavailable' as const)
      : skills && artifacts
        ? ('ready' as const)
        : ('degraded' as const),
    active: catalog.active,
    builtins: { skills, artifacts },
    extensions,
    tools,
    failures: (catalog.diagnostics?.failures ?? []).slice(-16).map((failure) => ({
      stage: failure.stage,
      message: failureReason(failure.message),
      target: label(failure.target),
      occurredAt: failure.occurredAt.slice(0, 64),
    })),
  };
}
