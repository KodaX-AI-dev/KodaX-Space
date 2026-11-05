# beta.2 Space 修复补完与复验

2026-11-05，基线 `a352ec19`，Registry SDK `0.7.97-beta.2`。对应用户要求：谨慎修复 Space 侧问题，验证后提交、推送。

## 已有生产修复确认

- `ead06bfe` 已修复 `replaceProductQueue` 对未变化队列重复发布增量，引起观察/补读循环及 Host 存储冲突的问题。
- `ff4bdfa0` 已修复前台空闲订阅被退休以及切换/慢请求竞态，后台观察仍按既有条件退休。
- 两个修复都已在 main；本轮不是把已确认的 Space 根因继续交给 SDK。SDK 保持正式 beta.2 原包，不放宽围栏、不自动重发输入。

## 本轮修改

权限选择 E2E 曾在按钮显示用户意图后立即读取保存状态，并用 undefined 代替 IPC 错误，还依赖会话列表第一行。现在通过公开 `settings.get` 和 `session.list` 等待已保存默认值与精确当前 sessionId 的权限同时一致；快捷键、快速循环、最终鼠标选择及重载后的原有断言保留，增加相应持久化检查。未扩大超时、启用重试或修改生产权限策略。

对隔离 Main 只延迟该测试的 Space settings 文件 rename 400ms，旧测试稳定出现与 CI 相同的 `Expected full-access / Received undefined`。修改后的测试在同一慢写条件和正常条件各重复三轮，6/6 首次通过。真实 settings store、IPC、UI 与原子文件替换路径均参与；延迟探针仅用于定位，保存在忽略的 `artifacts/diagnostics/beta2-followup/`，临时测试副本已删除。最初一版探针因 CDP 不支持动态 import 而失败，不计作 bug 的 RED；改用 Node 公共 getBuiltinModule 后才得到有效 RED。

独立 Provider 超时仍没有稳定复现。本轮仅在测试 fixture 增加 TCP 连接、HTTP 请求开始及 body 完成的被动计数；失败时先复制计数，再并发读公开 Provider、live、product、statistics 状态，最后执行 Main 的健康 GET，避免探测本身污染原始计数。只记录隔离本地 URL、计数与公共 DTO，不记录请求头、凭据或 SDK 私有文件；取证失败仍保留原始异常。二十轮相同成品 Partner 复验 20/20 首次通过，不能据此宣称那一次超时的根因已修复，也不新增未经证实的 SDK 需求。

## 本地验证

- 投影和 Runtime adapter：349/349，0 失败、0 跳过。
- 权限正常/受控慢写：各三轮，共 6/6，retries=0。
- Script 部分执行 Stop→冷 Host→原始历史读、Thinking/工具参数 Stop→下一次发送、两种慢快照前台切换：各三轮，共 12/12，retries=0。
- Partner 默认专家/保留 shell scope、缓存 A→B→A、独立 SDK 客户端改模式、下一轮原子恢复 Agent：20/20，retries=0。
- typecheck、lint、全部修改文件的 Prettier、diff whitespace 检查通过。
- 本轮没有生产文件修改，复验使用原已修复的真实 `out/win-unpacked/KodaX Space.exe`，与生产源码 `ff4bdfa0` 的 Main/555 个 Renderer 文件逐字节一致，SDK beta.2。没有替换公开 alpha.4 标签/资产或发布新 Space 版本。

## Standards

独立规范轴复审：0 项硬违反、0 项可行动 smell。新 helper 少于50行且有四个真实调用；传输 getter 返回副本，计数和取证职责明确，没有新增生产配置、抽象或吞错。

## Spec

独立需求轴复审：0 项代码发现。符合 ADR-005 四权限与持久化/实际会话事实一致的要求；没有降低断言或修改 SDK 准入/重发边界。Provider 取证增量不等同于超时根因已解决，此边界明确保留。

本轮新提交的远端完整 CI / build 结果在完成后仅追加本研究记录。
