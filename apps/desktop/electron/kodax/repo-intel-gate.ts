// The single source of truth for the repo-intelligence license gate.
//
// Repo-intelligence is a LICENSED capability. The SDK reads repo-intel config from the
// per-run `KodaXOptions.context` that Space builds fresh at each run entry — and Space
// has two such builders (chat: real-session.ts, workflow: workflow-controller.ts) plus
// a few read-only surfaces (version panel, /repointel status, /repointel warm). Every
// one of them MUST make the same entitlement decision. Rather than inline (and risk
// forgetting one — that was a real bypass), they all call the helpers here.
//
// Fail-closed + fault-tolerant: licenseManager.getStatus() re-reads + Ed25519-verifies
// the entitlement and writes state.json (clock observation) on nearly every call. A
// transient disk error must never reject a run/handler — on ANY failure, treat as
// unentitled (repo-intel off).

import { isLicenseActive } from '@kodax-space/space-ipc-schema';
import type { KodaXContextOptions } from '@kodax-ai/kodax/coding';
import type { RuntimeSessionSettingsPatch } from '@kodax-ai/kodax/runtime';
import { licenseManager } from '../license/manager.js';

/**
 * Context fields that express the gate — spread into a run's `context`.
 *
 * Derived from the SDK's own `KodaXContextOptions` via `Pick`, NOT a hand-written literal:
 * if a future SDK version renames or removes `repoIntelligenceMode` / `repoIntelligenceTrace`
 * (this SDK has a history of breaking renames in the repo-intel enum space), this Pick fails
 * to compile — turning a would-be SILENT bypass (Space keeps emitting a key the SDK no longer
 * reads → engine defaults back to full for unlicensed users, typecheck + tests still green)
 * into a build-time error the CI catches.
 */
export type RepoIntelContextFields =
  | Required<Pick<KodaXContextOptions, 'repoIntelligenceTrace'>>
  | Required<Pick<KodaXContextOptions, 'repoIntelligenceMode'>>;

const defaultEntitlement = (): Promise<boolean> =>
  licenseManager
    .getStatus()
    .then(isLicenseActive)
    .catch(() => false);

let entitlementResolver: () => Promise<boolean> = defaultEntitlement;

/** True only when a valid, active license grants repo-intelligence (fail-closed). */
export function isRepoIntelEntitled(): Promise<boolean> {
  return entitlementResolver();
}

/**
 * The repo-intel `context` fields for a run: entitled → enable the per-run trace toggle
 * (so onRepoIntelligenceTrace fires and the chip lights up); unentitled → force the
 * built-in engine off. Spread into every Space→SDK run context builder.
 */
export async function repoIntelContextFields(): Promise<RepoIntelContextFields> {
  return (await isRepoIntelEntitled())
    ? { repoIntelligenceTrace: true }
    : { repoIntelligenceMode: 'off' };
}

/** Host-owned Session overrides; an unlocked Session inherits the configured engine. */
export async function repoIntelSessionFields(): Promise<
  Pick<RuntimeSessionSettingsPatch, 'repoIntelligenceMode' | 'repoIntelligenceTrace'>
> {
  const entitled = await isRepoIntelEntitled();
  return { repoIntelligenceMode: entitled ? null : 'off', repoIntelligenceTrace: entitled };
}

/** Test-only: override the entitlement check (affects every gate site at once). */
export function _setRepoIntelEntitlementForTesting(fn: (() => Promise<boolean>) | null): void {
  entitlementResolver = fn ?? defaultEntitlement;
}
