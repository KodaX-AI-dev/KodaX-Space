# beta.2 Space 修复补完与复验

2026-11-05，基线 `a352ec19`，Registry SDK `0.7.97-beta.2`。对应用户要求：谨慎修复 Space 侧问题，验证后提交、推送。

## 已有生产修复确认

- `ead06bfe` 已修复 `replaceProductQueue` 对未变化队列重复发布增量，引起观察/补读循环及 Host 存储冲突的问题。
- `ff4bdfa0` 已修复前台空闲订阅被退休以及切换/慢请求竞态，后台观察仍按既有条件退休。
- 两个修复都已在 main；本轮不是把已确认的 Space 根因继续交给 SDK。SDK 保持正式 beta.2 原包，不放宽围栏、不自动重发输入。

## 第一轮修改（897f95c8）

权限选择 E2E 曾在按钮显示用户意图后立即读取保存状态，并用 undefined 代替 IPC 错误，还依赖会话列表第一行。现在通过公开 `settings.get` 和 `session.list` 等待已保存默认值与精确当前 sessionId 的权限同时一致；快捷键、快速循环、最终鼠标选择及重载后的原有断言保留，增加相应持久化检查。未扩大超时、启用重试或修改生产权限策略。

对隔离 Main 只延迟该测试的 Space settings 文件 rename 400ms，旧测试稳定出现与 CI 相同的 `Expected full-access / Received undefined`。修改后的测试在同一慢写条件和正常条件各重复三轮，6/6 首次通过。真实 settings store、IPC、UI 与原子文件替换路径均参与；延迟探针仅用于定位，保存在忽略的 `artifacts/diagnostics/beta2-followup/`，临时测试副本已删除。最初一版探针因 CDP 不支持动态 import 而失败，不计作 bug 的 RED；改用 Node 公共 getBuiltinModule 后才得到有效 RED。

独立 Provider 超时仍没有稳定复现。本轮仅在测试 fixture 增加 TCP 连接、HTTP 请求开始及 body 完成的被动计数；失败时先复制计数，再并发读公开 Provider、live、product、statistics 状态，最后执行 Main 的健康 GET，避免探测本身污染原始计数。只记录隔离本地 URL、计数与公共 DTO，不记录请求头、凭据或 SDK 私有文件；取证失败仍保留原始异常。二十轮相同成品 Partner 复验 20/20 首次通过，不能据此宣称那一次超时的根因已修复，也不新增未经证实的 SDK 需求。

## 第一轮本地验证

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

第一轮 `897f95c8` 远端完整 [CI](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41990915515) / [四平台 build](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41990915680) 均成功。四分片 JSON 合计 360 条首次通过、21 条平台/条件跳过、0 条最终失败；另有1条 Windows 语言切换测试重试后通过（重载后许可证 Community 标记未及时显示），不将它计为首次通过。权限和本轮目标场景没有重试。

## 追加定位：随机端口限制与生产 OAuth 修复

第一轮之后，用错误的本地 Provider 配置做受控失败，确认取证能同时保留原始 Provider-arrival 断言、探测前全零传输计数、实际公开配置 URL、Main 健康 GET 200 以及 live/product/statistics 公共响应。该负向试验预期失败，不计为功能通过。

本机 `netsh int ipv4 show dynamicport tcp` 显示 TCP 动态范围从 1024 开始、数量 13977。`listen(0)` 因此可能分配 6666 等浏览器/Fetch 限制端口：TCP 绑定成功，但 Fetch 抛 `TypeError: fetch failed`，cause 为 `bad port`，请求到不了服务端。通过公开 Server.listen 把第一次随机分配固定到 6666，真实 Provider fixture 稳定 RED。原历史单次超时没有保留 URL，旧 trace 也未包含它，因此不能把此机制认定为那一次超时的唯一根因。

检查相同调用发现，Space 生产 MCP OAuth loopback 也直接暴露 `listen(0)` 的端口；公开 `authorize` 入口同样 RED，返回 `authorization_failed`。这是 Space 的生产缺口，已直接修复，没有给 SDK 增加未经证实的需求。

`listenFetchableLoopback` 在生产 OAuth 和两种真实 SDK 测试 Provider 三处复用：先绑定 127.0.0.1，再用独立 `/_kodax/ready` GET 确认可达；仅 Fetch 的 `bad port` 最多重绑三次，换端口前关闭旧监听。取消、HTTP 错误和其他网络错误立即失败，保留错误，清理失败同时保留原异常。生产沿用既有授权 deadline 与取消信号，不新增设置或请求重发。OAuth 健康路径不触发授权回调，state、PKCE、端点白名单、权限及凭据存储均保持原策略；取消后关闭回调监听、不写入凭据。

新增 Provider 回归用例时曾误覆盖既有 fixture spec，提交前已恢复全部十一条原测试并追加两条新测试；最终 diff 保留原事务、历史修订与失败边界断言。

### 追加验证

- OAuth/loopback：20/20，新增监听代码行覆盖率98%，OAuth模块95.40%，合计95.58%（80%行覆盖门槛通过）。含受限端口、取消时关闭监听且不保存凭据、准备阶段取消、HTTP 503 不重绑；原 state/PKCE/白名单/refresh/授权超时用例全部通过。
- Provider fixture 和历史边界：全部十三条各重复三轮，39/39，retries=0。
- typecheck、lint、修改文件格式与 diff whitespace 检查通过。
- 已重新完成 npm run build：成品依赖/原生模块、boot（保留122条历史子任务记录）以及六条真实成品 SDK 生命周期回归全部通过，retries=0；包含 Stop 后立即发送、队列重载且只消费一次、历史/fork、Rewind 与多客户端退出保护。其余成品专项与新生产提交的远端完整检查结果后续追加。没有替换公开 alpha.4 标签或资产。

### Standards（追加）

独立规范轴：0 项硬违反、0 项可行动 smell。共享 helper 有三个真实调用，函数少于50行；关闭失败保留原错，abort 监听一次性且回调完成后移除；测试在 finally 恢复全局替换。

### Spec（追加）

独立需求轴：0 项。仅准备阶段对受限端口有界重绑，没有修改 SDK 围栏或重发 Run；OAuth 健康路径不结算授权回调，state、PKCE、回调校验和权限范围保持原行为。历史单次超时的证据边界保留。

## 最终成品专项（生产提交 e4507561）

生产修复 `e45075612e89e290eb5df21ab1125240371eb7d8` 已推送 main。重新构建的 `out/win-unpacked/KodaX Space.exe` 使用确切 Registry SDK beta.2，成品 Main 与本次构建输出一致，555个 Renderer文件逐字节一致。Setup、Portable和ASAR的SHA-256及后续远端结果见同目录 `kodax-beta2-space-final-validation.json`。它是本地重新验证包，没有替换公开 alpha.4 发布内容。

通过正确的 `SPACE_E2E_EXECUTABLE` 运行37条真实成品专项，37/37 首次通过，0跳过、retries=0；与打包自动执行的6条合计43/43。覆盖：

- 四权限的默认值/当前会话持久化，语言切换与重载，Agent/Coding/Script 与 Host CAS、运行中切换拒绝、首轮模式选择。
- Partner 默认专家、Agent 注入和 shell 保留，共享Host，缓存A→B→A、独立客户端改模式、下一轮原子恢复。
- 两种慢快照前台切换、队列取回完整文本、Quick Ask 同会话 promotion。
- Thinking/工具参数 token 估算、完整工具原文与MCP原文冷Host恢复、未知状态的多任务报告、Skill可信策略与可见性。
- 双向历史/一键最新、检查点和未完成工具尾部分页、重复独立输入意图、流式替换与终态、Artifact/图片重载。
- 单次Workflow、Memory、Repo检查、Host扩展诊断、首轮内置Skill、普通问题重载后单次回答、Responses配置保留SDK路由元数据。

远端生产提交的完整 [CI](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41997775340) 与 [四平台 build](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/41997774443) 全部成功。CI 四分片原始 JSON 合计365条首次通过、21条既有平台/条件跳过、0失败、0 flaky、0重试；Windows语言切换此次首次通过，不把第一轮的历史偶发失败改写成已定位的生产根因。21条跳过名称及每分片统计保存在同目录 JSON：包括外部模型/客户历史 corpus 条件、特定OS功能和既有平台隔离项，未把它们计为通过。Build的静态检查和Windows/Linux/macOS ARM/macOS Intel全量单测及编译均通过（全部7个job成功）。

两份最终验收记录与生产改动分层提交；记录提交只改变 docs/research，不替代以上生产 SHA 的完整验证。没有新增需要 SDK 配合的已确认缺口。旧单次 Provider 超时的唯一根因仍不能追溯，已补可区分配置、传输、Main和Host状态的失败证据；既有Issue 371首次历史读取延迟、客户OS原生体验及真实外部账号仍保留原验收边界。
