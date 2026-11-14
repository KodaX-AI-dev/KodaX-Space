# beta.2 观测与历史问题：Space 根因更正

2026-11-05 根因复验已更正之前的 SDK 归因。完整证据、剩余验证及成品记录见 [根因复验](kodax-beta2-boundary-root-cause.md)。旧的历史失败、延长静置失败及 Stop 后草稿恢复记录保留，不能把它们单独当作 SDK 缺陷证明。

可转给 SDK 线程的澄清说明：

经正式 Registry `@kodax-ai/kodax@0.7.97-beta.2` 与真实 Host 的分层复现，之前 Space 报告的 observe 后历史 `resync_required` 已确认存在 Space 侧根因：新建会话投影 reducer 在首次收到与已有投影相同的空队列时，仍发布 queue 增量并推进版本；空闲观察退休/重建与 Renderer 快照补读形成反馈，约 21 秒产生 252 次 Session observe 和 247 次 Actor 查询，持续触发 Host 位置索引/存储围栏活动。在同一 Host/会话下暂停隔离 Space Main 后历史读稳定成功，恢复 Main 则再现；仅在 Space 增加“有效队列未变则不发布”的判断后，原始 SDK 读取通过，撤掉该行则失败重现，SDK 包及 Host 实现始终未改。纯 SDK 的 Script Stop、冷重启、多客户端观察等对照也通过。因此撤回此前要求 SDK 放宽历史围栏或修改该根因的请求；请保留真实并发写入、过期 cursor/sourceRevision 的拒绝语义。此外，移除反馈循环后发现前台空闲观察被 Space 过早释放，导致外部工作模式变更不能进入 UI；Space 已在 `ff4bdfa0` 修复单前台订阅保留与切换竞态，真正成品的 34 项专项和 6 项生命周期测试首次全部通过。Space 已修反馈循环，并将原先的 SDK limitation 注释改为严格成功断言；Space 的生产修复为 `ff4bdfa0`，测试/CI 补充为 `1a0bada0`；349 项针对性单测、真正成品 34 项专项与 6 项生命周期、核心场景三轮 9 次及额外 Partner 十轮均通过，最终四平台 build 和完整 Windows/Linux source CI 全绿且无重试。完整证据见根因复验；一次独立本地 Provider 连接超时尚未稳定定因，不据此新增 SDK 缺陷要求，Issue 371 性能及真实外部环境仍独立验收。
