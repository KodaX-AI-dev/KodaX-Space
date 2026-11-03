# beta.1 Space 适配评审

2026-11-03。评审范围为 `ca8d2313b39bc4676feace1f6a65a8c47aa26783` 之后的本轮工作区改动，正式 Registry SDK `0.7.97-beta.1`；未修改 SDK 源码。编码规范和需求分别由独立评审者检查，根线程结合测试证据复核。

## Standards

硬性规范违反 0，剩余可执行坏味道 0。准入记录的三个调用点共用单一保存函数；业务快照有不可变身份、大小限制和哈希验证；配置保留 SDK typed 错误；原输入错误不暴露内容。新增 compatibility 使用同 Session 的公开 Host 读取核实正式状态，缓存按 Runtime 实例隔离，不伪造 SDK view 或改写正文。

## Spec

Space 内剩余可执行问题 0。默认 Skill 由 Host 准备，角色和原问题保留；Partner 继续拥有授权范围内的 shell/write/子 Agent；消费时业务绑定、安全恢复、steer、撤回和 promotion 都保持原操作身份与 Host 单写入者。旧 Run 无原业务证明时明确拒绝恢复；准入后可选审计失败不再误报未发送；队列不再因业务撤销而自动删除。

两个 SDK 缺口不计作已修复：promotion 的观察 view 元数据未失效；旧队列及组合崩溃窗口缺完整原文和 durable 撤回回执。Space 的窄兼容及事实拒绝边界均已列入 [接入验收](kodax-0.7.97-beta.1-integration.md)，分别提供 SDK 交接段落。

## 验证边界

评审者做静态检查，未把 SDK 自身报告的全量测试当作 Space 本轮验证。根线程执行的全量、增量、真实 Host、成品 UI 和打包证据以接入验收记录为准；Linux/Kylin/macOS 真机、真实外部账号和 Issue 371 性能不由此次 Windows 离线验收替代。
