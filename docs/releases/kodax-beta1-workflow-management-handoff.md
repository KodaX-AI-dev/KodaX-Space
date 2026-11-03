# SDK 交接：共享 Host 工作流管理操作

2026-11-03，正式 Registry `@kodax-ai/kodax@0.7.97-beta.1`，Space 基线 `aaec22f6`。本次全面成品验收新增发现，不能由先前 Workflow start/pause/resume/stop 测试代替。

可直接转交：正式 beta.1 的共享 Host 工作流尚缺完整管理接缝：Space 用公开 `workflows.start` 创建并完成工作流后，现有重命名、删除仍落到 Main 进程旧的本地 lifecycle controller，真实成品调用均只返回 `{ok:false}`，Host 的原记录继续存在；当前 Product Client 的 `workflows` 只有 start/list/get/subscribe/pause/resume/stop，没有 Host owner 内的 rename/delete/prune。请 SDK 提供并通过明确能力版本公布共享工作流管理接口，由同一 Host 在正确身份、生命周期锁及并发校验下持久化重命名、删除和有明确策略的清理（清理保留 dry-run、活跃任务保护），同步更新内存目录、持久记录及订阅事实；操作应能区分成功、已不存在、版本冲突、不支持和未知结果，必要的请求身份/回执由 Host 持有。Space 随后只消费公开接口，不能另建进程内 Runtime、直接改 Host run 目录或伪造 UI 成功。验收必须用正式发布包和真实 daemon：创建完成任务→重命名后两个客户端的 list/get/订阅一致且重启后名称保留；删除后 list/get/重连与迟到恢复快照均不得复活；活跃任务保护、并发操作、丢响应/未知副作用及旧 Host 的类型化不支持均保留原记录且不自动重放；原有启动、暂停、恢复、停止、结果原文和 Space 历史本地任务仍回归通过。

## 实测反例

`tests/e2e/sdk-ui-contract-acceptance.spec.ts` 的 Host management 专项在旧成品跑出：

```json
{
  "rename": { "ok": true, "data": { "ok": false } },
  "delete": { "ok": true, "data": { "ok": false } },
  "retained": { "ok": true, "data": { "run": { "status": "completed" } } }
}
```

完整实际 runId、原名与 Host metadata 在隔离测试证据 `artifacts/diagnostics/beta1-full-acceptance/workflow-management-red/`，没有用户真实工作流。

当前 Space 的临时处理是根据实际 Host 能力明确禁用这两个按钮并解释原因，IPC 返回独立 `unavailableReason`；旧本地 controller 也拒绝接管已被 Host 确认拥有的 run。历史本地任务的管理保留。这是诚实的能力门禁，**不等于这两个功能已经修复完成**，总体验收仍保留 SDK 阻塞。
