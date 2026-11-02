# Provider upgrade and account preservation — FEATURE_302 T12-H

Implementation baseline: Space `065cc39c` and KodaX parity `22e7bc708`, 2026-10-31.
This is unpublished work. The locked Registry SDK remains unchanged; local development uses
the existing `link:kodax` workflow. Production packaging must keep rejecting development links.
A release must first publish and pin the accepted SDK bytes and verify its capabilities.

## Accepted contract

Origin: KodaX FEATURE_302, section 7: “Space 在独立仓库/工作区实施，复用实际
KODAX_HOME/profile，保留 provider alias/account 映射及现有 broker 校验；CLI 已存不同值时不静默覆盖。”
“clientId、instanceId、instanceSecret、retired identity 和 exitRecovery 原值保持”，
不改身份协议，不删除 Partner 等其他 keychain 账户。

Space Main uses the SDK's protected, versioned `auth.json` beside the actual Runtime
`config.json`. `KODAX_HOME` wins when explicitly provided; the existing profile directory
and test isolation rules remain authoritative. Equal roots share the storage file, while
the selected credential source remains explicit. Different roots remain isolated; separate
Space directories within one root have separate private namespaces. CLI bindings retain
the default namespace, exact provider identity and SDK connection fingerprint. The Runtime's `coder` role is still
checked by the existing Host admission boundary; it does not rename the shared credential namespace.

Within the selected source, saved values precede the approved external environment. Normal provider reads and updates no
longer inject saved values into process.env. Every physical broker call carries its exact
connection proof; active denial, revoked grants and corrupt auth.json never fall back to env.
SDK native OAuth and cloud connections retain their full config metadata during verification
and credential acquisition. Native protocol catalog entries are visible; advanced connections
continue to be configured through SDK/CLI/config, while the existing form edits its supported
OpenAI/Anthropic fields. Presence/configuration is not an online verification result.

## Provider migration and UI

Only known, explicitly mapped accounts are inspected. The historical OpenAI/Codex alias is a
reviewed map; equal environment names do not grant sharing for arbitrary custom providers.
Legacy metadata discovery does not decrypt the whole store. A protected, conditional discovery
baseline distinguishes a fresh profile from one eligible for old-store lookup. Fresh installs
do not load a keychain. An eligible profile cannot interpret an unavailable backend as an absent
record; access is retried after the backend recovers. The baseline is not reconsidered merely
because a new install later creates its settings file.

A used legacy provider first pins its original connection/source, then copies the exact key to
a private Space namespace with an atomic conditional write. The old encrypted item is retained.
If CLI already has a different key, Space keeps its old account and CLI keeps its own. An initial
approved environment source is pinned without copying its value: removing that environment
variable later cannot silently select a CLI key. An initially selected shared key is pinned too.
Failure to persist this first selection fails closed. Once the original legacy source is durably
pinned, a copy failure can continue using that same old source and retry on the next operation;
the failure remains visible. A valid selected file entry no longer depends on the old backend.

Source selections, private keys and tombstones use reserved SDK bindings in the same v2 auth.json.
They commit through an atomic batch CAS and are not exposed as provider keys. Tombstones prevent
reimport, including after restart. A connection change cannot send a retained key to a new route;
the old binding remains protected, and the new route requires an explicit credential choice.
Returning after another route was explicitly selected also requires a choice; a retained private
backup must not silently displace an earlier explicit shared-account choice for that route.

Renderer receives only binding, revision, source and migration state. Keys enter Main through
the existing hidden input and are never read back. Card updates carry the displayed revision;
stale submissions fail. Save changes the selected scope. Only explicit **Share with CLI** (publish)
or **Use CLI shared credential** (adopt) changes sharing. Both compare the displayed private,
shared and selection revisions. Publish cannot revive a deleted private key. A rename moves a
key only between the same approved route and never overwrites a destination value or tombstone.
Removing a saved API key keeps the existing approved-environment fallback. When both sources
exist, the card explicitly says removal will use that environment value. It never reimports a
retained legacy key or adopts a different CLI account. API-key removal is distinct from OAuth logout; OAuth grants are managed through
the shared SDK/CLI login and logout flow. Sources include file, env, OAuth, cloud and external CLI.

Local OAuth session handles subscribe to the shared SDK invalidation fence. Revocation/account
changes close local operation/workflow scopes and invalidate pending/future broker replies before
Host cleanup. Cleanup failures remain visible. A new Host receives fresh authority through the
existing recovery path. Cross-process file refresh is transactional; it does not promise instant
cancellation of another process's already dispatched generation.

OAuth source replacement publishes the new pending session and fences the previous source before
waiting on migration/refresh storage locks. Pending initialization and completed acquire both
verify that their source is still current; a late old session cannot overwrite the new entry.
Leaving OAuth for an API key retires its old source first. Failed initialization clears only its
own pending entry, allowing retry without reviving a superseded account.

## Runtime client secrets

`RuntimeClientSecretStore` now uses reserved `space-client-identity` bindings in auth.json,
scoped to the actual owning root and account. These entries never appear in Provider IPC.
New installations do not load a keychain. Existing identities import the exact old secret only
when no current file entry or tombstone exists. Existing file entries win and do not require
the old OS backend. Failed import never generates a replacement identity.

Both the active account and retained exit-recovery account migrate on use. The identity JSON,
clientId, instanceId, secretAccount, createdAt and exitRecovery stay byte-for-byte unchanged
during storage migration. Old encrypted client backups are retained for recovery; unrelated
Partner storage and its native dependency remain intact. Explicit accepted-exit retirement
continues to follow the existing identity protocol.

The current SDK retired public inline Coder owner controls. A persisted Space `legacy` mode now
uses the normal SDK shared-Host upgrade/recovery path. This keeps the existing idle/busy and owner
checks: it does not force-stop an unknown Host or replay an active task. Test-injected historical
owner ports remain available for compatibility regressions. Third-party private embedded owner
factories/callback serialization still require migration; a second engine is not restored.

Runtime client secret initialization and strict legacy-store discovery retry after a temporary
failure instead of caching failure for the life of Main. A failed identity import never creates a
new identity. The SDK's default OAuth migration also retains the old sealed record after durable
copy; current file grants and revoked tombstones remain authoritative. Retained OAuth backups are
recovery data, not a second live refresh authority. Do not run old and new rotating-grant owners
concurrently or import a backup over a current revoked registration.

macOS explicit cancellation/authentication denial remains suppressed until relaunch or an explicit
save; ordinary storage/decoding failures retry after repair. This preserves dialog suppression
without treating every failure as a permanent denial. Cancellation/authentication status semantics
follow [Apple's Security result codes](https://github.com/apple-oss-distributions/Security/blob/main/base/SecBase.h)
(`errSecUserCanceled` / `errSecAuthFailed`, checked 2026-10-31); regression fixtures simulate these
errors and nested causes, rather than certifying actual macOS UI behavior.

Explicitly configuring OAuth selects its approved registration, independently of obsolete API-key
selection metadata. The broker checks proof against that same captured OAuth connection, retains
the old API key, and uses the canonical credential profile rather than a private storage namespace
when reporting grant presence. This does not relax revocation, service/profile or issuer checks.

These rules govern the paired upgraded SDK/Space. An older binary cannot interpret new source
selections or tombstones; retained backups alone do not make arbitrary downgrade or concurrent
old/new account changes transparent. Preserve the full profile and use the paired versions.

## Verification scope

Tests cover real SDK/CLI file sharing, a second Node process, conditional mutations, current-value
conflicts, corrupt/unavailable stores, exact proof, late broker replies, local OAuth revocation,
account/route separation and unchanged active/exit identity bytes. Existing Provider, Host and
identity regressions remain included. Windows file ACL behavior is supplied and tested by the SDK;
this run does not establish macOS/Linux OS-vault migration or real provider subscription entitlement.
Final combined acceptance and exact counts are recorded in the FEATURE_302 test guide after freeze.

## Historical T12-E/F/G acceptance — 2026-10-31

These counts cover the earlier accepted baseline, not the additional H changes above. The H
upgrade matrix and final review evidence are recorded separately after its verification completes.

- Complete `npm test`: release scripts **130 passed / 7 skipped**, Desktop **3,998 passed / 13 skipped**, IPC schema **370 passed**; **4,498 passed, 20 conditional skips, zero failures**. The first run's old private-owner/parent-registry fixtures were migrated to actual public daemon, loopback HTTP + Main broker, and Host-loaded tool/I/O fixtures; original behavior assertions remain. Original failure logs remain in OS temporary storage.
- Final review fixes have an additional **12 passing** SDK/Host/config regressions, real warmup write and **9 passing** credential regressions. The partial-ENOSPC RED leaves the old configuration truncated; GREEN uses a Core-lock-protected staged fsync/rename and leaves the previous bytes untouched. Cross-process shutdown fixtures verify runtimeId and owner exit before deleting their isolated home.
- New credential modules: **91.11% lines / 82.97% branches / 90.16% functions**. This is scoped coverage, not repository-wide coverage. Default OS-vault import bodies are not certified on macOS/Linux by this Windows run.
- `npm run typecheck`, `npm run lint` and `npm run build:smoke` passed. Existing Vite chunk-size warnings remain. Actual Electron Provider IPC passed on an isolated Windows desktop: save, cross-process update, stale delete rejection, sanitized list/config, deletion exposing the approved external env, and Renderer reload. A separate actual Node process verifies saved values survive process restart; Renderer reload alone is not an application restart test.
- Standards: **0 hard violations / 0 smell findings** after fixing the oversized factory and unsafe configuration write. Spec: **0 remaining findings** after fixing alias-route proof, mandatory displayed revisions, captured-binding deletion, atomic rename writes and test Host cleanup. Each axis independently re-reviewed the fixes and the Electron test.
- No real API/subscription/cloud credentials were used. Production installer acceptance remains subject to publishing/pinning the accepted Root SDK and the existing exact-byte release gate. `package-lock.json`, Registry dependency versions and production pack safeguards were not weakened; a development link is not a release artifact.

Detailed combined evidence and the provider/API/auth verification ledger live in KodaX
`docs/test-guides/FEATURE_302_v0.7.99_TEST_GUIDE.md`. Space remains isolated on
`codex/provider-credentials-space`; the original Space checkout and its dirty fixture were untouched.

## T12-H offline acceptance — 2026-10-31

H supersedes the earlier source-priority/cleanup policy; the historical E/F/G counts above remain
historical. Complete `npm test` run 3: release **130 passed / 7 skipped**, Desktop **4,031 passed /
13 skipped**, IPC **370 passed** — **4,531 passed, 20 conditional skips, zero failures**. Initial
shutdown-hook, explicit-owner-manifest and broad macOS failure-cache assertions were preserved in
failure logs, diagnosed and either fixed or replaced by precise cancellation-versus-failure cases;
no timeout or account/proof assertion was weakened.

Final credential/source scope: **56 passed**, **91.30% lines / 82.38% branches / 88.68% functions**
across five affected modules. Another 22 native-port/migration tests preserve cancellation/denial
suppression, concurrent deduplication and backend recovery. This is scoped coverage, not whole-repo
coverage or actual darwin UI evidence. `typecheck`, `lint` and final `build:smoke` passed.

Actual Electron **2 passed** on an isolated Windows desktop: save/share/CAS and redacted state;
full close/relaunch with provider files restored at the same path, env A removed without dispatching
CLI B, then explicit adopt dispatches B to an owned loopback server. This does not copy client
identity files; their exact-byte preservation has separate regressions. Root complete **18,659**,
published **70**, auth scoped coverage **96.03% lines / 83.41% branches**, and unchanged CLI budget
checks passed. Spec and Standards final reviews have no remaining findings.

Evidence lives in OS-temp `space-t12h-full{1,2,3}.log`, `space-t12h-coverage-final3.log`,
`space-t12h-electron-final.log`, native restore/type/lint/build and focused RED/GREEN logs.
Root's H section in the FEATURE_302 test guide records all initial failures and the read-only
upstream audit. There is no Registry/version update or production installer acceptance here.

## T12-I combined Root integration — 2026-10-31

The paired Root branch combines H `95e95a61` with the other chat's committed local main
`0fa38e5b2`. Both histories and credential/account/recovery boundaries remain. Root's original
`KodaX` branch and original Space `7801a8ca` working tree are untouched. This section separately
certifies the combined candidate, not the H snapshot alone.

The initial Space typecheck found five bare-Runtime arguments incompatible with Root's expanded
public Main authorization services (`createExecutionProfile` is now required). The private Space
helper actually consumes only credentials: its parameter now uses that narrow public service
type while retaining public request/return types. No runtime expression changes. Independent
transpilation equality and Spec/Standards reviews confirm unchanged JavaScript and no findings.
This is not a persona/Partner/profile implementation: that work must use trusted Main and the
actual Session Host catalog through the real profile helper, preserving existing tool ceilings.

Combined-candidate typecheck, lint and smoke build pass; the credential migration/source/OAuth/
identity slice has 37 passing tests, and Host/broker/account-isolation/exit/recovery has 324.
The first complete run passed release 130 / seven skipped and IPC 370. Desktop had 4,030 passed,
one failed and 13 skipped: the old fixture incorrectly required Partner to stay inline despite
the accepted unified Host contract. A six-second focused replay reproduced it. The fixture now
asserts v2 Partner identity across two processes, preserves legacy rejection when the capability
is absent, and rejects unsupported surfaces in both cases. Focused GREEN and both reviews pass;
the complete Desktop tier is rerun below. No dependency
version, lockfile, production byte gate, identity protocol or credential/account policy changes.
Desktop replay 2 also found an unrelated test cleanup hook race (`ENOTEMPTY` after a successful
receipt assertion). The fixture now blocks/drains tracked background verification through the
existing service `deactivate` before deleting its owned directory. All 35 connector tests pass;
no product behavior, timeout or business assertion is changed. A fresh complete Desktop replay
is recorded below; initial failures remain in `space-t12i-full1.log` and `space-t12i-desktop2.log`.
Final complete Desktop replay 3 passed: **4,031 passed / 13 skipped, zero failures**, 549.84 seconds.
Together with the unchanged green release/IPC tiers, complete acceptance has **4,531 passed /
20 conditional skips**. Final Electron source/test types and lint pass; smoke build passed before
the test-only changes. Actual Electron **two passed** (35.1 seconds), including full close/relaunch:
removing env A cannot dispatch CLI B; explicit adoption then dispatches B to the owned loopback
fixture. This does not certify client-identity file migration; separate regressions preserve its
exact active/exit-recovery bytes. The Node sqlite ABI is restored after Electron.
Both review axes have no remaining findings. Root complete 18,747 / published 71 / historical
cutover three / integrity-pinned alpha.11 Host upgrade one pass. Original Root remains clean at
`0fa38e5b2`; original Space remains `7801a8ca` with its pre-existing dirty fixture/research drafts.
No main branch, remote, Registry version or installer gate is updated by this acceptance.
Evidence: OS-temp `space-t12i-*` and paired `kodax-t12i-*`; the complete combined matrix and initial
compiler/budget failure dispositions belong in Root's FEATURE_302 test guide I section.

## T12-J Root main handoff checkpoint — 2026-10-31

Root is now locally integrated on `KodaX` at `db4e10bb`, including the other chat's newer
`a9587af7e` MCP/Skill fixes. Its design submodule local main is `8574086`. Actual-main complete
source 18,777 / serial package 80 / historical and real-alpha.11 Host four passed; source and
build bytes remained identical, with zero remaining review findings. See Root's FEATURE_302
test guide J for frozen checkpoints, hashes and scope. Nothing was pushed or published.

Space remains independent: product code is still `da531f0a`; J updates only these handoff docs.
The I counts above are historical and do not certify a newly paired Space build. Integrate and
validate with the responsible Space chat later, preserving source selection/proof/epoch/owner
and actual Host profile/catalog contracts. SDK dependency pins and production gates stay intact.

## alpha.12 source preparation (2026-11-02)

The combined preparation branch now routes both Coder and Partner through the shared Host. Historical inline-library fixtures above are not product migration evidence. Partner leases preserve read-only connector Plan eligibility, and OAuth request context preserves the trusted grant identity without replaying generation POSTs. Source credentials migration is reused unchanged in its account-selection/CAS/tombstone boundaries; combined verification is recorded separately in `docs/releases/kodax-0.7.97-alpha.12-preparation.md`. Expert default methods and queued binding timing remain an explicit SDK seam. Registry installation and final byte qualification are pending the user’s publication notice.
