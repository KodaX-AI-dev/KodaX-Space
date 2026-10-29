# SDK 任务报告改动复核

2026-10-29 接入进展：已安装 Registry alpha.11；当前 Space 适配与验证以 [alpha.11 integration](../releases/kodax-0.7.97-alpha.11-integration.md) 为准。以下保留发包前只读评审证据。

发包前结论：`70aedacd790dc18e967468d993696f8545962a52` 已关闭首轮 P2，
任务报告改动范围可以进入发包。Space 尚未升级，待新版本发布后接入并做包内回归。

2026-10-28。只读检查 `C:/Works/GitProj/KodaX-AI/KodaX` 的
`0d723c6e..d244ddfa61a6be3649a65f42892608a7637c0217`，共 21 文件。
工作区中其他 Skill、LLM、媒体改动未纳入本轮结论，也未修改 SDK 源码或安装依赖。
Space 仍使用 Registry alpha.10，尚未接入这个未发布提交。

依据：本会话的 SDK 转交需求，以及 SDK 的 `docs/CLIENT_CONTRACT.md`、
`docs/SPACE_SDK_SEAMS.md`、`FEATURE_298_v0.7.97_TEST_GUIDE.md` 的任务报告段。
规范依据 `AGENTS.md`、`CONTRIBUTING.md`、ADR-062 输出所有权条款和代码坏味道基线。

## 首轮 Standards（d244ddfa）

1. **P2 — 按正文去重会删除独立通知**。
   `packages/repl/src/ui/utils/restore-history.ts:489–494` 的 `taskEnvelopes`
   收集任务消息的全部 trim 正文，再删除所有同文 `event/info`；集合不只包含旧 XML，
   也不校验任务/Run/Turn 来源。这违反 ADR-062 §6 对无来源旧 UI 数据不能按文本
   无损去重的约束，明确属于独立展示的通知也会被删除。

   已通过公开 `restoreSessionViewItems` 复现：canonical 任务 `child-run/child` 的
   模型侧正文为 `Task completed`，报告为 `# Child report`；另有
   `id=independent-notice`、`sourceRunId=notice-run`、`sourceTurnId=notice-turn`、
   `presentationOnly=true` 的独立 info，也为 `Task completed`。输出只有任务报告，
   独立通知消失。只将独立通知正文改为不同文字，输出立即恢复两项。

   建议只在可证明为同一任务镜像的来源/身份边界去重；明确独立或无法证明的记录
   保留。补充同文独立 event/info、缺来源旧记录、确证镜像只保留一份的回归。

## 首轮 Spec（d244ddfa）

独立静态需求评审 0 项。结构化 source、身份、完成/失败/取消/未知、Markdown 格式
已进入 Product view/history；全文仍使用既有读取方法，规范消息保留，未新增分页
接口或把子任务失败转为主 Run Provider 错误。混合新旧报告和已知身份冲突有覆盖。

主线程另确认上述独立通知丢失，首轮建议先修这一处再发包。

实际复验：8 个相关源码测试文件、179 项通过；源码及测试类型检查通过；构建后
公开 SDK 对独立 daemon 的 IPC、四份报告、完整正文和 Host 重启回归 1 项通过。
另有公开投影对照探针稳定复现上述数据丢失。关键改动文件与待审提交保持一致。

Standards：1 项，最高 P2；Spec：0 项。没有代替 SDK 线程修复或发布。

## Standards

二次只读检查 `d244ddfa..70aedacd` 的六文件增量，0 项。
镜像退休现在要求 inputId 或其 canonical 别名关联同一消息、已知 Turn 无冲突，
以及完整封装或报告正文相等；任务报告不再参与普通文本对齐，原 P2 已关闭。
未发现新增成文规范违反或可行动坏味道。

## Spec

二次独立需求复核 0 项。独立、来源不足及冲突记录保留；确证的封装/正文镜像
去重。报告不借独立通知的时间，顺序、身份、状态和全文读取没有回退。

主线程重新执行：8 文件 / 189 测试通过；源码和测试类型检查通过；构建后公开 SDK
的独立 daemon、IPC、全文读取与 Host 重启回归 1/1 通过。原反例已保留两项，另七个
公开投影对照检查覆盖 inputIds 别名、封装/正文镜像、冲突 Turn 和时间不借用，均通过。
本轮六个目标文件与提交一致；工作区其他 Skill、媒体及 LLM 改动不在本次结论内。
未修改 SDK 或安装依赖，未发布，未更新 Space 的 SDK 版本。

最终 Standards：0 项；Spec：0 项。
