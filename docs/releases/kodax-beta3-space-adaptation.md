# Registry SDK 0.7.97-beta.3 的 Space 适配

2026-11-08。Root 和 Desktop 精确依赖 `@kodax-ai/kodax@0.7.97-beta.3`。
lockfile 使用 npm Registry URL，SHA-512 为
`vrUtb5Co82moHgQI5zc06ZTjWONVvjmc02FxUWqiO2lzgPOsMc5O6WftsDhlmzorLDUha2SSBsii5o6uBJVQeg==`。
开发目录已安装该物理包，SDK 子模块从 Space 自己的 `node_modules` 解析。

## 接入行为

- 实时窗口和保存页继续使用 SDK 各自的读取契约。长正文按需补齐，失败后保留预览并提供就地重试。浏览旧页可以双向翻页并返回最新。
- 本页查找遵循当前展示模式。会话搜索从 SDK 的保存记录查找，可读原文并定位到有来源证明的上下文。返回恢复阅读位置、选中结果和焦点。
- 一个持久条目可能同时投影成思考、正文及多个工具。Space 在同一来源边界和修订内收集全部项，定位时展开该组内容。临时展开结束后恢复用户原来的展示及工具折叠状态。
- 会话搜索沿用 SDK 的索引范围。beta.3 对正文和工具输入、结果建立索引，思考内容可随所属命中条目展开阅读。本页查找仍按当前可见内容匹配。
- 消息行、菜单、右键和命令按各自意图调用 `resolveHistoryTurn`，由 SDK 解析整轮末尾。回退确认携带来源修订、分支头和活动 Run 身份，停止后仍由写入层验证确认条件。
- 新会话在首次 Run 被接纳前可选择模式。锁定后保持 Host 的实际模式。旧 Host 缺少锁定事实时提示升级。Partner 继续按已准入的 Agent 事实恢复工作流和队列。
- Artifact 扩展将固定安装位置的 LibreOffice 控制台程序交给 SDK，用于 DOCX/PPTX 转换。字段与分页的限制沿用 SDK 返回的诊断。

## 修复与测试依据

正式 SDK 实验确认，工具输入的搜索命中可返回有效来源边界，而对应投影只有工具项。
Space 原先仅允许提问或非空回答作为落点。浏览器回归先复现定位失败，随后覆盖工具、思考、
混合条目以及同页工具卡复用后的折叠恢复。上述定位仅在 SDK 证明的来源集合内进行。

首轮完整测试发现 6 项失败。1 项固定 beta.2 版本，1 项要求旧 `/agent-mode` 出现在目录，
4 项假 Host 缺少新版锁定事实。依赖断言已改为 beta.3 的精确版本和 Registry URL。
目录测试验证 `/work-mode` 可发现及旧命令仍可执行。假 Host 对新会话提供未锁定事实，
对已有 Partner 提供已锁定的 Agent 设置，全部原业务断言保留。完整 Adapter 文件复核
307/307 通过。首轮失败保留在原记录中，最终验收单独追加。

历史候选 SDK 的结果见 [Issue 237 回归记录](../test-guides/ISSUE_237_0.1.47-alpha.4_REGRESSION_GUIDE.md)。
本页以 npm 发布包及本次 Space 代码为验收输入。

## 正式发布包验收

| 检查                   | 结果                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ |
| 完整 `npm test`        | 4,703 通过，20 条件跳过，0 失败，共 4,723 项                                         |
| 类型、lint、生产构建   | 全部通过                                                                             |
| 本次 57 个代码文件格式 | Prettier 检查通过                                                                    |
| Registry 安装一致性    | Root 和 Desktop 版本相同，归档 SRI 与全部已安装 SDK 文件通过打包门禁                 |
| 源码 Electron          | 13 个历史及模式场景通过，搜索用例修正后单独复跑通过                                  |
| Windows 打包应用       | 同一组 13 项一次通过，retries=0                                                      |
| 打包流程内置检查       | app.asar 中 Runtime、Worker、Artifact 与原生依赖执行通过，6 个 Host 生命周期场景通过 |
| 原问题会话正文副本     | 111 个实时项中 16 段长正文读取完整，共 142,030 字符，0 失败                          |

源码专项首轮的 1 项失败来自测试要求独立索引思考内容。SDK 的索引明确跳过思考块。
用例改为搜索混合条目的正文和工具输入，并验证打开上下文后思考、正文与工具结果都可读，
随后单独复跑通过。Windows 成品的 13 项使用修订后的相同用例。

用户会话在源码和成品中均复制到隔离 profile，7 个可见提问全部能解析。Fork 与回退后
重新读取的保留轮次一致。直接正文读取前后核对原始文件 SHA-256 相同。
Provider 场景使用本地回环 HTTP 服务，Fork 续问实际收到原问、续问和 3 对完整的工具
调用及结果。测试验证请求上下文与恢复行为，线上模型回答质量沿用原 SDK 的评测范围。

Windows 冷启动测试中 Renderer 4.55 秒就绪。确定性延迟 daemon 20 秒后 Runtime
25.96 秒就绪，122 条历史子进程记录保留。该注入等待的读数用于验证启动与恢复边界。

安装包按当前 Space `0.1.47-alpha.4` 版本生成本地验收产物。
此前公开 Space 构建的依赖记录继续保存在各自发布文档中。

## 完整发布差异补核（2026-11-08，基线 18815388）

本轮逐项比对 beta.2 → npm beta.3 的实际发布差异，以及随包的 SDK_MIGRATION、CLIENT_CONTRACT、SPACE_SDK_SEAMS 和 embedder-guide。沿用上面的主链适配，不重做已有历史和模式实现。当前工作树先合入主工作树已提交的设置、输入器与 beta.3 适配，再按 lockfile 安装 Registry 实体包；其他工作树的未跟踪设计文件保持原样。

| 发布范围                                      | Space 处理与边界                                                                                                                   | 验证入口                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 历史定位、整轮解析、旧 view 原文              | 基线已有两种 capability 按操作检查、来源字符串修订与确认头；旧 Host 保留浏览，不用 UI 索引猜整轮                                   | sdk-history-navigation、sdk-alpha11、historyTurnAction、history paging       |
| 首轮后永久模式锁                              | 基线读 Host workModeLocked；首轮前可选 Agent/Coding/Script，锁后只读，新建会话另选；模型和权限独立                                 | sdk-work-mode、work-mode、AgentModeSelector 浏览器                           |
| Partner Agent 与旧 generation 恢复            | 保留可信 requiredWorkMode、业务绑定和普通 shell/write/子 Agent；原 generation 的兼容核验交给 SDK，不改写旧 Session 模式            | sdk-beta1-adaptation、runtime-host-adapter                                   |
| scoped Markdown rules                         | SDK 自动加载规则；Main 标明实际可保存的两个 AGENTS.md 目标，片段在 Context 只读并显示独立文件名；IPC 容纳 SDK 字节预算内的更多条目 | 新增 AgentsMdPanel 浏览器、session-instructions schema、sdk-beta3-adaptation |
| 容量错误、按预算读取与完整压缩                | 沿用 context_capacity 分类、recovering/context recovery 事实和 Host Stop；不增加默认答案、盲重发或自己生成摘要                     | runtime-host-adapter 容量投影、ActivitySpinner、statistics 与原文回归        |
| 独立 Actor durable Turn 结算                  | 保留 SDK unknown/cancelled 和精确 Task/Run 身份，不从 HTTP 结束推断成功、不重放工具                                                | coder-daemon-projection、Actor adapter、sdk-alpha11-lifecycle 任务报告       |
| 跨安装共享相同 Host 构建                      | 继续 SDK ensure/connect 与实际能力检查，Space 不增加路径相等条件或另一所有者                                                       | 真实 Host 能力快照、共享 Host 生命周期                                       |
| 退出恢复、Windows containment                 | 原回执和未知执行事实保留；host_generation_terminated 不冒充正常清理成功，安装仍须精确 Host 停止证明                                | runtime-client-exit、runtime-exit-recovery、完整退出                         |
| bounded idle maintenance 与 Windows boot 查询 | SDK Host 内部维护，不增加 Renderer 轮询；沿用单前台订阅和无变化队列不发布                                                          | 前台慢快照、队列重载/取回、boot/退出成品检查                                 |
| DOCX LibreOffice 与字段诊断                   | 基线通过可信安装路径提供转换器，Windows 使用 soffice.com；按 SDK 诊断显示回退/字段/分页限制，不以像素证明 Word/WPS 保真            | space-artifact-extension、真实 Artifact package smoke                        |
| Windows 程序资源外置                          | 将 dist/windows-effect-job-programs.json 纳入必需归档和 ASAR 门禁，字节仍由正式归档 SRI 校验                                       | 新增缺资源 RED→GREEN、正式 pack smoke                                        |
| 图像不支持时的占位说明                        | 使用 SDK 原输出，不重建模型请求或去掉“未验证”说明                                                                                  | 图片/Artifact/原始正文回归                                                   |
| 凭据、权限、Skill、问题交互、promotion        | 本次 SDK delta 不改这些公共接口；保留 auth.json/CAS、账号来源、四权限、Host 无本地超时、原 inputId 与 Session promotion            | 原 SDK 适配专项及完整单测                                                    |
| Workflow                                      | 保留显式单次功能及最终 Session 回答，不新增保存/修改管理                                                                           | sdk-ui-contract-acceptance 与 migration-gaps                                 |

### 补核发现和最小修复

1. 新 SDK 将 rules 片段按 global/project scope 返回；旧 Context 编辑按钮只看 scope，点击后会把片段内容提交给固定 AGENTS.md 保存接口。两个真实浏览器反例均先失败。现在 Main 根据公开加载结果的绝对路径与实际固定保存目标比对，返回可选 editableScope；Renderer 只按该事实开放编辑/创建。文件名为 rules/AGENTS.md 的片段也不能获得编辑身份，不给 Renderer 增加任意路径写入。
2. 旧 IPC 最多16条导致24个合法片段被 OUTPUT_INVALID 拒绝。schema 反例先失败；现在仍有512条上限，保留 SDK 的每文件/每 scope 字节限制，不静默裁剪。
3. 新外置 Windows containment 程序若从包中漏掉，旧发布门禁不能拒绝。受控缺文件反例先失败，补入必需资源后门禁完整回归通过；不复制 SDK 私有程序或修改其哈希逻辑。
4. 同步当前 PRD/HLD/DD、迁移入口、用户手册及 space_manual。清除 Partner 仍使用“受限 profile/未组合 Agent”和 Workflow admin 的过时说明，保持已发布版本的历史证据。

### 本轮验收

结果在冻结生产改动并完成回归后追加。上方4703条单测和13条成品结果属于基线，不挪作本轮结果。真实外部账号、客户麒麟/macOS原生体验、任意文档的 Word/WPS 保真和 Issue 371 全部恢复性能继续独立验收。

#### 本轮首次全量发现

首次完整 npm test 有两项失败，原日志保留：schema 的旧16条拒绝断言，以及基线模式浏览器测试的 Home 按键超时。前者改为512条接纳、513条拒绝并保留24个真实片段的回归。后者单独复现并缩到约2秒，取证显示按键时没有 Agent 设置请求；旧测试只等仍选中的 Coding，没有等 Script 保存失败返回后按钮恢复。现在等待 Coding 仍选中且按钮已启用，原 Home/Host CAS/锁定断言不变；同一测试连续三次通过，没有新增生产轮询或延长超时。临时探针已移除。

#### 本轮本地结果（提交前）

- 最终完整 npm test：4727项，4707通过、20既有条件跳过、0失败。此前首次两项失败另记，不计为此次通过。
- 源码真实SDK/Host用例1/1首次通过，retries=0：27条规则/AGENTS上下文，Main精确编辑目标，全部片段保持，Coder与Partner实际请求含规则标记。真实Host返回 productHistoryLocation:1、productHistoryTurnResolution:1、productInputRecovery:1、productExecutionModeConstraint:1、repoIntelligenceDiagnostics:1 以及 workModeLocked:true；同一证据保留实际Electron执行路径。截图确认27项面板可读。
- typecheck、lint、build:smoke通过。资源门禁13/13、schema相关78/78，规则浏览器2/2和模式键盘受控复验3/3通过；专项与完整套件有重叠，不累加为总用例数。
- 新成品及远端CI/build结果在实际完成后追加，不用源码Host或旧安装包代替新成品验证。

### Standards

独立规范轴两次复核：0硬违反、0可行动smell。新测试函数少于50行；Main固定目标元数据、原有权限及SDK事实边界保持，系统提示只用于隔离fixture的内存断言，不写证据文件。

### Spec

独立需求轴两次复核：0项。SDK完整发布范围已逐项核对，未发现需要Space重复实现的SDK内部能力；规则只读、目标绑定、512/513边界与资源门禁均有反例及正向验证。模式测试只等待保存结束，不改变生产策略或放宽超时。新成品/远端结果仍单独验收。

#### 首次成品与远端环境补核

生产提交 f6f70c03 的首次成品广回归38项中36通过、2失败，证据另存；不能计作38项通过。两项均是基线测试未跟上已确认的新契约：Partner 测试试图在首轮后用另一客户端改 Coding，beta.3 应拒绝；含 @绝对路径的 literal 测试则在文件补全菜单打开时按 Enter，尚未真正发送。

修正后的同一真实成品专项2/2首次通过：公开第二客户端验证首轮前后锁定事实与Agent保持，后续专家/shell与输入断言保留；literal helper仅在可见 @Files 菜单时Escape再发送，新增SDK view原始正文（含换行/路径）一次与两次重复的严格相等断言，保留不同inputId、重载不重复和搜索原文验证。

首次远端Ubuntu build的两个输入器浏览器测试无法启动，错误为缺少chromium_headless_shell。构建工作流新增测试浏览器准备：Linux使用playwright install --with-deps chromium，其余平台安装相同锁定Playwright的chromium；不skip或延长测试。该变更不进入应用或SDK产物。Standards与Spec针对这四文件补审均0项，旧失败保留，新完整成品/远端结果后续追加。
