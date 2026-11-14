# KodaX beta.3：Space 最终验收记录

2026-11-08。本记录是 [发布差异核对表](kodax-beta3-space-adaptation.md) 的实际执行结果，不替代历史版本证据。

## 冻结范围

- SDK：Root、Desktop、lockfile 和已安装实体均为 Registry `@kodax-ai/kodax@0.7.97-beta.3`，归档 SRI 已核对。没有使用本地 SDK 源码替代发行包。
- 接入基线：另一线程已提交的 `18815388`；本轮在保留这些提交的基础上继续补齐规则编辑安全、片段数量、Windows 外置资源门禁、文档及测试环境。
- 最终生产构建为 `0e23a6a41514cd48abaec26d492df92f911858a9`；验收测试冻结于 `a47279c85f0c30b62c7a9b524052d864ca969866`，其间只修改四个 E2E 文件。新 ASAR Main 与源码输出相同，全部555个 Renderer 文件逐个比对一致。旧 f6f70c03 成品已因六处 CSS 修复重新生成，不沿用旧哈希。
- 本地安装器仍使用 Space `0.1.47-alpha.4`。未发布、覆盖或重新标记已有公开版本。

## 用户行为与接口

沿用 beta.3 的 Host 历史定位和整轮解析，不用 UI 行号推算边界。首轮被接纳前可选 Agent/Coding/实验性 Script，此后遵循 `workModeLocked`；旧 Host 缺少事实时提示升级。Partner 使用可信 Agent 准入，并保留正常 shell、写入与子 Agent 能力。

SDK 的 global/project rules 随真实上下文进入 Coder 和 Partner。Context 只给 Main 签出的两个固定 AGENTS.md 保存目标提供编辑入口；`rules/AGENTS.md` 等片段只读。IPC 接纳512个条目，513个拒绝，SDK 原有字节预算继续有效。

Windows 的外置 containment 程序资源由正式 SDK 提供，并在安装及 ASAR 门禁中校验。凭据、Skill、问题交互、审批、容量恢复、原文、子任务结果、队列、promotion 和显式单次 Workflow 沿用已有 Product Client 接入，不增加第二个 Runtime/Session 写入者。

## 已完成的本地验证

| 范围                                   | 实际结果                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- |
| 基础适配完整 npm test（最终CSS补修前） | 4727项：4707通过、20既有条件跳过、0失败；最终提交由远端完整套件再核对  |
| 类型、lint、生产 smoke 构建            | 通过；测试环境补丁后的 lint 再次通过                                   |
| 最终发布与脚本套件                     | 155项：148通过、7条件跳过、0失败                                       |
| rules 原浏览器反例                     | 2/2通过；修复前两项均 RED                                              |
| 规则 IPC 数量边界                      | 24个真实片段通过；512接纳、513拒绝                                     |
| 新 SDK 实际源码/成品规则用例           | 各1/1、retries=0；27条来源、两处编辑目标、两种产品的实际请求均验证     |
| 打包内置真实 Host 生命周期             | 6/6、retries=0；原文、边界、回退续问、完整退出等                       |
| 门禁和夹具补核                         | 资源13/13；来源门禁13/13；实际 SDK 控制3/3；空信号文件受控 RED→GREEN   |
| 最终0e23a6a4成品验收                   | 43/43＋生命周期6/6＋旧UI契约补核4/4，共53个不同成品场景通过；retries=0 |
| 最终远端 build / ci                    | a47279c8：build 7/7、ci 6/6全部成功；0最终失败                         |

视觉旅程的固定正文场景使用显式 KODAX_FORCE_MOCK 离线夹具；该夹具保留所选模型的展示元数据，但不建立真实 SDK Session，截图中的 session.workMode 查询提示不能作为真实 Host 模式证据。生产中的显式 mock provider 已有 Mock 标记；工作模式、原文、双项目并行等运行事实由真实 SDK 专项分别验证。

专项与完整套件有重叠，不累加成更大的单测总数。真实 Provider 链路使用本地回环服务测试协议与上下文，不以此声称评测线上模型智能水平。

实际成品为 `out/win-unpacked/KodaX Space.exe`，`app.isPackaged:true`，Electron42.5.0。Host 真实能力包括 productHistoryLocation:1、productHistoryTurnResolution:1、productInputRecovery:1、productExecutionModeConstraint:1、providerCredentialBroker:2、actorSettlementConvergence:2、contextCompaction:3、sandboxRuntime:11；设置返回 workModeLocked:true。源码和成品身份分开取证。

## 首次失败、修正与边界

完整单测首次失败2项：旧16条 schema 边界断言，以及模式按钮尚未结束保存时发出 Home。更新数量断言，键盘用例明确等待按钮恢复，保留 CAS 和模式锁定断言。

首次成品广回归36/38通过。两个旧测试分别试图在首轮后改变 Partner 的 Agent 模式、以及在 @Files 补全菜单打开时用 Enter 提交文本。按新契约修正后同一成品专项2/2通过；保留专家/shell/重复输入身份断言，并新增 SDK 正文（含换行和绝对路径）严格相等检查。

第二组成品广回归37/38通过。一次重载后语言用例未见 Community 角标；同用例隔离复验通过。带诊断的五次重复4通过、1次在截图等待超时（与原角标症状不同）；另以紧凑链路连续12次重载并切换语言，角标、真实 license IPC 均正常。原失败不删除，不据此归因 SDK，也不宣称该偶发角标现象根因已经确认。最终成品全组结果单独列出。

远端依次拦下了：缺少浏览器二进制、锁定 Playwright1.60 不支持 ubuntu-latest 的26.04安装器、runner 名称在来源门禁中的漏同步，以及 macOS 夹具读到刚创建的空信号文件。分别补齐浏览器准备、固定 build smoke 到 Ubuntu24.04、同步精确 job 名及保留原期限等待完整信号；没有跳过断言、加长期限或重试业务操作。输入器用例按原生 macOS 键位操作，应用快捷键不变。旧运行因后续提交替代而取消，不能算成功。

完整远端 E2E 又发现两项真实 UI 失败：Linux 第二片91通过、6条件跳过、2失败，三次尝试均失败；同一 Windows 成品两项也稳定 RED。输入器已改为 Lexical contenteditable，workspace.css 却仍用 textarea:focus 匹配有限掠光和暂停样式。六处选择器改为现有 .composer-editor 后，源码四场景4/4、retries=0，覆盖有限时长、质量档、reduced-motion、后台、滚动、真实双项目流式暂停及菜单边界。原620/1000ms时长与守卫不变；没有新增循环或改变模型请求。修复单独提交0e23a6a4，重新打包并重新验证全部入口和哈希。此前冻结成品38/38通过属于修复前的 SDK 广回归，不能代替新包验收。

0e23a6a4完整Linux第一片为96通过、1条件跳过、4失败。三个旧测试边界分别是两处 textarea placeholder 属性，以及没有先进入 Appearance 的外观操作。第四项右键失败在本地也 RED；只观察原生事件的探针显示模糊角色名称选中了历史大纲按钮（标签含相同路径），实际事件也落在该按钮，排除了点击偏移、菜单关闭或文件触发器错误。文件路径定位改为 exact:true，保留外部路径不开放菜单、键盘焦点和完整动作断言。四项同一新包4/4通过，各项12–21秒，没有改动测试的超时/重试配置。a47279c8只提交这四个测试文件；现有安装包仍与全部生产输出逐字节相同。

生产提交0e23a6a4的build工作流四平台、静态检查与门禁7项全部成功；Linux及Windows第二片E2E均成功。旧CI第一片的失败不计成功，后续被新测试提交替代并取消。最终完整CI以a47279c8的独立运行结果为准。

## 成品校验值

| 产物         | SHA-256                                                          |
| ------------ | ---------------------------------------------------------------- |
| app.asar     | b03119955a65a6fb8fcf98f3a902aa6bcd54345e497c1063aa034a5eae2cd98b |
| Setup exe    | 0f19c32da2ec415684bc2966b6674824d3d4e56ba87b68390796216350c6acb6 |
| Portable exe | 7092a72852f1fad215a6d1691e3e8d96c965ba9fc7536bda92c76f4a8f213526 |

`dist/windows-effect-job-programs.json` 的安装/成品字节一致，长度13911，SHA-256为 `b8ccb16e348d37a6124486225777b79fbd37705fe3c653d80aaeb166b463c185`。

## Standards

独立规范轴对生产补丁、门禁、测试与后续CI联动逐轮复核：0硬违反、0可行动smell。保留固定保存目标与SDK事实边界；诊断夹具、原始提示和用户凭据不进入产品或提交证据。

## Spec

独立需求轴逐轮复核：0项。完整发行差异表已核对，SDK内部结算、恢复及策略由SDK负责，Space只补接缝。成品及远端结果按实际完成状态记录。

未新增已确认的 SDK 待协作缺口。客户原生麒麟/macOS通知及窗口体验、外部真实账号、任意文档的 Word/WPS 保真和 Issue371 全部恢复性能仍有独立环境/范围，不能据本次受控验收宣称全部解决。

## 最终远端证据

[build 工作流](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42445420018) 与 [ci 工作流](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42445420015) 均针对验收提交 a47279c8。生产包来自0e23a6a4，四文件测试补丁不进入应用字节。

| 单测平台    | 日志报告总数 | 通过 | 条件跳过 | 失败 |
| ----------- | -----------: | ---: | -------: | ---: |
| windows     |         4727 | 4708 |       19 |    0 |
| linux       |         4693 | 4676 |       17 |    0 |
| macos-arm   |         4717 | 4682 |       35 |    0 |
| macos-intel |         4719 | 4684 |       35 |    0 |

以上按日志原始计数记录，不强行统一为同一个总数。与前轮相同单测代码的日志比较，Linux及macOS ARM合计少报告36条结果（35个标题未出现，另1条仅有开始标记）；另用未开启强制退出的相同本地源文件重放254项，全部36项均明确通过。差异原因尚未确定，不能据此把远端未报告的项记作通过或条件跳过。生产提交0e23a6a4的同一单测代码已完成四平台验收；此处同时保留最新提交的原始统计与本地补核。

| E2E平台 | 总场景 | 首次通过 | 重试通过 | 条件跳过 | 最终失败 |
| ------- | -----: | -------: | -------: | -------: | -------: |
| windows |    200 |      186 |        0 |       14 |        0 |
| linux   |    200 |      192 |        1 |        7 |        0 |

Linux的一项重试是既有项目HTML嵌套预览场景：首次切换后仍显示Direction a，第二次完整运行通过。该用例在项目HTML/iframe脚本内交互，没有Provider/Run调用；不把重试当作首次通过，也未声明该偶发现象已修复。Windows两片均无flaky。条件跳过的用例名称、精确任务ID和原始统计保留在[机器可读记录](kodax-beta3-space-final-validation.json)。

本次修正的四个旧UI用例在完整远端运行中通过；此前CSS动效反例在新成品及远端均通过。类型、lint和格式检查通过，临时探针不进入产品或提交。
