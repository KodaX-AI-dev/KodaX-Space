# 旧排队输入完整取回与丢响应恢复

## 新增：Main 重连、原 Host 存活的自动恢复

Space 用正式 `0.7.97-beta.1`、独立数据根、真实共享 Host 和本地 HTTP Provider 复现：Partner 有一个执行中 Run 和一个 7024 字 after-turn 输入，关闭原 Main，按原稳定 principal 连接新 Main；Host 仍确认原 inputId 为 queued、没有 Run，也没有 admissionError，但用原 inputId/全文/delivery/附件引用和新 execution-binding lease 重提时，返回 `Input ID already belongs to a different intent.`，原 Run 完成后队列仍不消费。停止这个已空闲 Host、保留原数据后再启动 Host，同一原意图则可以自动恢复为唯一 Run。探针为 `e2e/beta1-cold-queue-acceptance.mjs`，原失败见 `artifacts/diagnostics/beta1-fixes/b-real-cold-main.log`；成功的冷 Host 与仍失败的 live Host 分开记录在 `cold-main-host-report.json`，不能将整份测试通过解释成 live Host 已修复。

追加验收使用 `e2e/beta1-cold-queue-main.mjs` 启动真正独立的 Node Main 权限进程，分别正常关闭和强制终止，再由不同 PID 按原身份接续；两组都复现 live Host 卡住，并在真实 Host 重启后恢复唯一 Run。最终证据为 `b-real-main-close-crash-final.log` 和 `cold-main-{close,crash}-host-report.json`，不是同进程清理缓存的替代证明；Electron 整机断电仍需真机专项。

请 SDK 在原 Main 断开、执行 binding 已不可用而 Host 仍存活时，也将尚未消费的原输入转为可安全重绑的状态；同原 principal 重提完整原意图时，允许更新已失效的执行 binding，保持原 inputId、顺序、全文和附件引用。源码 `server.ts` 的执行 intent key 含 leaseId，`SessionInputQueue.find/rebind` 只对 awaitingBinding 排除旧执行 key；需要由 Host 在其锁内判断旧 binding 是否有效并完成转换，Space 不应猜内部摘要、读取私有队列、撤回再自动重发或重启用户 Host。仍有效的其他客户端 binding 不可被抢占，已提交 Run、未知外部效果和不匹配原文/主体继续拒绝重放。验收须覆盖 Main 单独关闭/崩溃、Host 同时重启、原 Run 正常或异常结束、无 admissionError、重绑与取回/消费竞态、原文超过预览及附件、重复请求与第二客户端；自动恢复无需用户操作，canonical 用户输入和根 Run 各只有一份，重绑失败需返回结构化原因，不能归为 Provider 错误。

## 旧原文与 durable 回执

Space 接入 beta.1 时发现一个旧队列接缝：公开 `getInput`/view 只返回裁剪预览，`withdrawInput` 首次成功才返回完整原输入，而再次撤回已 withdrawn 的输入会 conflict；旧版本 Space 未持久保存完整提交意图，因此 Host→Main 或 Main→Renderer 撤回成功响应丢失后，可能只剩预览，长文本和附件原引用无法再次取回。请在既有 Host/Product 契约中补充原 principal 可调用的完整排队输入读取，或同一 Session/inputId 幂等的撤回回执读取；全文、delivery/target 与附件引用均由 Host 原样返回，禁止从 preview 重建或在 Space 直读内部文件。读取/撤回须验证原 principal 和 Session 权限，不能让其他客户端取走原输入，确认成功后才从 UI 移除待处理状态，断连和冷 Host 恢复仍可按原操作身份查询。验收覆盖 alpha.12 遗留队列、超过 4096 字符的文本、图片/文件引用、撤回提交前后及两段链路丢响应、Main/Host 重启、重复撤回和外部 principal 拒绝；原文与附件不丢失、不产生第二次模型调用、不把未知结果当成功。Space 已为新提交输入保存私有完整恢复记录并实现幂等取回；对没有完整证明的旧队列保留原输入并事实拒绝，未以裁剪预览冒充全文。

补充组合崩溃窗口：新输入即使有 Main 完整意图，Host 已撤回、Main 尚未持久确认回执便崩溃，随后 Host 换代丢失 getInput 事实时，也不能证明已经撤回或仍在排队。此窗口仍需 SDK 的 durable 撤回回执/原文读取；Space 保留完整材料并事实拒绝，不能自动重提或报成功。

补充冷恢复可观测性：beta.1 的 pending queue 可只设内部 awaitingBinding，不产生 admissionError，公开 view/getInput 也不提供该原因；队首等待保持顺序并阻止本 Session 后项。Space 会先把自有完整 queued 意图的显式取回与 admissionError 解耦，再按原 principal/inputId/完整原意图重绑，不伪造 SDK 错误或绕过队首。若要精确展示 Host 等待重绑、普通等轮次和原 principal 不匹配，应在现有只读队列/input 事实公开结构化状态/原因，并按原权限约束披露；此增强不应把 awaitingBinding 伪装成 Provider 失败，也不取代完整原文和 durable 撤回回执。验收覆盖无 admissionError 的冷恢复、队首与后项顺序、只读事实和 rebind/withdraw 一致、其他 principal 不可获原文，恢复后状态清除。
