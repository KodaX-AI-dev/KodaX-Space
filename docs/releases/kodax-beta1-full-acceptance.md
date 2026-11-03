# beta.1 全面界面与接口验收

2026-11-03。来源：[完整适配方案](kodax-beta1-space-adaptation-plan.md)、[已实施修复](kodax-beta1-space-fixes.md)，以及用户要求逐项验收现有界面与底层接口、补齐 E2E。基线 `aaec22f6`，SDK 精确使用 Registry `0.7.97-beta.1`，Space `0.1.47-alpha.3`。

## 验收边界与方法

对已开放的产品功能逐项核对 Renderer → typed IPC → Main owner → SDK 公共接口。静态调用清单、单元/集成故障注入、实际 Host、成品 UI 和外部环境分别记证，不将引用命中、测试数量或 Host ready 当作端到端成功。SDK 的可选新能力未自动成为 Space 新功能，不为验收添加费用、云登录或媒体生成产品界面。

原有 Playwright 全套为 69 文件、177 场景，包含公共测试夹具自身测试；并非 177 个纯 UI 场景。此次在 Windows 隔离桌面串行执行现有全部场景，不切换用户桌面，不使用用户真实账号或改写用户 Session。新增专项使用同样的成品入口。所有模拟服务、受控 IPC 故障及条件跳过必须在报告中保留。

静态 AST 清单记录 258 个 invoke、35 个 push 声明；Renderer 直接使用 182 个 invoke 和全部 35 个 push。所有直接调用都有声明、所有 invoke 都有 Main 注册位置。另有三处动态调用封装，分别为扩展 bridge、带等待上限的只读调用和 composer 的 typed dispatch；按其调用方与已有测试核对。**这只是接线检查，不等于全部接口均被真实服务执行。** 原始清单在 `artifacts/diagnostics/beta1-full-acceptance/ui-contract-inventory.json`。

最终成品测试实际收到的 Host 为 `0.7.97-beta.1`、daemon/process，来源为 `out/win-unpacked/resources/app.asar/node_modules/@kodax-ai/kodax/dist/kodax_cli.js`，build fingerprint `828b96ae1129f4432f5470887603b1290e7f66802f935c0c7bea81639559d5d4`。公开能力实测为 productClient:1、productExecutionBinding:1、productExecutionProfile:2、sharedSessionSettings:2、effectiveConfig:1、sandboxRuntime:11、sessionPromotion:1、providerCredentialBroker:2、conversationHistory:2。原始证据在 `shipped-ui-output/sdk-alpha11-alpha-11-work--f0a1b--cannot-change-during-a-Run/actual-host-capabilities.json`；测试标题保留历史 alpha.11 名称，实际版本按这份握手记录确认。

## 产品界面与公共契约矩阵

| 产品面                         | 核对的接口/事实                                                       | 成品测试入口与验收点                                                                                                                                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 启动、加载、错误与诊断         | startup phase、连接/Host 能力、typed failure、只读 health             | renderer-boot、startup-overlay、runtime-startup-diagnostics、runtime-startup-exit、runtime-diagnostics、shared-host-history-recovery；首屏、故障恢复、精确 owner 与退出                                                                                |
| 导航、窗口、设置与持久化       | window/titlebar、settings、project、surface                           | onboarding、window-controls、window-close-behavior、window-throttling、background-tray-lifecycle、project-reorder、settings-modal、settings-modal-interactions、i18n-language-switch；键盘/取消/保存/重载/隔离                                         |
| Coder 工作模式、权限、模型     | Host workMode/CAS、AMA、permission、provider/model 与实际执行事实分离 | sdk-work-mode、sdk-alpha11、full-access-mode、mode-toggle、model-picker；三模式、忙碌拒绝、跨 Run 状态                                                                                                                                                 |
| Partner 主流程与专家           | Agent/profile/defaultSkill、可信业务绑定、shell/write/子 Agent 保留   | partner-bundled、partner-mode、partner-layout、sdk-beta1-adaptation；另有实际 16 专家载荷专项，不能用 UI Agent 标签代替实际注入                                                                                                                        |
| Provider 与凭证                | file/env/legacy、来源/CAS/墓碑、OAuth/cloud 只读边界与高级字段保真    | provider-file-credentials、settings-modal-interactions、sdk-ui-contract-acceptance；设置与 Main 实际来源一致、重启不换号、Responses 编辑不丢 SDK 元数据                                                                                                |
| 连接器、资料与知识             | connector session binding、持久提交失败、sources/knowledge/proposal   | partner-mode、partner-bundled、integrated-workspace；持久性、授权和撤销由公共 store/IPC 集成补证；真实服务与 OS vault 单列环境验收                                                                                                                     |
| 普通问题、权限与 Plan          | Host pending/deadline、skip/non_interactive、权限独立策略             | runtime-user-input、sdk-migration-gaps、sdk-ui-contract-acceptance；普通问题重载后不选默认答案，完整 Plan、迟到回答不重放                                                                                                                              |
| 输入、队列、停止与恢复         | inputId、原始材料、queued admission、Stop、unknown 不重放             | send-reply、session-send-retry、composer-after-session-delete、queued-message-toast、sdk-unified-contract、sdk-beta1-adaptation；跨 Main 进程另有实际 Host 专项                                                                                        |
| 正文、报告、流式进度与中性通知 | observeView、estimatedTokenCount、taskResult、未知状态、opaque ID     | sdk-product-output、sdk-alpha11、sdk-alpha11-lifecycle、notifications-surface；不由 delta/字符数/显示文本重建权威事实                                                                                                                                  |
| 历史、搜索、滚动与分叉         | readHistory/readItem original、revision/cursor、Fork/Retry/Rewind     | sdk-history-navigation、sdk-restored-history、sdk-unified-contract、session-empty-records、session-history-acp-filter、conversation-receipts-scroll；分页边界与回最新、真实消息时间                                                                    |
| Skill、MCP、Memory 与命令      | Host catalog、trusted skill policy、主/daemon 共用发现、MCP original  | runtime-builtin-skills、sdk-alpha11-lifecycle、sdk-migration-gaps、slash；默认/显式/模型调用和策略、冷恢复原文                                                                                                                                         |
| Workflow、Actor 与外部 Agent   | 唯一 Host、workflow observation、订阅恢复、独立授权、只读快照         | workflow-events、workflow-slash、external-agent-reference、sdk-migration-gaps、sdk-ui-contract-acceptance；状态过期与恢复不重启任务、不伪造完成通知                                                                                                    |
| Artifact、文件与图片           | SDK tool results、original、host image、Space file viewer 分域        | artifact-file-preview、artifact-html-runtime、file-attachments、markdown-file-actions、sdk-product-output、sdk-migration-gaps；安全打开/重载/不重复执行                                                                                                |
| 扩展健康与配置                 | 当前 loaded/tools 与历史 failure 分离、原子配置与 application 边界    | integration-migration、beta1-recovery-panels、sdk-ui-contract-acceptance；真实扩展故障到设置页，普通聊天和 Skills 仍可用；配置/CAS/坏文件由集成测试补证                                                                                                |
| 统计、effort 与状态面板        | usage/partial/unknown、requested/sent/verified、独立 Actor 事实       | sdk-unified-contract、environment-hub-task-dock、right-sidebar-popouts；低层 statistics/投影测试补未知值与代次；没有凭空新增金额 UI                                                                                                                    |
| 更新、退出与分发               | 手动检查/下载/安装确认、SDK shutdown receipt、其他客户端保护          | manual-updates、update-safe-exit、sdk-unified-contract；外部下载/安装器替身与真正旧版覆盖安装区分，精确 Registry/包体 smoke                                                                                                                            |
| 全部布局与交互巡检             | 命名、键盘、焦点、视口、设置 tab、关闭/取消、正文折叠                 | ui-elements-sweep、coder-layout、compact-composer、sidebar-resize、right-sidebar-popouts、popout-position、integrated-workspace、transcript-font-size、user-query-collapse、workspace-sidebar-density、workspace-visual-motion；巡检不替代上方业务断言 |

## 本次验收发现与修复

1. `workflow.list` 的 `stale:true` 被 Renderer 忽略；降级本地记录会覆盖 Host 的新终态。公共 store RED 复现后修复：展示独立的刷新失败说明、旧记录只补缺项，不覆盖已知结果；空列表也显示刷新失败。
2. Renderer 的初始/管理页列表读取缺少更新守卫，迟到的 running 可覆盖随后到达的 completed，删除后的任务也可复活。公共 store RED 复现后修复：按工作流自身变更 revision 合并，保护已更新任务的同时仍补齐静默历史；删除墓碑过滤 list/event/observation 的迟到结果，记录与现有 500 项工作流缓存一同有界。Host 观察恢复保持独立状态，正常 list 成功不能冒充订阅恢复。
3. 补充成品专项：真实 Host 工作流执行后注入 stale/delayed IPC；真实 Host 扩展加载错误到 Settings，保持 Skills/chat；真实 pending question 经 Renderer reload 后一次 Skip；真实设置页编辑 Responses 保留 SDK-only metadata。工作流故障注入位于公共 IPC，低层订阅 onError 的重试由已有 Runtime 公共接口集成测试证明，二者不混称同一条全真实故障链路。
4. 新的实际 SDK 反例：Host 工作流重命名/删除仍走本地 controller，均返回 false，公开 Product Client 无对应方法。Space 增加 Main owner 守卫、具体不可用原因与按钮能力门禁；历史本地任务仍可管理，不绕过 Host 直接改文件。根功能待 [SDK 交接](kodax-beta1-workflow-management-handoff.md) 后闭环，不能将门禁算成两个功能已实现。
5. 原有全套首轮 171 通过、3 跳过、3 失败：设置/响应式往返使文件搜索面板卸载丢查询；Script Stop 后冷历史持续失效；中文环境变量按钮定位歧义。前者保留 files-mode 实例，并在隐藏时暂停查询和定时刷新；后者明确定位 form 的精确按钮，不放宽业务断言。
6. Script 历史进一步由独立 SDK 读证实：一次 view observation 能让原本成功的新首读变成拓扑冲突，恢复过程中反复读取 view 会再次失效。Space 新首读只对明确 typed 锁/拓扑冲突作有界公开 load 后直接重读，不触碰旧分页，不提交或恢复 Run。12 项公共读取边界专项覆盖级联、连续失败和未知错误；SDK 根修见 [观测/历史一致性交接](kodax-beta1-observe-history-handoff.md)，不关闭 Issue 371。
7. 新测试自身也曾在实际请求准入前将空 Session 当作 idle、使用不一致的工作流 name/manifest name、未配置凭证却要求表单直接保存。夹具已改为等真实回复和服务端请求，使用有效且一致的配置及 SDK 文件凭证。独立首次模型 Skill 调用不打开 discovery，已验证真实内置正文。相关失败证据保留，不归因于生产缺陷。
8. 打包依赖 smoke 把 SDK 合法的正常权限策略 fallback 判为失败，虽然实际命令 marker 和 Exit 0 均已返回。修正验收门禁以识别最后一条明确、有效的 SDK native/fallback observation，拒绝未知版本、原因和未选后端；仍核验命令结果、完整退出，并在 doctor ready 时另作直接 native 执行证明。没有修改 SDK 或放宽 Space 运行权限；14 项门禁回归及该 helper 的行/分支覆盖均为 100%。
9. 找到此前用户指定的 `20261026_200011_47f836372c903b` 原会话，复制其 4,175,628 字节主文件及伴随文件到隔离 profile。实际成品首次及重载均等待当前 view 的全部 3 条助手正文尾部渲染、两个绘制帧，截图后再检查 React 错误；最终完整套件中约 2253ms 首次内容完成，0 模型请求、0 React 错误，源文件未修改。当前 SDK 的这些正文已完整返回（expandedBodies=0），不声称样本触发了集中补读；生产 React 的 120 项并发正文补读另由真实 Chromium 单元专项验证，不关闭 Issue 371 的其他首读性能场景。
10. 随后的完整成品回归发现模型选择器保存竞态：模型先应用到草稿，`provider.setDefault` 尚未完成时再次打开菜单，旧请求 finally 关闭新菜单，Off 选择失效；独立 DEBUG 回放同样复现。确定性 Chromium RED/GREEN 用待决保存 Promise 证明：模型提交同步收起菜单，保存期间禁用变更按钮及 Ctrl+I 重开，迟到完成只释放 busy；思考强度保存也禁用重复变更。模型实际选择、正常下一次选择与 SDK wire facts 保持。旧成品该轮在发现后中止，不记录为完整通过；重打新包后的完整套件与定向收口见下表。
11. 新包完整套件的唯一失败来自新增诊断代码：对旧 cursor 的预期冲突也运行了独立 history probe，使夹具自测观察到额外一次 snapshot 读取。限定诊断仅在无 previous 的新首读失败时执行，旧 cursor 仅保存已有证据；未修改原断言。11 项夹具专项全部通过，生产与成品字节未改，因此仅复跑受影响夹具，不重复全部成品场景。

## 运行结果

后续 Claude 补审核实与修复已生成新成品；当前补丁、验证结果及成品哈希以 [补审记录](kodax-beta1-claude-followup.md) 为准。下列结果及哈希保留为本轮完整验收的历史证据。

机器日志、逐项报告、截图与静态清单集中在 `artifacts/diagnostics/beta1-full-acceptance/`。红灯和最终重跑结果均保留，不通过删测试、放宽断言、增加自动重试或改用假成功消除失败。

| 检查                        | 当前实际结果                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 完整 `npm test`             | 4613 通过、20 条件跳过、0 失败；release 142/7、Desktop 4100/13、IPC schema 371/0（通过/跳过），见 `unit-shipped.log`；跳过原因为 macOS、POSIX 权限或当前 Windows 缺符号链接权限                                        |
| 类型与规范                  | `typecheck-shipped.log`、`lint-final-verdict.log` 均退出 0；格式化及 `git diff --check` 通过                                                                                                                           |
| SDK/资源/原生依赖成品 smoke | `pack-win-release-final.log` 中完整 pack 命令及三个成品 gate 均退出 0；beta.1、daemon/process、sandboxRuntime 11、SQLite/PTY/Artifact worker、会话往返、原文资源及完整退出均验证                                       |
| 成品启动                    | Renderer 5009ms；SDK ready 26290ms **包含脚本的确定性延迟**，不是性能基准；122 条历史子进程记录保留，见 `pack-win-release-final.log`                                                                                   |
| 成品完整退出                | 6 个真实 SDK 场景全部通过：Stop、reload/fork、排队、精确退出、Rewind、保护第二客户端，见 `pack-win-release-final.log`                                                                                                  |
| 关键失败复验                | 真实 Host 管理能力、三模式、原会话独立专项 3/3；精确 Script 部分输出→Stop→冷 Host 重启→保留历史且不重放另 1/1，见 `critical-current.log`、`script-final.log`；此前错误 grep 匹配到三模式，未将其算作 Script 冷恢复证明 |
| 模型选择器竞态              | 新成品 `model-picker.spec.ts` 3/3 通过，见 `model-picker-new-package.log`；控制 Promise 的 Chromium 回归及 reasoning 相关公共接口定向 22/22，见 `picker-final-unit-green.log`，并纳入最终完整单元回归                  |
| 完整成品套件                | 184 场景、34.6 分钟：180 通过、3 条件跳过、1 夹具自测失败，命令退出 1，见 `shipped-e2e.json/log`；所有实际成品 UI 场景通过，0 自动重试                                                                                 |
| 夹具定向收口及逐项结论      | 修正失败诊断范围后 `fixture-final.json/log` 11/11 通过。按同一场景的最终结果合并为 **181 通过、3 跳过、0 未关闭失败**，证据为 `acceptance-verdict.json`；这是全量加定向结果，不能表述为一次全量退出 0                  |

Windows 安装包与便携包已由 electron-builder 生成。此前 pack 在旧 sandbox smoke 判定处退出 1，修正后同一旧包的三个阶段均单独通过。新增模型选择器修复后重新执行完整 pack：一次 Registry 连接超时，随后沿用当前系统已有的本机代理重试，精确 Registry 校验、构建及全部三个 `runProductSmokes` 阶段成功，外层命令退出 0，证据为 `pack-win-release-final.log`。所有中间失败仍保留。`package-manifest.json` 验证 Root/Desktop/lockfile/物理安装/ASAR/实际 smoke 六处版本一致为 Registry beta.1，保存完整 resolved/integrity；包内 Main 与当前构建字节相同。最终成品 SHA-256：

| 文件                                          | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `out/KodaX-Space-Setup-0.1.47-alpha.3.exe`    | `b07f7be9bc2a80cc467c894e8033de83d76fde352fa41bd05e5b864c39672492` |
| `out/KodaX-Space-Portable-0.1.47-alpha.3.exe` | `c313e0f0274aa29d70f33fd6bf2e84f9d55d1e64c502daba41e5be3baa880f1d` |
| `out/win-unpacked/resources/app.asar`         | `fdb779a95771b04905192aae2db701cc45a4a5ac54d09111e11351dfcedfcde3` |

没有更改 Space 版本或发布 Release。覆盖率实测范围为本轮 sandbox helper 与前轮凭证/健康模块；未收集全仓覆盖率。UI 接线与 E2E 数量分别记录。

3 项 E2E 条件跳过均为 `sdk-visual-review-live.spec.ts` 的真实模型视觉评审（AMA、SDK 的 SA 库用例、显式控制），要求 `SPACE_LIVE_VISUAL_REVIEW_E2E=1` 和真实模型配置；Space 的产品 SA 入口已退役。这些未启用场景不计为成功，也不作为模型智能或真实费用验证。

## 外部阻塞与完整关闭条件

- SDK：[promotion view](kodax-beta1-promotion-view-handoff.md)、[旧队列原文/撤回回执和 live Host 重绑](kodax-beta1-queued-intent-handoff.md)、[锁内 Partner Agent 准入](kodax-beta1-partner-mode-admission-handoff.md)。各自保留已实测反例或静态确认的契约缺口，不能用 Space 的 UI 修复宣称底层保证已完成。
- SDK 新增：[共享工作流管理](kodax-beta1-workflow-management-handoff.md)，正式 beta.1 缺 Host rename/delete/prune 接缝，不能用旧本地控制器冒充。
- SDK 新增：[观测与历史一致性](kodax-beta1-observe-history-handoff.md)，Space 的有限公开读取兼容不替代 SDK 根修。
- 平台：Kylin/Linux 缺 Node/libsecret、Linux 窗口按钮、macOS/ARM 的系统凭证与 native；当前 Windows 机器不能替代这些真机。
- 外部服务：真实 OAuth/cloud/连接器账号的登录/刷新/撤销、真实模型质量和账单；本地 Provider 只证明协议与授权链路。
- 安装与性能：隔离机器上的 NSIS 覆盖旧安装、真实断电、Issue 371 的其他冷首读/大规模客户数据；本次原会话副本回放只关闭已验证场景，不在用户真实安装或历史上做破坏性实验。

以上每项都有明确归属和证据要求，仍存在时总体标记为“有条件验收”，不能签为全平台/全部 SDK 保证通过。

## Standards

最终只读规范评审：硬违反 0、可行动判断题 0。恢复条件集中在具名 helper，限定 typed 锁/拓扑错误、无 cursor 首读及两次公开 load；重试不重开 view。隐藏文件面板暂停查询与定时刷新；新增 helper 和测试回调少于 50 行。未新增 Runtime 或 Session 写入者。

## Spec

本轮补丁的最终只读需求评审：新增 finding 0。工作流按 run 保护新数据并补齐静默历史，健康状态独立，删除墓碑与两处管理按钮门禁一致；旧本地定义仍可操作。原始 SDK 输入、权限和业务绑定保持。扩展验收等待真实请求和回复，首次模型调用 Skill 不依赖 discovery。原会话回放已补助手正文等待和截图后错误检查，原评审 P2 已关闭；模型选择器迟到保存竞态补审为 0。SDK 根因、工作流管理和跨平台/外部服务限制独立保留，最终成品测试结果另记。
