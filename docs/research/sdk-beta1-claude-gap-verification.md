# Claude 补审意见：逐项核实与方案归并

2026-11-03；Space `64fcfed3`、已安装 SDK `0.7.97-beta.1`。结论：补审有实质帮助，新增了冷身份缓存污染、Workflow 局部订阅恢复和 Artifact 能力诊断等遗漏，也使旧队列与旧 Linux profile 的处理方案更完整。下面依据实际源码核实，不将报告本身作为事实源；本轮新增发现仍是静态确认，未执行新的成品或故障复现。此前 env 来源探针的结果另见凭证调查。

## 五项意见的判断

| 意见                                                   | 判断与精确范围                                                                                                                                                                                                                                                                                                                                                              | 方案归并                                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1. 冷队列没有 admissionError，也没有取回按钮           | 确认。SDK 冷恢复以 deferAuthorization 安装内部 awaitingBinding；没有旧 error 时不生成 error，公开 read/list 不返回 awaitingBinding。队首等待时 batch 返回空，阻止本 Session 后项越过它。Space 仅在 admissionError 下展示取回。不能声称这些输入现在已经“可见阻断”。                                                                                                          | B1 先补队列恢复可见性/显式取回，B2 再补原身份重绑。普通排队不伪造为 SDK 错误；保留顺序。                                     |
| 2. 首次 command/workflow 把旧 Partner 缓存成 code      | 有条件确认。缺少 surface 缓存时，两入口默认 code，ensureSession 在校验前写正式缓存；校验失败不回滚，正常 Partner 输入也无法纠正。已进入初始有界 profile 的 Session 会预先正确填缓存；常见 Host ready 的 slash 还有 commitRuntimeMutation 前置保护。因此不能说所有未打开 Partner 的首次 slash 都必现。workflow/直接 command/启动竞态与未进 profile 的旧 Session 应分别复现。 | C1 P1：先权威解析/验证身份，再提交 cache；失败不能污染；不通过 retag 或清除真实冲突绕过。                                    |
| 3. 无 libsecret 的旧 profile 即使只有 env 也可能被拒绝 | 有条件确认。eligible 旧 profile、未固定来源、旧 backend 不可读时，发现状态为 unavailable，实际 read/test/Run 拒绝 env。fresh profile、已选文件/环境来源不属于此分支；describe 本身可返回 unavailable。拒绝是防未知旧账号被静默替换的设计，缺少显式恢复路径。                                                                                                                | A3：允许用户明确选择现有 env 或新保存来源，按所见状态 CAS 固定，保留旧材料；不把 backend 不可读当旧账号不存在。              |
| 4. command/workflow 没有先保证 Agent                   | 确认；是原 C 的必要细化。正常消息的 sync 不覆盖所有直接入口；旧 Coding Partner、其他客户端改值及等候重绑期间的设置变化要专项验证。                                                                                                                                                                                                                                          | C2：收口全部根执行入口与 Main mutation；不能在 Host 持锁 resolver 内再发设置 mutation。消费时竞态另查公开契约并列 SDK 接缝。 |
| 5. Workflow 没有 onError/重读快照                      | 确认。ready 只保证注册；subscription.error 可以只关闭该订阅而不关闭传输，现有 disconnected 恢复不会触发。重建后仍需 ready→list/get 同步错过的状态。                                                                                                                                                                                                                         | E：有界只读恢复、单个恢复任务、Runtime/generation 栅栏、快照协调、退出取消；不重新 start workflow。                          |

主要源码：

- 队列：SDK release `src/sdk-runtime.ts:9909`、`src/session-input-queue.ts:137,151-155,247-253,312`；[Space 取回门槛](../../apps/desktop/renderer/src/features/session/messages/bubbles.tsx#L575)。
- 身份：[入口默认](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7671)、[workflow](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7726)、[提前写 cache](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L3687)、[失败分支](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L3507)、[profile 预填](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L3203)、[slash 前置](../../apps/desktop/electron/ipc/slash.ts#L61)。
- 旧凭证：[eligible 条件](../../apps/desktop/electron/providers/legacy-discovery.ts#L16)、[strict 发现](../../apps/desktop/electron/providers/keychain.ts#L571)、[unavailable 拒绝](../../apps/desktop/electron/providers/file-credentials.ts#L59)。
- Agent：[正常同步](../../apps/desktop/electron/kodax/real-session.ts#L518)、[未完整收口的模式入口](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L4518)、[command/workflow](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L7664)。
- Workflow：[订阅](../../apps/desktop/electron/kodax/runtime-host-adapter.ts#L2644)、随包 `docs/CLIENT_CONTRACT.md:200-206`；SDK release `src/runtime-daemon/client.ts:2383-2414`。

## 附加意见的判断

1. **Artifact：局部可观测性缺口成立。** SDK catalog 有 `diagnostics.failures`，但 Space 未消费，builtin 安装只核验 Skill entry。Settings 已展示集成配置 domain 的 diagnostic，因此“完全没有诊断”过宽；配置健康也不等于每个 extension 成功。新 F 切片按当前加载/工具事实呈现 Artifact ready/degraded/unavailable，保留 last-known-good，不让可选扩展失败拖垮普通输入、Skills 或历史。[注册](../../apps/desktop/electron/skill/space-builtins.ts#L58)、[已有配置诊断](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L1116)；SDK release `packages/coding/src/extensions/runtime.ts:555-579`、`packages/coding/src/extensions/types.ts:141-156`，详见其余契约调查追加节。
2. **文案清理应覆盖全部现行入口。** ProviderCard 的 keychain fallback、BottomBar 的 doctor、Settings、自定义表单、README/README_CN、PRD/HLD 和现行注释都要同步。PRD/HLD 的旧“必须 OS Keychain、禁止明文”与本会话已采纳的 auth.json 方案冲突，应更新为既定新方案，不作为重新征求授权的理由。历史发布记录保留当时事实并加后续说明，不全仓盲替换。[详细位置清单](sdk-beta1-credentials-audit.md)、[其余文案清单](sdk-beta1-contract-inventory.md)。
3. **memory 警告不能简单整体删除。** 当前 Provider 后端恒 file，Provider 页原 memory 告警已不能表达现状；但连接器仍可能降到 memory。应移除/改正不再可达的 Provider 告警，并为真实 connector 后端单独报告持久性与失败。[file 后端](../../apps/desktop/electron/providers/provider-storage.ts#L282)、[旧 memory 写](../../apps/desktop/electron/providers/keychain.ts#L264)、[Provider 告警](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx#L2878)。
4. **连接器存储要分三类。** Provider auth.json、Space 连接器旧 store、外部 DingTalk CLI 自管目录不同。Space 连接器在 Win/mac 为受系统保护的加密 vault（并保留旧迁移），Linux 可走 libsecret 或 memory；部分 memory 降级有日志但缺用户持久性提示。DingTalk 目录并非可直接认定的明文 token；其固定官方版本使用 token 密文和系统 Keychain 中的 DEK。不得偷用测试 file-DEK 方案。[连接器端口](../../apps/desktop/electron/partner-connectors/runtime.ts#L21)、[DingTalk 目录](../../apps/desktop/electron/partner-connectors/dingtalk-connector.ts#L95)、[官方 v1.0.61 源码](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/v1.0.61/internal/keychain/keychain_darwin.go#L248)。
5. **“Main 旧 keychain 只读”须限定层次。** Main stable secret 的 legacy adapter 禁止写新值，但底层读取可能把同一原秘密从旧 keyring 导入或修复到 vault。因此不应扩大成整个旧存储层绝不发生写入；新认证材料与同原值迁移不同。[Main adapter](../../apps/desktop/electron/kodax/runtime/runtime-client-secret-file.ts#L29)、[读取迁移](../../apps/desktop/electron/providers/keychain.ts#L227)。
6. **缺测试的判断按层次收窄。** 旧 Partner/独立库已有相关单测或夹具，不能写全仓零测试；缺少的是已发布 beta.1 共享 Host 下 Partner 的 fork/retry/compaction/model switch、真实冷恢复及独立 Actor 不借根 binding 等完整证明。将它们纳入验收矩阵，不用旧夹具或可见正文相同替代 native/授权保真。[Partner 调查](sdk-beta1-partner-audit.md)。

## 未证实与未解问题

- 新发现没有在本轮实际客户环境或成品中复现；实施时先做 RED 与真实 Host 故障注入。具体触发范围不能从静态缺口直接推成所有会话必现。
- Host 内部 awaitingBinding 当前不公开。Space 可以让自有完整 queued 意图显式取回并显示本地恢复进度；若要精确展示 Host 等待原因，需 SDK 补只读事实，不能由缺 error 猜造。
- Partner 消费时的 Agent 不变量经补查确有公开契约不足：profile/request 不带所需模式，view 可能复用旧 loading。外层 CAS 无法独立证明跨客户端的 dequeue/command/workflow 竞态已关闭；新增 [SDK 原子模式准入交接](../releases/kodax-beta1-partner-mode-admission-handoff.md)，Space 的入口修复先做，原子保证须等正式 SDK 接口与实测闭环。

本次只修改调研和方案文档；未改生产代码、SDK、真实用户数据或原生构建。
