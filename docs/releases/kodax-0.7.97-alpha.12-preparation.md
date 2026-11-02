# alpha.12 候选 SDK 的 Space 适配

2026-11-02。用户授权先准备源码，SDK 正式发布通知后再安装正式包、打包和闭环。SDK 源码基线 `f24a922c117e0ece5d26224a133a69973b313ab6`；本地候选包仅在隔离工作区测试，SHA-512 见下。根/Desktop manifests 与正式 lockfile 保留 Registry alpha.11。源码支持、候选测试、正式发布和产品启用分别记录。

当前分支 `codex/sdk-alpha12-preparation`，工作区 `C:/Users/ADMIN/.codex/worktrees/sdk-alpha12-preparation/KodaX-Space`。原主工作区的 fixture 与 research 文件未动。凭证基础复用独立 `codex/provider-credentials-space@7b37e1c8`（含 065cc39c/437cac7d/da531f0a），旧验收记录保留，本次组合验证另记。

## 已准备的改动

| SDK 变化                | Space 处理                                                                                                                                                                                                         | 当前边界                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 统一共享 Host           | 撤下 Embedded 设置；旧偏好归一后交 SDK 安全迁移；Coder/真实 Partner 的创建、执行、命令、历史、压缩、Fork/Rewind、Workflow 和 Actor 管理同属 Host                                                                   | 普通 Partner 真实独立 Host 已验证；专家方法见阻塞项                                                                          |
| Main 授权               | 完整构造 identity/runtimeId/profile、credentials、hostTools、基于实际 Host 目录的 createExecutionProfile；provider_probe 无 Session、只准 utility/对应 operation，完成即回收 lease；换 Host 清缓存、换连接重绑工具 | 凭证/lease/恢复单元及真实 Host 验证；不借根授权给独立 Actor                                                                  |
| Partner                 | Host Session 默认 Agent；保留 persona/验证、来源与 KB、连接器、交付和 Artifact handlers，通过 lease 注册；连接器保留只读网络 Plan 语义                                                                             | 不按 Partner 身份禁 shell、write、子 Agent；权限、审批、工作区、沙箱和业务绑定继续生效                                       |
| 工作模式 UI             | Coder 安全空闲时选择 Agent/Coding/实验性 Script；Partner 显示 Agent；实际 Run 模式/装配范围单独显示                                                                                                                | Session 选择和实际事实分离；旧记录/未装配保持未知                                                                            |
| Provider/凭证           | 固定旧 app/env/shared 来源，CAS、删除墓碑、备份、显式采用/发布共享凭证；文件后端 initialize 后开放生产工具；保留原生协议、OAuth/cloud 高级配置                                                                     | 原生高级连接沿 SDK/CLI/config 配置；未把 preset 等同已注册、已授权或模型权益                                                 |
| OAuth/云                | 原注册/issuer/profile 校验；协商 OAuth credentialContextVersion、同注册拒绝 token 刷新与 replayIdentity；原始 token 和 carrier 均纳入 Main 脱敏；失败 POST 不重放                                                  | 离线契约已测；真实订阅、云 principal/权益和完整登录流程不是本次已验收结论。旧 string scope 不宣称同等 principal 保证         |
| canonical/nativeHistory | 真实 Partner 与 Coder 的变更统一走 Host；现有原始 transcript/message 保留整对象，不用显示文本复制重建                                                                                                              | 既有 native 字段保真、分页/边界测试继续回归；Host ready 不等于首次历史加载完成，Issue 371 未关闭                             |
| Effort                  | 当前 view 保留 reasoning requested/sent/provider/model/requestId/fallback/verified:false；仅显示匹配当前 Run 的事实；兼容旧 aliases，选择值不被 wire 结果改写                                                      | 浏览器验证实际值、未知值、异 Run 过滤；无重复拒绝提示或 UI 额外推理探测                                                      |
| 图片/费用/统计          | 模型 multimodalSupport 优先；text-only 模型在接受输入前拒绝新图片，原图/草稿保留；统计 partial/issues 不丢；cursor conflict 从第一页重取并显式 reset                                                               | Space 当前显示记录 token，不自行计算金额，因此不将 cost:null 变零，也不推算 nominal 为账单。独立 monetary/成本 API 未新增 UI |
| 工具/Skill/MCP          | Skill 显式引用按 Host 实际 registry 识别，兼容中间 token 与 /skill:name；原文仍按具体工具项 ID 和 part:original 分页；权限计划、taskResult 与无超时提问沿现有契约                                                  | 真实 Host 验证 Space builtin 与项目 .agents/skills；vendored Space Skills 校验通过；其余组合回归另记                         |
| 配置/错误               | Settings 读 Host application，分 immediate/next_run/extension_reload/restart；声明依赖与实际 SDK 版本分开；损坏配置与凭证不清空重置，修复后重试                                                                    | Host 未报告时显示未知，保存不宣称活跃 Run 已应用                                                                             |
| 生命周期                | 个人清理成功与真实 Host 停止分别记录；late peer 或 replacementRunning 保护 Host 时不启动安装；Partner 退出同样保护其他客户端                                                                                       | 定向退出测试通过；正式安装包的手动更新/退出/多客户端竞争仍待发布后验收                                                       |
| 沙箱/分发               | 复用公开激活入口与 SDK 自动回退，不增加 Node 安装 gate；SDK 指引已区分 Electron Node 模式与 standalone 可选解释器修复；新增 client facade 保持 external；完整 SDK/native/artifact 资源门禁保留                     | Node/真实 Host 与源码构建验证；Galaxy Kylin/macOS/ARM、真实沙箱激活与正式 ASAR 包待验收                                      |
| 其他 SDK 能力           | 原生 Actor checkpoint 由 SDK 管理；Space 外部任务 mailbox 不是另一个原生 followup 驱动。独立 image/classify/deferred API 按产品需要另接                                                                            | 不为覆盖导出逐一新增功能或重复轮询；不增加前台扫盘、TTL GC、自动修复/确认存储 fence                                          |

普通 Partner 与 prompt-only 专家的首轮路径已准备；这不等于所有专家和排队交互已完成迁移。既有 `/coding` 独立库 fixtures 显式使用测试 owner，它们验证原库内容/方法，不作为新共享 Host 产品集成证明。

## 仍需 SDK 配合

默认专家 Skill 的可信声明及 after-turn 真正消费时获取最新已提交专家/连接器绑定，当前公开契约还不能等价表达。Quick Ask promotion 也缺 Host 元数据更新命令，候选已关闭旧 saveSession 直写并保留原会话；缺默认方法时 Space 事实拒绝并保留草稿；显式已注册 Skill 可覆盖本轮方法，checkpoint 恢复沿已准入 persona 重绑，不重新要求新默认方法。完整问题、需求与验收段落见 [SDK 交接](kodax-alpha12-partner-sdk-handoff.md)。这两项没有关闭，正式升级前须补接口并继续验证。

## 候选验证与交付

候选 tarball 为 SDK 工作树现有分发文件的独立快照，没有在 SDK 原工作区构建或修改源码；包版本本身不是源码/二进制一致性的证明。候选 SHA-512：

`JGzV23Yq+klxUhQK39QmeMfsWx8LmcxRGeoGtuQypuyRmYXe41T+O2NNSMNhbFO5JQucEd50EyS+YBXcO2WpLQ==`

已完成定向 RED/GREEN（退出证据、旧偏好迁移、授权 profile、OAuth context、实际执行事实、游标重取）、真实浏览器实际事实展示与模式切换、真实独立 Host 六项验收（含内置/项目 Skill、实际交付字节、Agent persona、shell scope）。该 Host 统计 physicalRequestCount=0，独占 owner 经 shutdown receipt 验证退出；没有用个人会话或在线模型。

组合回归启动于固定提交 `c171ca50`：Desktop 4057 项中 4041 通过、13 跳过、3 失败；IPC schema 371 项全部通过。失败中的两项是正式依赖/安装字节一致性门禁：正式声明 alpha.11，而本隔离工作区装的是 alpha.12 候选，保留门禁等正式发布后验收。另一项在首个 loopback 假 Provider 请求阶段出现 network failure；同一用例定向重跑通过（`migration-revoked-recheck.log`），没有放宽断言或超时，也未把复跑当成全量一次通过。

之后的共享 writer/Quick Ask 保护及 Partner 不兼容 Host 停止重试修复，相关 7 个测试文件共 176 项全部通过；Quick Ask 浏览器回归另验证拒绝、promoted:false、异常均不切页且回答保留，只有确认成功才 handoff；新增边界先 RED 6 项失败，再 GREEN 7 项通过。最终生产源码的 typecheck、lint 与 Renderer/Main 构建通过（构建保留既有 chunk-size 提示）。上述日志和真实 Host 能力报告均在本准备工作区 `artifacts/diagnostics/alpha12/`，正式资源/安装门禁仍未运行通过。整库覆盖率本轮未重新测量。

复核及未关闭项见 [双轴复核记录](kodax-alpha12-preparation-review.md)。正式 Registry 安装、lockfile、最终完整字节/ASAR 包、客户历史首次加载性能、真实 OAuth/云账户、外部服务和跨平台交付仍单独验收，不把 SDK CI 或旧分支的通过数字算成本次结果。

最终代码复核基线 `4233339a`，两轴未发现剩余可行动代码 finding；SDK 两组接口需求继续保持未关闭。最后一轮类型检查、lint、Renderer/Main 构建及 14 项界面/帮助契约通过。原 Space 主工作区和 SDK 原工作区均未改写，正式安装/打包按用户发布通知继续。

2026-11-02 正式发布后续：用户已通知 npm alpha.12 发布，正式包已安装并通过完整字节门禁；后续结果转入 [正式升级验收](kodax-0.7.97-alpha.12-release-validation.md)。本文件中的候选字节、旧 pin 和检查数字保留为历史准备证据。
