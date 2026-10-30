# Shared provider credentials — FEATURE_302 T12-E/F

Implementation baseline: Space `7801a8ca` and KodaX parity `4b915c94`, 2026-10-31.
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
and test isolation rules remain authoritative. Equal roots use the same records as CLI;
different roots remain isolated. Provider bindings use the default credential namespace,
exact provider identity and SDK connection fingerprint. The Runtime's `coder` role is still
checked by the existing Host admission boundary; it does not rename the shared credential namespace.

Saved values precede the approved external environment. Normal provider reads and updates no
longer inject saved values into process.env. Every physical broker call carries its exact
connection proof; active denial, revoked grants and corrupt auth.json never fall back to env.
SDK native OAuth and cloud connections retain their full config metadata during verification
and credential acquisition. Native protocol catalog entries are visible; advanced connections
continue to be configured through SDK/CLI/config, while the existing form edits its supported
OpenAI/Anthropic fields. Presence/configuration is not an online verification result.

## Provider migration and UI

Only known, explicitly mapped accounts are inspected. The historical OpenAI/Codex alias is a
reviewed map; equal environment names do not grant sharing for arbitrary custom providers.
Old vault/keyring metadata discovery does not decrypt the whole store. A used provider imports
its value with a conditional file write, rereads the durable result, then cleans only the matching
old item. Tombstones prevent resurrection. A different current CLI value wins; the old value
is retained and the UI shows a migration warning. An unreadable legacy store is an explicit
migration state; a valid saved file remains usable without that backend. Missing file credentials
cannot silently bypass an unreadable old source.

Renderer receives only binding, revision, source and migration state. Keys enter Main through
the existing hidden input and are never read back. Card updates carry the displayed revision;
stale submissions fail. A rename moves a key only between the same approved route and never
overwrites a destination. Changing route leaves the old binding protected and requires a new
credential. API-key removal is distinct from OAuth logout; OAuth grants are managed through
the shared SDK/CLI login and logout flow. Sources include file, env, OAuth, cloud and external CLI.

Local OAuth session handles subscribe to the shared SDK invalidation fence. Revocation/account
changes close local operation/workflow scopes and invalidate pending/future broker replies before
Host cleanup. Cleanup failures remain visible. A new Host receives fresh authority through the
existing recovery path. Cross-process file refresh is transactional; it does not promise instant
cancellation of another process's already dispatched generation.

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

The current SDK retired public inline Coder owner controls. Production legacy fallback now fails
with a clear Host migration message instead of calling missing exports. Test-injected historical
owner ports remain available for compatibility regressions; this does not reintroduce a second engine.

## Verification scope

Tests cover real SDK/CLI file sharing, a second Node process, conditional mutations, current-value
conflicts, corrupt/unavailable stores, exact proof, late broker replies, local OAuth revocation,
account/route separation and unchanged active/exit identity bytes. Existing Provider, Host and
identity regressions remain included. Windows file ACL behavior is supplied and tested by the SDK;
this run does not establish macOS/Linux OS-vault migration or real provider subscription entitlement.
Final combined acceptance and exact counts are recorded in the FEATURE_302 test guide after freeze.


## Offline acceptance — 2026-10-31

- Complete `npm test`: release scripts **130 passed / 7 skipped**, Desktop **3,998 passed / 13 skipped**, IPC schema **370 passed**; **4,498 passed, 20 conditional skips, zero failures**. The first run's old private-owner/parent-registry fixtures were migrated to actual public daemon, loopback HTTP + Main broker, and Host-loaded tool/I/O fixtures; original behavior assertions remain. Original failure logs remain in OS temporary storage.
- Final review fixes have an additional **12 passing** SDK/Host/config regressions, real warmup write and **9 passing** credential regressions. The partial-ENOSPC RED leaves the old configuration truncated; GREEN uses a Core-lock-protected staged fsync/rename and leaves the previous bytes untouched. Cross-process shutdown fixtures verify runtimeId and owner exit before deleting their isolated home.
- New credential modules: **91.11% lines / 82.97% branches / 90.16% functions**. This is scoped coverage, not repository-wide coverage. Default OS-vault import bodies are not certified on macOS/Linux by this Windows run.
- `npm run typecheck`, `npm run lint` and `npm run build:smoke` passed. Existing Vite chunk-size warnings remain. Actual Electron Provider IPC passed on an isolated Windows desktop: save, cross-process update, stale delete rejection, sanitized list/config, deletion exposing the approved external env, and Renderer reload. A separate actual Node process verifies saved values survive process restart; Renderer reload alone is not an application restart test.
- Standards: **0 hard violations / 0 smell findings** after fixing the oversized factory and unsafe configuration write. Spec: **0 remaining findings** after fixing alias-route proof, mandatory displayed revisions, captured-binding deletion, atomic rename writes and test Host cleanup. Each axis independently re-reviewed the fixes and the Electron test.
- No real API/subscription/cloud credentials were used. Production installer acceptance remains subject to publishing/pinning the accepted Root SDK and the existing exact-byte release gate. `package-lock.json`, Registry dependency versions and production pack safeguards were not weakened; a development link is not a release artifact.

Detailed combined evidence and the provider/API/auth verification ledger live in KodaX
`docs/test-guides/FEATURE_302_v0.7.99_TEST_GUIDE.md`. Space remains isolated on
`codex/provider-credentials-space`; the original Space checkout and its dirty fixture were untouched.
