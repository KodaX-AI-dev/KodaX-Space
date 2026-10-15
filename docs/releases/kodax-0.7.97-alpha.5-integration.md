# KodaX 0.7.97-alpha.5 / Space 接入

日期：2026-10-14。用户要求仔细了解已发布 alpha.5、安装升级并完成 Space 匹配。Space 版本保持 `0.1.47-alpha.1`。本轮接续 alpha.4 的未提交改动，未改动邻接 SDK 仓库，未链接源码依赖。

## 发布字节与改动核对

以 Registry tarball 的 CHANGELOG、公共类型、导出及运行结果为准。相邻 SDK 工作树 `a3e8d754..bd4479d5` 只作 alpha.4 到 alpha.5 的源码参照；`27d08788` 是 Artifact 统一端口实现，`19c76914` 是忙碌 preflight 与文档修复。

- root/Desktop 精确锁定 `@kodax-ai/kodax@0.7.97-alpha.5`，npm 安装为同一物理包，无依赖补丁。
- [Registry tarball](https://registry.npmjs.org/@kodax-ai/kodax/-/kodax-0.7.97-alpha.5.tgz)：SHA-1 `d60e0ad9e00b094a09e5b1b4535ab285db3dd776`；SRI `sha512-z4Is5eZA24P5RxzCDgIoi6mzqfr99Zd7/tP5bPjsZD4zXSC0offQ/cG9Jn6QoaSKlXTHFZCTJPnxWEFmVd5e0g==`。初次查询 E404 后再次检查成功，属于发布传播；最终依赖以可下载的正式 Registry 字节安装。
- core 修复实时工具结果的图片附件：Session view 保留工具返回的图片引用。`Client.sessions.readItem` / `Runtime.sessions.readViewItem` 新增 `part: 'attachment'`、`attachmentIndex`、`attachmentOffset`、`expectedImageSha256`；返回 PNG base64、SHA-256、尺寸与分页字节偏移。只读取已有的图片附件，单图上限 10 MiB、分块上限 512 KiB；不把字符偏移混作图片字节偏移。
- daemon preflight 在已知 mutation 忙碌时，在完整状态扫描前返回现有 `conflict`，附实际 method/count；扫描中发生 mutation 时也重新检查。仍不可停止在途工作，无新 RPC/能力版本可用来绕开忙碌保护。
- 已准入 fixed-argv 跨 bundle 权限修复由 SDK 承接，Space 继续使用既有 permission/Sandbox/Host Tool 入口。
- `visual-review` 仍是同一 Run 内的证据审查方法。证据读取成功、渲染成功、Run completed 都不单独证明产物视觉合格。

## Space 匹配范围

1. 更新两处依赖及 lockfile，保留当前 Main 授权、Provider/model、SDK-owned 执行、Skill、队列、历史、退出与 Runtime 启动进度边界。
2. `session.executionFacts` 的 IPC 请求 limit 从 512 修正为 SDK 的 500；500 接收、501/512 拒绝。输出兼容边界保持原状。
3. 用真实发布 SDK 的 RuntimeHostAdapter 显式 `read` 工具回归实时 PNG 附件、字节、尺寸与错误哈希拒绝；alpha.4 先失败，安装 alpha.5 后通过。
4. 使用 SDK 实际 busy mutation conflict 文本回归 Main：管理检查暂时冲突不破坏健康连接、terminal 与 live Run 投影，退出仍遵循现有 stop/lifecycle fence。
5. 真实模型 E2E 继续从 Space 已配置的 built-in Provider/catalog 选模型；另通过公开 Product Client 读取 Host 实际 PNG 附件，与最终文件的 SHA-256、960×540 尺寸和模型的 `read` toolId 对齐。当前 fixture 图片小于单块上限，此验证不代表大图分页完整验收。Renderer 不直接读取 Host 文件系统或导入新 Node renderer。
6. 更新当前手册、使用指南、能力 ledger 和迁移入口。保留 alpha.4 的 release/live-model 验收记录，不改写历史结果。

## 独立 Artifact 包的接入边界

alpha.5 CHANGELOG 的大部分新格式能力属于独立可选 `@kodax-ai/artifacts`。截至本轮官方 Registry 检查，该包仍 E404，core tarball 不含此依赖/导出。不能通过 core 升级声称已接入全部新格式，也不以 sibling 本地 link/vendor 代替已发布依赖。

源码的单一 `ArtifactExecutionPort` 有九个操作：`capabilities/prepare/create/open/edit/export/render/capture/readEvidence`。安装可用后，应按 `/kodax` 的可信 Host extension 注册一次，沿用现有权限、Sandbox、managed process 和取消；客户端 `/client` adapter 复用原 Host 的 Tool Run 和附件读取。普通启动不加载 optional renderer，也不隐式下载浏览器；显式 prepare 才可准备已固定依赖。

| 源码后端          | SDK 声明的证据范围                              | 当前 Space 状态                              |
| ----------------- | ----------------------------------------------- | -------------------------------------------- |
| PPTX              | 创建、有限编辑、当前文件渲染                    | 原有 Space Office 工具继续可用；新端口未安装 |
| PDF               | native 96 DPI、保留混合页面尺寸                 | 新端口未安装                                 |
| PNG/JPEG/WebP/SVG | 精确 PNG / 转换为 PNG 的图像证据                | core PNG 附件读取已验证；新格式后端未安装    |
| DOCX              | candidate 分页，Word/WPS native fidelity 未确认 | 不声明完成 Office 保真验收                   |
| HTML/SMIL         | 当前已加载 viewport / 指定时间采样              | 不声明完整网页或动画覆盖                     |

源码仍记录模型 schema 与严格 decoder 的 locator/source/raster/color 缺口，以及完整“修复→复审→交付”未通过全部自然任务测试。Space 不加临时宽松 decoder 或新别名掩盖这些上游边界。

## 验证记录

机器证据与最终结果记录于 [integration evidence](kodax-0.7.97-alpha.5-integration-evidence.json)。验证项目：TDD 红绿、完整 npm 回归、类型/lint/build、真实 SDK 源码/打包 E2E、现有 GLM 配置的视觉 E2E。测试中通过不视为 macOS/Linux 或全部 Artifact 格式已验收。

- `npm test`：4,338 项，4,318 通过、20 项既有条件跳过、0 失败。release 93/100、Desktop 3,858/3,871、IPC schema 367/367。
- `npm run typecheck`、`npm run lint`、`npm run build:smoke` 与 E2E fixture strict typecheck 通过。
- TDD：alpha.4 真实 Runtime PNG 回归因附件未保留失败；旧统计 schema 因仍接收 501/512 失败；alpha.5 与 500 边界修正后同一组合 5/5 通过。完整 Desktop 回归也覆盖更新后的 busy mutation conflict。
- 源码 Windows 真实 SDK 桌面 E2E 6/6 通过，0 跳过/失败/重试，包括工具、统计、重载/Fork、队列/Stop、Rewind、最后客户端退出和在线 peer 保护。
- 真实模型视觉 E2E 3/3 通过（307.6 秒），使用现有 `zai-coding / glm-5.3-flash`：AMA/SA 普通修改任务均自行加载 `visual-review`、渲染后读取当前 PNG、交付检查说明；每个 Host PNG 的哈希、尺寸及 toolId 都匹配最终文件和实际模型 read。所有模型请求均为指定 Provider/model、无 fallback。
- PNG-only 对照删去 HTML 源文件，图片显示 13/26/39、JSON 是 42/57/68；模型准确返回六个数值和 `matches:false`，最终 PNG 哈希未改变。此对照证明该案例读取了图片中不同于源数据的实际内容，不能代替所有模型/格式的审查质量验收。
- 主 Agent 查看 AMA/SA 最终 PNG：960×540、Quarterly Results 标题、三季度标签与数据正确，柱高按数据同比例变化，未见裁切或溢出。仅覆盖本次完整静态图表。
- `npm run build:pack -- --dir` 通过，更新 `out/win-unpacked`。脚本内置 dependency/native/Sandbox/Worker smoke 全部通过；ASAR 和 filesystem 资源使用精确 alpha.5，携带全部 9 个 SDK builtin Markdown。打包启动保留 122 条历史 child 记录：Renderer 6,039ms 就绪，Runtime 在测试人为延迟后 28,746ms 就绪。脚本内置打包版真实 SDK 桌面 E2E 6/6 通过、0 跳过/失败/重试，未重复运行同一套已通过 smoke。

复跑真实模型：设置 `SPACE_LIVE_VISUAL_REVIEW_E2E=1` 后执行 `npm run e2e:run -- tests/e2e/sdk-visual-review-live.spec.ts`。此入口使用 Space 当前配置并验证 built-in catalog；按真实模型调用计费。默认不启用付费测试。源码/打包契约 E2E 用本地确定性 HTTP Provider，不能单独证明自动视觉行为。

## Standards

本轮 alpha.5 增量相对保留的 alpha.4 工作区快照做独立规范轴评审，0 项。新增及受影响函数均少于 50 行，附件缺失、读取错误和哈希不符会失败，观察与连接均被释放。规范轴未运行付费模型调用。

## Spec

独立需求轴核对本文件 Space 匹配范围与用户已配置 Provider/model 要求，0 项。公开 PNG 读取、事实分页边界和 busy conflict 保持原授权/会话契约；独立包未发布的边界已明确。两轴各 0 项；测试结果另由机器证据记录。
