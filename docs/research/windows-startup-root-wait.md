# Windows renderer root 等待超时排查

2026-11-08。范围是 Windows E2E 在 `launchSpace` 的 root 等待处偶发超时，不是已证实的客户启动故障。

## 结论与边界

已确认 Space 测试夹具有一个可复现的等待缺陷：`waitForFunction` 默认按动画帧轮询，
窗口后台节流并隐藏后可停止产帧；此时稍后挂载的 `#root` 已存在，等待仍超时。
改用 `locator('#root').waitFor({state:'attached'})`，保留原有 30 秒默认超时。
DOM 挂载是此处的就绪条件；Shell 首次绘制仍由原有启动测试独立验证。

这是 Space 测试设施的问题。独立 Electron 程序只导入 `electron` / `node:path`，不加载 SDK，
也能重现旧等待失败、新等待成功。没有证据要求 SDK 修复此机制；未调整模型、Agent、权限、
沙箱、Host 协议、生产启动流程或 SDK 依赖。

原始事件为提交 `37019ca31b07461c540e3c53768d6572364a59c6` 的
[CI 42457808638](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42457808638)，
Windows shard 2 的 extension diagnostics 场景在测试体开始前超时，自动重试通过。
其 artifact 只有测试侧 trace，缺少 renderer DOM、导航响应和绘制状态。
**因此不能把这个已证实的缺陷认定为该历史事件唯一、已经取证证实的触发原因。**

## 因果对照

控制场景通过真实 `launchSpace`：等待 Shell 首次绘制及恢复后台节流，隐藏原生窗口，
暂时摘下 root，250ms 后重新挂载。这是刻意构造的边界条件，
不是声称静态 HTML 在原始失败中曾被摘除。

| 对照                            | 实际结果                                                     |
| ------------------------------- | ------------------------------------------------------------ |
| 原夹具，原 30000ms 超时         | root 已存在、document complete、挂载后动画帧为 0，等待仍超时 |
| 同一场景，DOM attached 等待     | 通过；root 存在，挂载后动画帧为 0                            |
| 不加载 SDK 的最小 Electron 程序 | 旧等待 2000ms 超时；同预算的 attached 等待成功               |
| root 保持缺失                   | 仍在 1000ms 测试预算内拒绝，原始错误保留；清理前附上诊断     |
| index.html 单次 EBUSY 注入      | 原有 watchdog 恢复；不能据此推断历史事件为文件占用           |

普通 Mock 聊天不等于没有 Host：元数据服务仍可能启动 daemon。
SDK 排除对照以独立 Electron 程序为依据，不以 `KODAX_FORCE_MOCK` 或描述文件存在与否为依据。

## 修复与失败证据

- `tests/e2e/fixtures.ts` 改为 DOM attached 等待。失败时在清理隔离 profile 前附上
  `startup-root-failure` JSON；只记录 root 是否存在、文档 readyState、是否为固定 app URL、
  最多 8 个窗口的显示/后台节流状态。查询总预算 2 秒，失败记录状态，保留原始启动异常。
- 不附加任意 URL、DOM 文本、profile 文件、SDK payload、凭据或错误正文。
- `renderer-startup-fixture.spec.ts` 保留无帧下成功与真实 root 缺失两个反向回归。
- 本地完整 Windows shard 另发现 Settings inventory 在 `workflow.policy.get` 返回前立即取样，
  报 Max agents 缺失。界面该控件本就等待异步 policy；测试先等待其可见，再执行原有完整清单与
  无匿名控件断言。未修改产品行为，也未删除断言。

## 本机验证

该工作树的声明、lockfile 和实际安装均为 Registry SDK `0.7.97-beta.3`，
Space `0.1.47-alpha.4`、Node `22.23.1`、Electron `42.5.0`。另一 checkout 已安装 beta.4，其升级适配不在本补丁中；
本报告不把 beta.3 结果表述为 beta.4 验收，不覆盖另一线程的升级改动。

| 检查                                        | 结果                                                |
| ------------------------------------------- | --------------------------------------------------- |
| 原 extension diagnostics 场景重复 12 次     | 12/12，无重试                                       |
| 同一 worker 重复启动 40 次                  | 40 次完成；未重现原始自然超时                       |
| Root 修复 RED → GREEN                       | 原 30 秒等待失败；修改后通过                        |
| 无帧成功 / root 缺失与证据保留，各重复 3 次 | 6/6，无重试                                         |
| Settings inventory 重复 3 次                | 3/3，无重试                                         |
| 原完整 Windows shard                        | 91 通过、1 个上述 Settings 失败、7 跳过；不是全通过 |
| 类型检查、lint                              | 通过                                                |
| 启动夹具阶段完整 npm test                   | 4,709 通过、20 条件跳过、0 失败                     |
| npm run build:smoke                         | 通过                                                |
| 启动、绘制、后台节流、SDK UI 专项           | 10/10，无重试                                       |
| 最终提交正常 CI                             | 待完成                                              |

80 次快速启动探索在至少 31 次完成后主动终止，未完成批次不计通过。
早期 green 探索中误断言 Mock 不产生 Host 描述文件，失败后已纠正；未计通过。
临时 GitHub 诊断运行已按用户要求取消。后续复现均在本机隔离桌面进行；
提交后的普通 CI 用于跨平台回归，不再另起远程 Windows 诊断任务。

本地原始日志在忽略目录 `artifacts/diagnostics/windows-startup-local/` 与
`artifacts/diagnostics/e2e/`；关键记录：`root-red`、`root-green-confirmed`、
`root-evidence-red`、`root-evidence-green`、`root-helper-red`、`root-helper-green`、
`no-sdk-proof.json`、`settings-inventory-green`。
这些本地忽略文件不随 Git 上传。

## 正常 CI 追加发现：搜索定位误触历史分页

首次修复提交 `8b3c9019d3271440833839b31f249f090d4659ff` 的
[CI](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42487048589) 门禁通过：
Windows 188 通过、14 条件跳过、0 重试；新增两个 root 场景、原 extension diagnostics 与
Settings inventory 均首次通过。Linux 192 首次通过、1 个重试后通过、9 跳过；
重试项为启动覆盖层的 reload ready 观测返回 null，不是 root 等待失败。

[build 第一轮](https://github.com/KodaX-AI-dev/KodaX-Space/actions/runs/42487048975)
的 Intel macOS 在历史搜索返回测试中等待 `OLDEST 11` 超时，其余平台通过。
本机正常速度连续 12 次通过，6 倍 CPU 限速复现同症状；追加探针在 12 倍限速捕获：
没有用户向下翻页时，读取序列从 `newest → middle → oldest` 多出一次 `middle`，
再定位搜索结果并返回时，保存的阅读页已被替换。失败原因不是仅仅读得慢。
合成浏览器夹具使用固定 IPC 回执，没有真实 Host 或模型请求，定位为 Space 渲染层对程序滚动的归属判断。

只补固定时间窗后仍复现。最终方案为：搜索定位显式标记程序滚动；隐式边界分页必须匹配
最近尚未被程序定位取代的用户方向意图。滚轮、按键、触摸和滚动条设置真实输入意图；
程序定位与会话切换清除它。触摸按上一次有效采样判断方向；同一次滚动条拖动跨页后，
后续真实 pointermove 可重新声明意图，pointerup/cancel 与会话切换回收指针身份。
保留原有短时滚动保护及全部手动翻页入口，不增加等待阈值、
后台轮询、DOM 扫描或模型调用。

慢渲染回归与三类输入分别使用真实浏览器事件路径；原完整用例继续覆盖滚轮、历史搜索、
回到最新及过期读取。最新 4 个浏览器用例连续 3 轮全部通过（12/12，无重试）；类型检查、lint、生产冒烟构建通过。
真实 SDK 历史导航与长会话滚动的源码 Electron E2E 5/5，无重试。新提交门禁结果待补。
旧源码的 failed-jobs 重验再次在同一搜索返回断言失败；它不算新生产修复的验收。
Linux reload 观测的单次重试继续保留为未闭环的独立验收项，不能表述为全部首次通过。

## Standards

初评发现证据文件写入失败会跳过测试关闭，已改为嵌套 finally。复查：成文规范硬违反 0，
12 项 smell 基线发现 0；无剩余项。追加历史分页补丁的初评 P3（测试职责过长）
已拆分为具体输入/验证 helper，均小于 50 行；最终复查无剩余发现。

## Spec

初评发现控制延时可能被 firstWindow 等启动前置步骤耗掉，削弱回归辨识能力。
现已让 launchSpace 与两个控制场景共用 waitForRendererRoot，控制场景直接等待该真实代码路径，
消除前置步骤的竞争。复查无剩余项；历史唯一根因与 SDK 版本边界仍保持明确。

追加历史分页补丁初评的两个 P2（同次触摸反向、同次滚动条连续跨页）均已先写失败回归，
再补齐采样与拖动身份生命周期，最终复查无剩余发现。

规范轴 0 剩余发现、最高无；需求轴 0 剩余发现、最高无。
