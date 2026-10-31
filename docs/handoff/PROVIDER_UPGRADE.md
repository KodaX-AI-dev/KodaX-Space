# Provider upgrade handoff — FEATURE_302 T12-H/I

Updated 2026-10-31. This is an unpublished integration branch, not an installer release.

可转交说明：Root 在独立 `codex/llm-provider-parity` 分支完成 LLM 接入与老用户兼容补齐，并整合另一线程已提交的 `0fa38e5b2`，保留双方 Host/执行 profile/恢复与 Windows 回收改动，原 config/API_KEY 入口有效；原主分支未改动、未推送或发布。Space 配套代码位于独立 `codex/provider-credentials-space`：旧凭证自动迁到私有作用域并保留原副本，首次来源持久固定，只有显式发布/采用才共享；CLI 与 Space 不同账号不会自动合并，env 消失、墓碑、地址变化、迟到迁移/OAuth 刷新均不能悄悄改用另一账号，原客户端身份和退出恢复保持。Root 本轮全量 18,747、发布包 71、历史 Host 切换/真实 alpha.11 升级 4 项通过；配套 Space 本轮完整与实际重启证据见 I 验收条目。Space 私有授权 helper 已准确声明仅依赖 credentials，JavaScript 不变；这不替代负责线程的 persona/Partner/工具 profile 产品迁移，后者必须使用真实 Host 目录和公开 profile helper。请逐项整合配套分支，保留 credential proof/epoch/owner 与账号来源断言；先发布并锁定匹配 SDK，再走原生产安装包门禁。macOS/Linux 真实旧凭证库、真实账号权益和任意旧版降级仍需额外验证。

## 1. User intent

Keep existing config, environment keys, credentials and client identities working with minimal
upgrade friction. Automatically retry safe migrations, preserve recovery copies, and never choose
a different account silently. Space and CLI may share a file without sharing the selected account.

## 2. Progress and ownership

Space work is isolated at `C:\Users\ADMIN\.codex\workspaces\provider-credentials-space\KodaX-Space`,
branch `codex/provider-credentials-space`, H checkpoint `437cac7d`. The paired SDK is isolated at
`C:\Users\ADMIN\.codex\worktrees\llm-provider-parity\KodaX`, branch `codex/llm-provider-parity`,
H checkpoint `95e95a61`. H implementation and offline regression/review are complete; final evidence
is appended to the credential contract. Do not interpret earlier E/F/G/H counts as acceptance of
the subsequent combined I tree.
The original Root/Space checkouts belong to another working chat and were not edited.
I integrates committed Root `0fa38e5b213ee41eabb0f33e57f5353c5c507414` from the other chat's
local main development branch `KodaX`, preserving both histories after `f6a01046`. It includes
execution-profile/recovery, view close draining and Windows process-cleanup work. Uncommitted
work is never imported. Original Space `7801a8ca` and its dirty fixture/research drafts are outside
this combined acceptance. Root's local main is not updated by this operation. The checked remote
default branch is also `KodaX`, at `0f3930e95` (11 commits behind local main); recheck before merge/push.

The new Root public authorization services include `createExecutionProfile`. Space's private
authorization helper consumes only `credentials`; its parameter now explicitly declares this
narrow dependency, keeping the public request/return types. Emitted JavaScript is unchanged.
This does not implement Space's broader persona/Partner/tool-profile migration. When that work
uses profiles, trusted Main must call the real helper against the actual Session Host catalog;
do not fake the service or weaken the Root contract. Existing credential/Host lease behavior stays.

I offline acceptance is complete: Root 18,747 / published 71 / historical cutover three / real
integrity-pinned alpha.11 Host upgrade one; Space release 130, Desktop 4,031 and IPC 370 — 4,531
passed / 20 conditional skips. Final types, lint and smoke build pass. Actual Electron two passed,
including full close/relaunch, env A removal without adopting CLI B, and explicit adoption before
dispatch. The Node sqlite ABI was restored. Both review axes have no remaining findings.
The first Space run's stale Partner-inline expectation was replaced with capability-specific
cross-process identity/legacy rejection and unsupported-surface checks. A later connector cleanup
race was fixed by using existing `deactivate` to drain background notifications before deletion.
Complete Desktop replay 3 is green; product behavior and permission assertions are unchanged.
See [I evidence](../SDK_PROVIDER_CREDENTIALS.md#t12-i-combined-root-integration--2026-10-31).

## 3. Decisions and interfaces

The current contract is [SDK_PROVIDER_CREDENTIALS](../SDK_PROVIDER_CREDENTIALS.md). It supersedes
the earlier shared-file-wins/cleanup-after-import policy. A protected discovery baseline avoids
loading a keychain for new installs. Old provider keys migrate privately and originals remain;
environment/shared/legacy source and route are durably selected before use. First-pin failure
blocks the request; only an already pinned legacy source may continue after a copy failure.
Private sources never fall through to another CLI account, including after environment removal,
deletion, API-address changes, process restart or transient backend failure.
After another route is explicitly selected, returning to an earlier route also requires a clear
choice: do not automatically reuse a private backup that predates that route's shared selection.

`AtomicFileProviderCredentialStore` extends the unchanged single-record SDK API with coherent
`readApiKeys` and all-or-nothing `updateApiKeys`. The v2 disk format remains unchanged. Space's
reserved private/selection/discovery namespaces are Main-owned. `provider.shareKey` explicitly
publishes/adopts with displayed revisions; Save stays in the selected scope. Renderer never gets
a saved key. Preserve the existing connection proof, epoch invalidation and Host ownership checks.
An explicitly configured OAuth registration bypasses obsolete API-key source selection, checks
proof on the captured OAuth connection and reports the canonical grant profile; old keys remain.
Source swaps fence the old epoch before migration/refresh lock waits. Pending session creation
and final acquire must still belong to the selected entry; OAuth-to-API also retires old authority.

## 4. Pitfalls and compatibility limits

Do not delete old sealed provider/OAuth/client-secret copies, reinterpret backend unavailability
as absence, repin a stale UI state, revive a tombstone, inject stored keys into `process.env`, or
adopt a shared value automatically. Old OAuth backups must not become concurrent refresh owners.
Active/retired client identity and exit-recovery values are preserved; failed import must not
mint replacements. Persisted `legacy` Host mode uses SDK recovery; retired third-party private
embedded factories/callback serialization still need an explicit migration.
macOS explicit cancellation/denial stays suppressed until relaunch or explicit save; ordinary
backend/decoding failure can retry. Keep these cases separate when updating native-store adapters.

The local development link is not a production dependency. Publish/pin the accepted SDK bytes
before packaging Space, and keep exact-byte/link rejection gates intact. Windows test fixtures
and simulated darwin backend recovery do not certify real macOS/Linux vault migration, real
provider subscriptions/cloud accounts, old installer upgrades, or server-side token rotation.

## 5. Next steps for the responsible Space chat

Review and integrate the isolated commits against your current branch without overwriting dirty
work. Reconcile overlapping Main Provider, Host, identity and IPC changes; keep all account-source
assertions. Then rerun affected tests, the full suite and an isolated actual Electron upgrade test.
After publishing/pinning the paired SDK, run the existing production pack/installer acceptance on
each target platform. Validate temporary OS-store lock/recovery with owned test accounts. No live
customer credential reads or cleanup scripts are required by this handoff.
Retained backups do not make arbitrary downgrades account-safe: old binaries do not understand
new selections/tombstones. Integrate and release the paired SDK/Space, preserving the full profile.

## 6. File and evidence index

- Provider state/transactions: `apps/desktop/electron/providers/file-credentials*.ts`,
  `legacy-discovery*.ts`, `provider-storage*.ts` and `keychain.ts`.
- Retry/identity: `runtime-client-secret-file*.ts`, `legacy-storage-retry.test.ts`.
- Main/UI/schema: Provider IPC, ProviderCard and `packages/space-ipc-schema`.
- Actual desktop: `tests/e2e/provider-file-credentials.spec.ts`.
- Root design and final matrix: `docs/features/v0.7.99.md` sections 9–10 and
  `docs/test-guides/FEATURE_302_v0.7.99_TEST_GUIDE.md` in the paired Root checkout.
  Root `docs/features` is a separate Git repository/gitlink; carry its design commit with Root.
- Raw runs are OS-temporary `kodax-t12h-*` and `space-t12h-*` logs, never credential dumps.
  I integration adds `kodax-t12i-*` and `space-t12i-*`, including full1/Desktop2 failures,
  final Desktop3 and actual Electron/Node restore receipts.
  Keep initial failures and their eventual disposition visible in tracked acceptance evidence.

## 7. Suggested working discipline

Use the repository's `implement`/`tdd` instructions for fixes, `diagnosing-bugs` for reproducible
failures, and independent Spec/Standards `code-review` before integration. Do not rebuild Root
`dist` while Space tests import the linked SDK. Node tests and Electron use different sqlite native
ABIs; switch with the existing helper between runs. Verify shutdown of owned fixture Hosts before
removing their isolated homes; never terminate an unverified shared Host.
