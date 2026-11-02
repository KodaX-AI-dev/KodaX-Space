# alpha.12 源码准备的双轴复核

2026-11-02，范围为 `7801a8ca` 至准备分支，正式 SDK 未安装；本记录区分代码安全处理与仍缺产品能力。

## Spec

- 原三项已由独立 Spec 复核确认修复：只读网络连接器保留 Plan 语义；checkpoint 沿原准入 persona 恢复；显式 Skill 由 Host catalog 和 SDK parser 识别，兼容中间引用和限定名称。
- 个人退出与 Host 停止分开，protected peer 与 replacementRunning 均不放行安装。
- 补充发现的通知、删除及 Fork 回滚绕过共享 writer 已修复：断线不直写 canonical；可选审计失败保留 Space notice；无法确认删除时保留数据/附件并记录原因。对应 RED/GREEN 与 176 项组合回归通过。
- Quick Ask UI 只在 `ok && promoted` 后执行 handoff/保留会话；拒绝、未提升与异常均保留回答并展示错误，真实浏览器 RED/GREEN 覆盖。Quick Ask promotion 原 saveSession 直写已关闭。公开 Host 没有 tag/promotion 命令，因此产品能力仍未闭环，保留原 Session 并事实提示不可用，SDK 交接已列需求/验收。
- 默认专家 Skill、after-turn 消费时业务绑定和恢复原连接器范围仍需公开 SDK 接缝，不能用当前连接器工具同名来证明原业务范围。未宣称所有专家/排队流程已完成迁移。

## Standards

- 旧 Embedded、Partner inline 和 Keychain/内存默认存储文案已同步为共享 Host、auth.json 与明确的迁移/共享规则。
- Partner Host 注册和 OAuth 凭证读取按职责拆分；包含双工作面的 Session 集合采用通用命名，Coder 保留在公开历史类型/文件名等兼容边界。
- `c171ca50` 及后续修复提交包含行为、验证和待发布边界的正文。导入的凭证分支历史及旧 `d48bbb67` 空正文作为非运行阻塞的历史规范项保留，不重写其他线程历史。
- 新增真实 Host 脚本未发现其他可行动 Standards 问题；最终增量 `4233339a` 已由独立 Standards/Spec 两轴复核，最后的 Quick Ask UI 与帮助 finding 均关闭，未发现新增可行动代码问题；候选不可用说明同步到用户手册及应用内帮助。

完整测试数字、候选字节和验证限制见 [准备矩阵](kodax-0.7.97-alpha.12-preparation.md)，需要 SDK 配合的两组需求见 [交接说明](kodax-alpha12-partner-sdk-handoff.md)。源码、候选测试、正式 Registry 发布和 Space 实际启用是不同状态。

最后一轮 typecheck、lint、Renderer/Main 重建与 14 项界面/帮助契约均通过；Host Quick Ask 事实拒绝定向复测通过。源码安全问题关闭不代表 SDK 接口缺口或正式产品验收已关闭。
