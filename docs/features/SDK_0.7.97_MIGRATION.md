# Space 接入 KodaX 0.7.97-alpha.3

本次是 v0.1.46 已有能力的依赖与契约迁移。用户已要求完成 Space 侧接入；不增加客户端产品、服务器或新的应用配置。

## 已确认的公共接缝

测试通过现有 RuntimeHostAdapter、RealKodaXSession、IPC 和已发布 SDK 的公共接口验证。保留现有 Coder/Partner 隔离、可信 Main 凭据与 Host Tools、共享设置与 Shell 合同、历史与实时输出身份规则（ADR-009）。

1. 启动使用 ensure，重连使用 passive connect；按真实能力版本拒绝不兼容 Host。
2. 普通输入、队列、steer/redirect、Skill、command、review、workflow、独立 Actor 与 compaction 接入可信 Main 授权。输入使用稳定 inputId；queued 不虚构 runId；秘密不经过 Renderer/IPC。
3. 重连从 SDK 当前 view/snapshot 重建，不使用已删除的 journal/replay。历史使用 SDK canonical 边界与 sourceRevision，过期边界拒绝；保留 Fork/Retry/Rewind、长正文、附件和中断记录。
4. 累计统计、物理请求、上下文和逐工具 Sandbox 使用 SDK statistics，保留 partial/unknown，不用 permissionMode 推断实际执行。
5. 完整退出使用 SDK lifecycle 回执及离线查询。区分接受、工作清理、受保护的其他客户端和精确 Host 退出；unknown 保留恢复信息；Space 自身资源仍由 Space 清理。

## 实现与验收顺序

逐个接缝执行 RED → GREEN。先启动与当前投影，再输入授权与队列，再历史与统计，最后退出/恢复。每片运行关联回归；收尾运行全量测试、类型检查、lint、构建与 Standards/Spec 评审。验收要求不只消除类型错误，还验证已发布包上的真实运行与退出。

迁移事实与上游证据见 [已发布 SDK 验收](../research/kodax-0.7.97-alpha.2-published-sdk-audit.md)。实现验收结果完成后追加于此。

## 上游接缝需求的范围校正（2026-10-10）

用户选择由 SDK 团队补必要接缝，Space 继续其他迁移。需要保留的是现有产品行为，不是四个旧 Run options 字段的形状。不能据此设计通用 Main run-options 覆盖接口或恢复客户端执行权威。

- 最明确的待补能力是 Product 路径的 Workflow 可用性，以及 Host 对既有 maxAgents/tokenBudget 上限的配置和实际执行。maxConcurrency 已有 Host config.workflow.maxConcurrency 入口，应先复用。Workflow 运行目录应由 Host 管理，Space 消费其 runDir 等公开事实；不预设 Product 输入接受路径参数。
- 手册品牌和主题可以优先使用现有 Host extension 的 provider:before 和内建 manual 工具扩展；这部分首先是 Space 接入工作，不能直接列为 SDK 必须新增的字段。
- 动态输入补充包含附件路径和 Partner 提供的上下文，不应统一升级为可信 system prompt。先核对现有文本/附件/引用业务接口能否承接；只有确实无法保留现有语义的部分才提窄的业务接缝，不预设任意 promptOverlay 参数或任意运行配置袋。
- Skill/command/review 的准备、hooks 和工具限制应由 Host 的现有产品执行入口负责，Space 不继续双重准备。

依据：SDK [统一迁移边界](C:/Works/GitProj/KodaX-AI/KodaX/docs/SDK_MIGRATION.md:9)、[FEATURE_298 设计目标](C:/Works/GitProj/KodaX-AI/KodaX/docs/features/v0.7.97.md:181)，Space [现有 Workflow 上限](../../apps/desktop/electron/kodax/workflow-policy.ts:78)。已发布 alpha.2 的公共入口实测确认普通低层 runs.start 带 inputId 会被拒绝；该路径不能替代产品输入身份。


## alpha.3 接入落点（2026-10-11）

npm `alpha` 已核对为 `0.7.97-alpha.3`。根目录、Desktop 与 lockfile 使用同一精确版本，正常 Registry 安装，SDK 开发目录没有修改。

- 复用现有可信 Main Runtime 连接的公开 Product 接口；普通输入走 `acceptInput`，显式工具走带 inputId 与 authorization 的工具入口。技能、命令 hooks 和 review 的准备由 Host 完成。Partner 保留自己的 inline 执行边界。
- Main 授权捕获 Session 的有效 Provider 与明确 fallback allowlist，以及 workflowHostPolicy 的 maxAgents/tokenBudget。并发复用 config.workflow.maxConcurrency；Workflow 目录由 Host 管理。授权在 Product RPC 前以不可变非秘密记录保存，按 Host/客户端/Session/inputId 隔离；重试、队列派生 Run 和 steer 都复用原快照。重连恢复 Session broker，不能改成单 Run broker。旧 Run 若没有可证明的 Main 快照，steer 明确拒绝，不重新计算授权。
- 队列从公开 current view 恢复，inputId 是队列身份；接收 queued 时不虚构未来 Run。SDK 的序列与 Space 本地投影 revision 分别使用，队列变化允许在相同 SDK seq 上推进本地投影。相同队列不重复推送。
- 移除 journal/replay、旧 operation envelope 和旧完整退出 API。保留仍公开的 canonical history/fork/rewind 接口及 sourceRevision。长 view 正文校验长度、revision、offset 和读取期限；同一 model toolId 的多次执行使用公开 opaque item ID 区分，不解析 ID。
- statistics 提供累计用量、物理请求与 operation 区分、retry/fallback/compaction/Actor 归属、上下文组成及逐工具 Sandbox 原始事实。IPC 仅投影已知字段。Renderer 用 Host 累计值替换旧估算，保留 partial/缺失用量；重载能恢复上下文组成。
- lifecycle 用同一 requestId 查询接受、工作清理与精确退出回执。在线的其他客户端受保护。接受退出后轮换 Main 身份并保留旧 keychain 引用用于离线查询；unknown 不当作成功。请求与确认有期限，观察超时后的迟到订阅会关闭。真实最后客户端退出的短暂 containment_active 继续查询 SDK 回执，直到 SDK 证明退出或期限耗尽。
- Space 手册通过现有只读 Host Tool `space_manual` 接入，组合安装 SDK 的手册与 Space 操作说明。发布 SDK 拒绝覆盖内建 `kodax_manual`；不用全局 Extension 把其他客户端的手册改成 Space。附件与 Partner 上下文使用产品文本/附件接口，不增加任意 system prompt 接缝。

真实发布包离线 Provider 回归已验证：稳定输入与 canonical 身份、物理请求统计、Space 手册工具、steer、after-turn 队列、Main 重建后重复输入与原授权复用、多客户端保护、身份轮换/离线恢复、最后客户端精确 Host 退出。验证使用隔离目录及本地 HTTP fixture，不依赖真实模型服务。

## 最终自动验收（2026-10-11）

- Registry 再次核对：`alpha = 0.7.97-alpha.3`，stable `latest = 0.7.96`。`npm ls` 确认根目录及 Desktop 使用同一个 Registry 安装的 alpha.3；tarball 与 lockfile integrity 相符。
- `npm test`：4,332 项，4,312 通过、20 项既有平台/条件跳过，0 失败。其中 release 92/99、Desktop 3,855/3,868、IPC schema 365/365。最后两处恢复修复另跑 40 项关联回归，全部通过；不将重复执行加进全量总数。
- 关键迁移接缝 coverage：30 项全部通过，行覆盖率 97.77%、分支覆盖率 87.04%。范围为 view 读取、历史/工具恢复、授权快照持久化和客户端退出，并包含已发布 SDK 的真实 Host 回归；不宣称全仓达到该覆盖率。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke` 通过。生产 Renderer、Main、preload 与 worker 已重新构建。
- Electron 生产启动 E2E：`renderer-boot.spec.ts` 1/1 通过；Renderer 正常挂载、preload bridge 可用、无未捕获页面错误。测试使用隔离 profile，native SQLite 已切回 Electron ABI，当前构建可启动。
- 最终 Standards 轴 0 项残留、Spec 轴 0 项残留。复核中发现的回执误配、canonical thinking/text 分项恢复、首个退出 ACK 丢失恢复等问题均补上反例并验证通过。

恢复仍遵循公开事实：thinking/text 分量只消费已证明 Run/Turn 的有序前缀，不跨工具边界；无执行 item ID 的实时工具回执仅连接唯一未完成的同 Host/Run/Turn 候选。多候选时重新读取 Host 当前 view，不猜测归属。SDK 无法观察的内部请求继续显示 partial，退出未知继续保留 unknown；这是契约边界，不补造成功或用量。

本次完成源码依赖更新、Space 接入与生产构建；没有发布新的 Space 版本或安装包。

## 扩展 E2E 验收（2026-10-11）

源码 99 个不同用例（93 项现有桌面 + 6 项真实发布 SDK）全部通过，0 失败/跳过/重试；同一真实 SDK 套件在打包目录应用通过 6/6。最后启动/九类文件预览专项 2/2 通过，打包 dependency/boot/SDK gate 全部通过。见 [E2E 范围、修复与限制](../research/kodax-0.7.97-alpha.3-space-e2e-validation.md) 和 [逐项证据](../research/kodax-0.7.97-alpha.3-space-e2e-evidence.json)。

修复了 Stop 后新输入 admission 期间的观察订阅过早退役；反例 RED→GREEN，adapter 250/250 回归通过。Windows 常规 E2E 在独立 Desktop 运行，不切换用户桌面，保留正常产品窗口行为；Job 负责结束/取消时的测试子树清理。最终 Standards/Spec 均 0 项残留。

这些结果不等于所有功能均经过真实 SDK/线上服务执行：既有 UI 套件含 Mock/注入情景，真实模型、外部账号和其他 OS 未验收；unknown/ACK 丢失/Main 重建以公开 SDK 集成回归证明，不改 SDK 私有状态制造 packaged E2E。
