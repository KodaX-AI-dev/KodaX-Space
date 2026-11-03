# SDK 交接：冷恢复后的视图观察与历史首读一致性

2026-11-03，正式 Registry `@kodax-ai/kodax@0.7.97-beta.1` 的真实 daemon 反例，不修改 SDK 源码或用户 Session。

可直接转交：全面成品验收发现，Script 已写入一部分结果、用户 Stop、Host 重启后，SDK 当前视图能显示已保存内容，但不带 cursor 的 `sessions.readHistory` 持续返回 `resync_required`，消息交替为会话读边界锁冲突与 `Session location topology changed during the read boundary`。独立 SDK 客户端已进一步证实：同一 Session 的新历史首读原本成功，调用 `sessions.observeView` 并关闭后，再次新首读立即发生拓扑冲突；公开 `sessions.load` 可刷新该状态，普通重复首读不能自行收敛。请 SDK 核查观测/冷恢复触发的元数据或存储位置变化，确保观测结束后的 admission/location/read fence 与实际存储状态一致，不要求客户端通过反复 load 才能读取新首屏；保留真实并发变更、过期 cursor/sourceRevision 的冲突语义和 opaque ID。验收应使用正式发布包、真实 Host、Script 部分写入→Stop→Host 冷重启→observeView→无 cursor 历史读取，并由第二客户端交叉验证：首读稳定可用、当前视图和历史内容一致、原工具结果和时间保留；并发写及旧分页仍正确失效，未知副作用不重放，不恢复已取消 Run，也不能把 Host ready 当作历史已加载。

## 独立公共接口证据

`artifacts/diagnostics/beta1-full-acceptance/script-view-churn-probe/` 中保留完整报告。核心信号为：

```json
{
  "before": { "ok": true, "itemCount": 8 },
  "refreshes": [{ "load": "loaded", "after": { "ok": true, "itemCount": 8 } }],
  "afterObservation": {
    "ok": false,
    "code": "resync_required",
    "message": "Session location topology changed during the read boundary for <isolated-session>"
  }
}
```

另有 `script-space-probe/` 记录先锁冲突、load 后拓扑冲突的交错；所有样本均为独立临时 profile 和本地 Provider，没有真实服务调用。

Space 的窄兼容只对新首读的明确 typed 锁/拓扑读冲突使用至多两次公开 `sessions.load`，然后直接读取新历史，不在每次重试时再打开会使边界失效的观察。旧 cursor 和其他错误不走这条恢复，不拼接 display 文本、不写 Session 文件、不重放输入。该兼容路径的 Script 部分写入→Stop→Host 冷重启成品专项已通过，独立证据为 `artifacts/diagnostics/beta1-full-acceptance/script-final.log`，最终新包完整套件中的同一场景也通过，见 `shipped-e2e.log`；这不能代表 SDK 根因或 Issue 371 首历史性能已经关闭。
