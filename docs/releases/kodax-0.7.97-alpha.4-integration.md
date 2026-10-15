# KodaX 0.7.97-alpha.4 / Space 接入

日期：2026-10-13。范围：Space 现有 SDK 接入升级，Space 版本保持 `0.1.47-alpha.1`；不发布新的安装器。

## 需求与已发布事实

用户要求检查新发布 alpha 的改动并完成 Space 侧匹配。以 npm 发布包的 CHANGELOG、类型声明、实际导出和公共接口运行结果为准，邻接 SDK 工作树只作源码参照，没有修改或链接该工作树。

- 根目录、Desktop 和 npm lockfile 精确升级到 `@kodax-ai/kodax@0.7.97-alpha.4`，使用同一份 Registry 安装。
- Tarball：[npm 发布字节](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.4.tgz)。SHA-1：`fb9fba535310bc31027e1dcb68d67a43b8ac08ca`。SRI：`sha512-an+SIt29EI34pEWnrsE7KXunC4RdYyP5skJ2F+Hm7aCXce7SsGJbpobjocKAMrovt/V2vkW0LNk3sxhK6aYJ6Q==`。
- 退役 Sidecar Verifier 执行、实时回调、配置和 `/verifier-log`。主 Agent 在同一 Run 内按实际工具和渲染证据检查结果，SDK 内置 `visual-review` 提供检查方法。Stall Sidecar、Auto 权限审查、Stop 和 Sandbox 继续采用原契约。
- `ClientStartupProgress` 是本地纯数据观察，不是 Host 持久事件。ensure 报告 checking/starting/upgrading/waiting/connecting/ready；被动 connect 只连接，不启动或替换 Host。回调不被等待，ready 不证明 Session 订阅或 UI 已就绪。
- Provider capability 快照进入 managed task admission，打包 builtin 路径发现修复，Goal 工具在 Host 内更新原子 lineage。这些变化由新 SDK 承接，Space 保留既有 Provider、Goal 和公开历史读取接口。
- CHANGELOG 的独立可选 `@kodax-ai/artifacts` 尚未发布到 npm：2026-10-13 对该包执行 `npm view --registry=https://registry.npmjs.org/` 返回 E404。它也不在 kodax tarball 的依赖/导出中。本轮无法通过正式依赖接入新 PPT 工具，不能声称已提供 artifact_prepare/render 或新的 Office 验收能力。

## Space 适配要求与实现

1. 移除旧 Verifier 的实时 producer、命令注册、参数补全、翻译与 `effective_config.verifier` 投影。Run 失败按公开 terminal/failure 处理，不再由旧 terminal-block 通知改写为成功。旧 verifier 历史继续读取与显示；历史内容不能成为当前执行或视觉通过的证明。
2. 复用 `runtime.connectionChanged` 与 profile 快照传递严格验证的 `startupProgress`，不新增 Host RPC。界面以中文/英文解释实际阶段与等待原因，不遮挡操作。SDK ready 显示准备会话，只有 Space 安装好自身订阅及 profile 后才进入 ready。
3. 每次初始化捕获独立 attempt，忽略前一次尝试、ready 后或 close 后的迟到回调。重复阶段不重复推送；失败和关闭清除进度。重连沿用 passive connect，保护在线客户端。
4. 通过本地技能 registry 和真实 Host catalog 验证 `visual-review` 可发现与加载；不复制 SDK 技能，不新增第二个质量 Agent 或完成证书。
5. 保留 Main 授权快照、inputId、队列、canonical 历史、逐请求统计、Host Workflow 上限、Sandbox 和可恢复退出语义。测试不得把回调 ready、断连或未知退出当成功。

## 验证

回归使用现有公共 RuntimeHostAdapter、技能 registry、IPC schema、Renderer 和已发布 SDK 接缝。命令与最终结果见同名 [机器证据](kodax-0.7.97-alpha.4-integration-evidence.json)。

- `npm test`：4,337 项，4,317 通过、20 项既有条件跳过、0 失败（release 93/100、Desktop 3,858/3,871、IPC schema 366/366）。包括真实发布 SDK 的输入、Main 授权、队列、统计、手册、原身份恢复与精确退出回归。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke` 与 E2E fixture strict typecheck 通过。启动提示组件覆盖率：行 94.44%、分支 87.50%、函数 100%；此数据仅描述该组件，不作为全仓覆盖率声明。
- Windows 真实 SDK 源码 E2E 6/6 通过，0 跳过/重试，包括技能和命令目录、工具、统计、重载/Fork、队列/Stop、Rewind、最后客户端退出与在线 peer 保护。使用隔离 Desktop/profile 和本地确定性 HTTP Provider。
- `npm run build:pack -- --dir` 通过，更新 `out/win-unpacked` 目录应用。打包 dependency/native/Sandbox/Worker smoke 全部通过，ASAR 携带精确 alpha.4 与全部 9 个 SDK builtin Markdown 文件。打包 boot 保留 122 条历史 child 记录；Renderer 5,836ms 就绪，Runtime 在测试人为延迟后于 28,531ms 就绪。打包版同一真实 SDK E2E 6/6 通过、0 跳过/重试。

## Standards

固定点 `9f65d864` 的本次改动经独立规范轴评审，无残留可行动问题。

## Spec

独立需求轴核对已发布 SDK 契约与上述适配要求，无残留可行动问题。两轴各 0 项。

手工检查：启动/升级/重连期间可以操作界面；显示当前连接阶段，进入可用状态后提示消失；失败后提示不残留；命令选择器和 `/help` 不再列出 `/verifier-log`，`/stall-log` 仍可用；旧会话的 Sidecar 历史仍标记为历史；`visual-review` 可以从技能选择器加载。

验证不代表模型输出质量、macOS/Linux UI、真实外部账号或未发布 Artifact 包已验收。

## 后续真实模型视觉行为验收（2026-10-13）

用户要求使用 Space 自己已配置的 Provider/模型验证自动检查。通过内置 `zai-coding / glm-5.3-flash` 跑真实 Renderer 会话，AMA/SA 两个普通图表修改任务均自动加载 `visual-review`、读取当前 PNG 并在交付前给出视觉检查反馈，自动触发 E2E 2/2 通过；移除 HTML 源文件的像素识别对照 1/1 通过。所有请求均为指定 Provider/模型，无 fallback。先前自行选择的外部 Qwen 测试已标为历史非验收，不能代表当前配置。见 [真实模型 E2E 结果与限制](../research/kodax-0.7.97-alpha.4-visual-review-live-e2e.md)。前文技能发现/打包及离线契约通过的结论保持其原始范围。
