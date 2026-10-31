# Provider upgrade handoff — FEATURE_302 T12-H

Updated 2026-10-31. This is an unpublished integration branch, not an installer release.

可转交说明：Root 已完成 LLM 接入能力对齐和 T12-H 兼容补齐，原 config/API_KEY 入口保留；Space 在独立 `codex/provider-credentials-space` 分支接入同根 auth.json，但旧 Space 凭证自动迁到私有作用域、保留原加密副本，与 CLI 不同账号不会自动合并，首次来源须持久固定，只有显式发布/采用才共享。迁移中断可安全重试，缺失来源、删除墓碑、迟到 OAuth 刷新和地址切换均不能改用别的账号，稳定身份与退出恢复原值保持；macOS 取消保护与普通故障自愈分开处理。Root 完整 18,659、发布包 70，Space 完整 4,531 和实际 Electron 两项均通过，两轴复审无剩余问题。请整合本分支及配套 Root SDK，重点保留这些凭证/epoch/owner 边界；原 Root 已推进到 `422acd4a` 的 Host/执行配置等后续工作尚未合入本隔离分支，需对重叠修改逐项协调并重跑合并后的验收。发布前须发布并锁定配套 SDK、通过原安装包门禁；macOS/Linux 真实旧凭证库、真实账号权益及任意旧版降级不属于本次已验证范围。

## 1. User intent

Keep existing config, environment keys, credentials and client identities working with minimal
upgrade friction. Automatically retry safe migrations, preserve recovery copies, and never choose
a different account silently. Space and CLI may share a file without sharing the selected account.

## 2. Progress and ownership

Space work is isolated at `C:\Users\ADMIN\.codex\workspaces\provider-credentials-space\KodaX-Space`,
branch `codex/provider-credentials-space`, baseline `065cc39c`. The paired SDK is isolated at
`C:\Users\ADMIN\.codex\worktrees\llm-provider-parity\KodaX`, branch `codex/llm-provider-parity`,
baseline `22e7bc708`. H implementation and offline regression/review are complete; final evidence
is appended to the credential contract. The paired source is this Root branch's H delta after
that baseline, not baseline SDK bytes alone. Do not interpret earlier E/F/G counts as H acceptance.
The original Root/Space checkouts belong to another working chat and were not edited.
The read-only upstream audit now sees Root `422acd4a84eb788e4bfe9d08da19ec5a4e2cc821`
(new execution-profile/recovery and Windows process-cleanup work after `f6a01046`) and Space
`7801a8ca` with its existing fixture plus new research drafts. This integration branch deliberately
does not import that chat's ongoing work. The Root overlap snapshot is OS-temp
`kodax-t12h-overlap-audit.json` (23 paths); reconcile Host/broker/schema, SDK client/runtime,
coding substrate/types, bundle metadata and migration docs before combined acceptance.

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
- Root design and final matrix: `docs/features/v0.7.99.md` section 9 and
  `docs/test-guides/FEATURE_302_v0.7.99_TEST_GUIDE.md` in the paired Root checkout.
  Root `docs/features` is a separate Git repository/gitlink; carry its design commit with Root.
- Raw runs are OS-temporary `kodax-t12h-*` and `space-t12h-*` logs, never credential dumps.
  Keep initial failures and their eventual disposition visible in tracked acceptance evidence.

## 7. Suggested working discipline

Use the repository's `implement`/`tdd` instructions for fixes, `diagnosing-bugs` for reproducible
failures, and independent Spec/Standards `code-review` before integration. Do not rebuild Root
`dist` while Space tests import the linked SDK. Node tests and Electron use different sqlite native
ABIs; switch with the existing helper between runs. Verify shutdown of owned fixture Hosts before
removing their isolated homes; never terminate an unverified shared Host.
