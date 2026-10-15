# KodaX 0.7.97-alpha.6 接入与验收

日期：2026-10-15。来源：用户要求安装已发布的 alpha.6，并完成 Space 输出迁移与草稿修复的正式依赖接入。

## 状态

Registry 安装、Space 适配与 Windows 候选验收完成。首次官方 Registry 查询中，版本元数据与 tarball 均为 404，用户也确认暂不可查询。按用户要求等待十分钟后，alpha 标签与版本元数据均可查询，根目录、Desktop 和 lockfile 精确锁定 alpha.6，开发链接已撤下。Space 安装包未对外发布，个人历史未删除。

官方 tarball 为 `https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.6.tgz`，SRI 为 `sha512-mYRfXyQJAGvGB7msVS5FhLSWqdBeyPGrIFBl35cQ9HkYadcGtrpR2Np8Pb6/vDshH+3imQtiaSJZYp8e9F78mw==`。安装文件已经通过正式发布 gate 的逐项 tarball 字节校验，不再消费 sibling SDK 构建。

## 接入要求

1. 根目录、Desktop 和 lockfile 精确锁定 `@kodax-ai/kodax@0.7.97-alpha.6`。撤下开发链接，验证真实 Registry tarball integrity 和安装文件，正常打包不携带 sibling 源码。
2. SDK 和 Host 均要求 `sessionDrafts:1`，启动握手由 SDK 正常协商。普通 Coder 创建明确声明草稿；临时 Quick Ask 沿用独立生命周期。不支持草稿的旧 Host 不回退为持久化空会话。
3. 共享 Coder 正文继续由 SDK 当前 view 整份替换，历史窗口独立；保留 item/input 身份、图片、Artifact、完整正文、历史边界、队列、Stop、Fork/Rewind、统计与多客户端退出。不重新拼接 Runtime 正文。
4. 已有空记录必须经过 SDK 完整历史确认才隐藏，原文件保留。有分支、通知、Artifact、扩展、错误、恢复状态或名称的记录保留。无标题内容会话使用本地化名称。
5. 透传 SDK 可选 `lastMessageAt`，在 Main 转换为 IPC 毫秒值。SDK 已提供真实消息时间时，元数据、创建时间和 Runtime 恢复不能覆盖它；实际发送后的本地活动继续保留。缺失该事实的旧记录保留既有 Runtime 活动补偿。

## 反馈循环

- 草稿反例：SDK 缺少能力时原检查未拒绝，且启动握手未要求 `sessionDrafts:1`；新增公共 RuntimeHostAdapter 回归先失败，补契约后通过。
- 时间反例：SDK 已按消息时间排序的列表，被 Main 按创建时间重排；Renderer 也将早于派生会话创建时间的原消息时间提升为创建时间。公共 `session.list` 和 AppStore 回归先失败，透传并保留 SDK 事实后通过。
- 需求复审再发现恢复路径会丢掉消息事实，以及第一次收到 canonical 时间会丢掉新发送时间。三条公共 IPC/AppStore 反例先失败后通过；同 scope 合并 SDK 时间，本地实际输入独立记录。规范复审要求拆分过长函数，已提取单条 Session 时间合并，两个函数分别 39/44 行。
- 首轮 Electron 17/18：Fork 已成功并打开，但 fixture 用列表首项猜当前 Session。alpha.6 的派生会话保留来源消息时间，使该假设失效。聊天 DOM 暴露已有 Session 身份，fixture 改为读取实际打开的会话，不更改 Fork 或排序行为；重跑完整 18/18 通过。
- 已预先约定的验收边界：RuntimeHostAdapter、SDK 产品输入/观察、Session 列表 IPC、Renderer Store、真实 SDK Electron 与正式打包 gate。与原 F121 / Issue 220 回归沿用同一范围。

## 验收结果

以下全部使用物理安装的 Registry alpha.6。安装前的开发链接检查仅用于开发反馈，不作为本节正式验收。

- 关联 RuntimeHostAdapter、真实 SDK Product 输入、Host、空记录、公开列表 IPC、Renderer 与手册回归：321/321，通过。后续无行为变化的函数提取另跑公共 Store 7/7，通过。
- 共享输出四个模块的 17 项回归通过，行覆盖率 95.79%、分支 88.61%；时间合并模块的 7 项回归通过，行覆盖率 86.62%、分支 93.18%。均为限定模块覆盖率，不声称全仓覆盖率。
- 最终 `npm test` 共 4,375 项：4,355 通过、20 项既有条件跳过、0 失败。分别为 release 93/100（7 跳过）、Desktop 3,893/3,906（13 跳过）、IPC schema 369/369。初次全量检查发现手册仍声明 alpha.5，该断言已修正并在最终全量通过。
- Renderer/Main 类型检查、ESLint、生产构建通过。真实 SDK Electron 18/18，通过：SDK 当前输出替换、运行中刷新、同文不同输入、用户图片、Artifact、长正文、失效历史游标、队列/Stop、Fork/Rewind、统计、双客户端退出、旧记录保留和两次刷新后的消息排序；另含 Mock 附件与启动兼容。
- 最终 Windows 正式依赖候选已通过 Registry gate、ASAR 依赖与 native bytes/Runtime Worker 检查、启动检查（Renderer 4831ms、Runtime 在可控等待后 25719ms；122 条历史子记录保留）。安装包内 6/6 项真实 SDK 回归通过。首次候选早于 fixture 身份修正，不作为最终候选验收，已重新构建并通过全部 gate。
- 对最终打包程序另外运行旧空记录保留、侧栏名称与消息时间排序两项回归，2/2 通过。打包程序使用自身 ASAR/unpacked native 文件；未切换全量 Node 测试的 native ABI。
- Standards / Spec 各 0 项残留；更早两项 P2 与一项 P3 均已修复复审。

## 本地候选与证据

Space 保持 `0.1.47-alpha.1` 版本号，本次没有发布 Space 新版本或更改 SDK 仓库。重新生成的 Windows x64 Setup 与 Portable 位于 `out/`，包内精确使用 Registry alpha.6。安装包和 ASAR 的 SHA-256、测试日志指纹、源码指纹及历史证据未改动校验见 [机器可读记录](kodax-0.7.97-alpha.6-integration-evidence.json)。2026-10-14 的开发链接验收 JSON 保留其原始状态，由本记录补上正式发布包的独立验收。
