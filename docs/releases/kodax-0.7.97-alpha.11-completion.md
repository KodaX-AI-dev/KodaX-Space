# alpha.11 Space 遗漏补齐与专项回归

2026-10-30。对应 [完整增量审计](kodax-0.7.97-alpha.11-coverage-audit.md)。SDK 使用物理安装的 Registry `@kodax-ai/kodax@0.7.97-alpha.11`；不修改 SDK 源码，不引入第二个 Runtime/Session 写入者。Space 版本仍为 `0.1.47-alpha.3`，未发布。

## Space 改动

- 新 Coder 会话首条输入前可选 Agent/Coding/实验性 Script。通过现有创建流程建立 Host draft，再读取 revision、设置工作模式；设置确认前锁定发送。同一作用域的并发创建复用请求，导航后迟到的创建不抢走当前会话，模式更新不会写入新选择的会话。
- `/work-mode` 查询及三种合法参数走现有 Host 设置接口和 Coder 准入；多余或未知参数被拒绝，不消耗模型请求。旧 Host 提示升级，CAS 冲突刷新权威值，不自动重试过时选择。
- 用户手册和应用内手册解释工作模式、AMA、权限的区别，草稿及持久会话边界、完整原文读取和子任务报告。Partner 保留受限 profile，不把隐藏选择器或单传字段宣称为已启用 Agent。

## 专项验收

新增正式测试 `tests/e2e/sdk-work-mode.spec.ts`、`sdk-alpha11-lifecycle.spec.ts` 和 `AgentModeSelector.browser.test.ts`。本地 Provider 只给出确定的模型响应，工具、技能、权限、存储、daemon 和 UI 使用实际 SDK/Space；使用隔离 profile，不修改客户会话。

| 专项 | 断言 |
| --- | --- |
| 首条前模式 | 选择 Agent 不发模型请求，首次输入沿同一 Host draft 使用 Agent；Script 也由首条前选择进入真实执行 |
| 控制命令与并发 | 查询/设置不访问模型；非法参数拒绝；保存期间禁止发送，切换会话不串写，冲突后显示 Host 原值 |
| Script 生命周期 | 实际 read leaf 返回内容；Plan 拒绝 git commit；write 后点击 Stop，保留先前写入，后续写入不执行；替换 Host 后历史可读且没有模型/工具重放 |
| MCP 原文 | stdio MCP 实际生成大 JSON，由 Host 保存；通过具体工具项分页读取；替换 Host 后 UI 读取完整原文且内容一致，MCP 仅执行一次 |
| 多份长报告 | 同一消息的三份结构化报告和无 ID 的旧未知报告，按 failed/cancelled/completed/unknown 顺序展示；live/history 全文 SHA-256 校验，UI 展开后尾部与字面代码正确；替换 Host 后仍正确，无 React 报错 |
| 模型 Skill 生命周期 | 模型主动加载项目 Skill，allowed-tools 拒绝 glob；read 的 PreToolUse hook 真实执行；后续模型采用偏好；强制重新发现后禁用模型调用生效且不再次执行 hook |

测试夹具纠正记录：Plan 明确允许系统临时目录写入，拒绝测试改为无允许目标的 git commit；Skill hook 自身也受 allowed-tools 限制，夹具显式允许其 Node 命令。旧 XML 报告按传输规则转义，分页使用重新读取的历史项 ID（ID 含 transcript revision，不能跨历史变更复用）。这些是测试契约修正，不作为产品缺陷或通过放宽断言隐藏故障。

日志根目录：`artifacts/diagnostics/sdk-alpha11-completion/`。

## 检查与交付

- `npm test`：4,489 通过、20 条条件/平台跳过、0 失败（release 130/7 跳过，desktop 3,989/13 跳过，IPC 370）。随后新增的命令回显单测另有 1 项 RED→GREEN 通过。
- 最终 typecheck、lint、Prettier 指定文件检查、build:smoke 和回显修复后的 build:main 通过；Registry release gate 确认 exact alpha.11，integrity 与上一轮一致，无本地 SDK link。
- Windows Setup/Portable 已生成到 `out/sdk-alpha11-complete`，不覆盖旧 `out/win-unpacked` 或 `out/sdk-alpha11`。包内 smoke 通过：精确 SDK 文件、原生模块、builtin 资源、Artifact PNG、constructed handler worker、updater 和 SQLite 执行。
- 启动 smoke 通过：Renderer 4,350 ms，Runtime 25,259 ms（包含人为 20 秒就绪等待），122 条历史 child 记录保留；这是受控回归，不是性能基准。完整退出 smoke 的 6 项真实 SDK 用例通过。
- 客户 Session `20261026_200011_47f836372c903b` 新包冷选择 3/3 通过，每次人为延迟 Host 就绪 10 秒，React/page-error 和 toast 证据均为空；仅在隔离 profile 重定位项目元数据，不改客户原件。
- 新包 34/34 E2E 通过，0 重试，6.2 分钟：包括上述 6 项新增专项，以及原有模式 CAS/运行中拒绝、token 估算、普通问题等待/Skip、builtin Skill、手动更新、历史导航、Product 输出、Workflow/Memory、权限审批、队列/Stop/恢复/退出和窗口操作。首条前 Agent 界面截图已检查，`/work-mode` 查询/切换在真实 composer 可见回显且无新增模型请求。没有运行真实 NSIS 安装替换，也未发布 Space。

实际新包 Host：`0.7.97-alpha.11`，`daemon` / `coder` / process isolation，build origin 位于本次 `out/sdk-alpha11-complete/win-unpacked/resources/app.asar/node_modules/@kodax-ai/kodax/dist/kodax_cli.js`。Product Client、draft Session、共享设置及 workMode 由真实能力响应确认，不依赖版本字符串推断；证据为 `packaged-e2e/**/actual-host-capabilities.json`。

| 文件（均位于 out/sdk-alpha11-complete） | Bytes | SHA-256 |
| --- | ---: | --- |
| KodaX-Space-Setup-0.1.47-alpha.3.exe | 213536417 | ae395e42f08c36471ac21799269c1f33964dd9b6110baf3a72bcec83a1d7fd10 |
| KodaX-Space-Portable-0.1.47-alpha.3.exe | 213326507 | 98770cbfed19a03ec14aeae617ac6acf11646ddb64d76e686f14f44ec4def5e4 |
| win-unpacked/resources/app.asar | 125473666 | 1b0aed14e607c5a0fc8760d2a58265c958b13ec4ee189db86a8bb1b8452bd80b |

## Standards

固定点 `88b042bb`，独立规范评审剩余 0 项。初轮发现测试 Provider 工厂超过 50 行且承担多项职责，已拆为请求计划、协议响应、服务生命周期三个小函数并复核。

## Spec

独立需求评审剩余 0 项。初轮发现 `/work-mode` 成功回执缺少 `echo:true`，导致用户查询没有可见结果；已补回显，经单测 RED→GREEN 验证，并将 E2E 改为真正从 composer 输入查询/切换，避免 IPC 通过掩盖 UI 缺口。规范轴 0 项；需求轴 0 项。评审结论不代替下述安装包验收。

## SDK Partner 协作说明

Space 希望 Partner 使用新版 Agent 工作模式，同时保留现有自定义 agentProfile、专家验证、toolVisibilityPolicy、连接器及 Host 授权限制。目前 alpha.11 的 resolveWorkMode 遇到显式 profile/工具策略会走兼容 coding 路径，单传 workMode:'agent' 不会应用 Agent 的编程专用工具筛选，真实请求菜单也仍包含 repo_overview 等条目。请提供受支持的显式组合方式并保持旧调用兼容，使 Agent 模式与 Partner 原有能力上限取交集，并提供可核实的有效模式；不能丢弃 profile/策略或扩大权限。验收同时检查模型 schema、工具发现和实际调用：Agent 排除的编程专用工具不可经桥接恢复，Partner 原本禁止的 bash/write/edit/子代理不开放，允许的 Skill、研究、连接器、Artifact 和专家验证继续工作；普通 Coder 的 Coding/Agent/Script 及专用子 Agent 的兼容行为不退化。

Linux Node 缺失指引仍按上一份 integration 记录交接；用户无感自动 sandbox fallback 保持既定设计。Kylin 实机、Space Issue 225 客户补充证据和 SDK Issue 371 首次历史读取延迟仍未闭环，不把 Host ready 当历史加载完成。
