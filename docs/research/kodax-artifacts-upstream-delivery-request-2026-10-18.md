# 给 KodaX：完成已有 Artifact SDK 的正式交付与共享 Host 接入闭环

结论：**这个方向合理，所需工作是交付已有实现并验证真实消费者，不是新增一套 Artifact 平台。** 当前源码已经有独立包、九操作、Node/共享 Host 两条执行路径及本地打包测试；但公开 npm 缺少可安装包，根包发布链也没有交付它。Space 可以继续使用现有产物和视觉路径，但无法把这套独立 SDK 当作已安装能力。[源码包定义](../../../KodaX/packages/artifacts/package.json)、[现有九操作](../../../KodaX/packages/artifacts/src/sdk.ts)、[本地 pack 消费者测试](../../../KodaX/tests/packed-artifacts.test.mjs)、[当前 Registry 原始结果](kodax-artifacts-publication-recheck-2026-10-18.json)

## 可直接转发的正文

请核查并完成 **现有 `@kodax-ai/artifacts` 的公开发行、共享 Host 注册和消费者验收**。这是一项既有 FEATURE_301 的交付闭环，不要求重做 Artifact 体系或新增通用执行接口。

**问题事实：** 截至 2026-10-18 19:55（Asia/Shanghai），官方 Registry 对 `@kodax-ai/artifacts` 及 `0.7.97-alpha.7` 精确版本仍返回 404；`@kodax-ai/kodax@0.7.97-alpha.7` 正常存在。Space 安装的根包没有 `./artifacts` export，也不依赖独立包。源码的 `packages/artifacts` 虽已实现并同步版本，`scripts/release.mjs` 仍只 pack 根目录、publish 根包 tarball；现有独立包测试安装的是本地 `npm pack` 产物。因此“源码补齐/本地包验证完成”和“下游能从 Registry 正式安装”尚未闭环。[Registry 证据](kodax-artifacts-publication-recheck-2026-10-18.json)、[独立 manifest](../../../KodaX/packages/artifacts/package.json)、[根包 exports/files](../../../KodaX/package.json)、[release.mjs:494](../../../KodaX/scripts/release.mjs#L494)、[552](../../../KodaX/scripts/release.mjs#L552)、[packed-artifacts:15](../../../KodaX/tests/packed-artifacts.test.mjs#L15)

**请交付以下最小集合：**

1. **正式可安装的公开版本。** 发布已有独立包，给出精确版本、dist-tag、tarball integrity，以及实测兼容的 KodaX SDK/Host 版本组合。如果已有其他正式公开入口，提供准确包名/版本/导出即可，避免再造同功能包。不要仅提供相邻源码、workspace link 或本地 tarball 作为最终交付。
2. **包内容完整。** 按当前 manifest 交付 root、`/client`、`/kodax`、`/runtime` 的 JS/d.ts、`runtime-entry` worker、`docx.browser.js`、skills、许可证和可解析运行时依赖；用干净消费者安装验证。不要只让 monorepo 内部 build/import 通过。[现有 manifest](../../../KodaX/packages/artifacts/package.json)、[worker 调用](../../../KodaX/packages/artifacts/src/kodax.ts#L64)、[DOCX asset 读取](../../../KodaX/packages/artifacts/src/document-render.ts#L41)、[browser asset 构建](../../../KodaX/packages/artifacts/scripts/build-browser.mjs)
3. **共享 Host 的明确启用方式。** 复用现有可信 extension 生命周期注册 `registerArtifactTools` 一次，复用已连接 Session 的 `createKodaXArtifactPort`。明确新 Host、附着已有 Host、缺包、未注册工具及未准备浏览器各自的行为；安装包成功不能冒充 Host 已具备工具。保持现有权限、sandbox、取消和结算；不另起私有 Session/renderer，不静默更改已有 Host 的用户配置。[既有注册和连接示例](../../../KodaX/docs/ARTIFACT_SDK.md#existing-shared-kodax-host)、[Host adapter](../../../KodaX/packages/artifacts/src/kodax.ts)、[Client port](../../../KodaX/packages/artifacts/src/client.ts)
4. **发布后的真实消费者验收。** 从官方 Registry 精确安装两包；先用固定 PNG 完成 `open → render → readEvidence`，再通过同一共享 Host 的实际工具 Run 和 `sessions.readItem` 读回 PNG，核对项身份、SHA256、宽高、长度与分块偏移。覆盖取消/断连不重放、陈旧来源或损坏图片拒绝、缺包/未注册/未准备状态。固定 PNG 基线不需要模型或 Chromium，浏览器格式另做显式准备后的验收。[现有 Node pack 测试基线](../../../KodaX/tests/packed-artifacts.test.mjs#L12)、[现有 Host 图片读取](../../../KodaX/packages/artifacts/src/client.ts#L28)、[格式与准备边界](../../../KodaX/docs/test-guides/FEATURE_301_v0.7.97_TEST_GUIDE.md#enable-the-optional-adapter)
5. **已宣称范围与状态准确。** 九操作接口按实际可用性报告；PPTX 限定创作/编辑、PDF/图片等取证按现有范围验收；DOCX 的 Word/WPS 保真继续标明 unverified。修正已记录的工具 schema/decoder 不一致（如 capture locator 混入另一 kind 字段）及必要的嵌套参数说明，不借此扩展新格式或重写全部工具。文档明确区分 source-implemented、local-packed-tested、registry-published、Host-enabled、consumer-verified；`ready` 表示证据准备就绪，视觉质量仍由 Agent 对真实图像判断。[现有支持及限制](../../../KodaX/docs/ARTIFACT_SDK.md#operations-and-actual-support)、[已记录 schema 缺口](../../../KodaX/docs/ARTIFACT_SDK.md#tool-schema-gaps)

**范围约束：** 不新增 Product Client Artifact 域、通用 RPC、常驻 renderer、verifier daemon 或全局 evidence store；不复制 Space 的版本库、产物存储、审批/导出策略；不把整个主 CLI 强制装入渲染依赖；不为此要求所有视觉任务统一改走该 SDK。先交付已有能力的可安装版本与可信 Host 接入，Space 再做消费者适配。[既定 ADR](../../../KodaX/docs/ADR.md#unified-artifact-execution-and-evidence-boundary)

**完成标准：** KodaX 提供可匿名解析的 Registry 精确版本、真实包内容/入口检查结果、已验证的 SDK/Host 兼容组合、公开的 Host 注册步骤，以及从正式安装树运行的 Node/共享 Host 消费者证据。源码测试或本地 tarball 成功单独记录，不能代替这一步。

## 为什么这个需求有实际价值

### 已有 Space 能力解决了什么，还有什么具体缺口

- Space 的 `create_office_artifact` 已能生成并归档 DOCX/PDF/XLSX/PPTX，产物版本、Session 归属、导出和管理员策略应继续由 Space 管理；本需求不要求以独立 SDK 替换这些产品职责。[office tool:183](../../apps/desktop/electron/artifact/office-artifact-tool.ts#L183)、[写入 store:328](../../apps/desktop/electron/artifact/office-artifact-tool.ts#L328)、[Artifact IPC](../../apps/desktop/electron/ipc/artifact.ts)
- 当前 PPTX Viewer 的结构是 `{index, lines}`，界面将文本逐行显示，并非最终 PPTX 页面布局的像素渲染；它不能提供标题遮挡、图表几何、对象重叠等视觉问题所需的真实页面证据。独立 SDK 的 render/readEvidence 处理的是这一具体缺口。[preview DTO:13](../../apps/desktop/renderer/src/features/preview/pptxPreviewProtocol.ts#L13)、[文本式 Viewer:43](../../apps/desktop/renderer/src/features/preview/PptxViewer.tsx#L43)、[现有 SDK 渲染](../../../KodaX/packages/artifacts/src/render.ts)
- SDK 已有 source/dependency/raster hash 和定位信息检查，且共享 Host port 按实际 Run/tool item 关联 PNG bytes，可让 Agent 检查当前成品，避免拿旧截图或客户端随意读取路径当证据。[证据合同](../../../KodaX/docs/ARTIFACT_SDK.md#evidence-errors-and-lifecycle)、[Client port:20](../../../KodaX/packages/artifacts/src/client.ts#L20)

据此判断，**复用已有文件渲染和证据读取实现是合理的；再造一套 Space 专用通用渲染后端反而增加重复职责。** 独立可选发行保留了核心启动不加载渲染器的边界；已有单一 `ArtifactExecutionPort` 和 Host admitted execution 足以承接当前需求，没有证据支持再加更通用的抽象。[既定 ADR](../../../KodaX/docs/ADR.md#unified-artifact-execution-and-evidence-boundary)、[当前 runtime 动态加载后端](../../../KodaX/packages/artifacts/src/runtime.ts)、[当前 SDK dispatcher](../../../KodaX/packages/artifacts/src/sdk.ts)

### 对“必要”的准确限制

独立包缺失不代表所有视觉审查都不能运行。已有获准工具可以产生/读取 PNG 时，Agent 仍能评审；Space 先前真实 GLM 的视觉用例也有通过记录。因此本需求的目标是把既有统一多格式 Artifact 后端交付给正式消费者，而非把这个包设为所有视觉任务的前置条件，或用“安装成功”保证模型一定自动检查。[既有 Space 视觉验收记录](../releases/kodax-0.7.97-alpha.5-integration.md)、[SDK 明确的模型闭环限制](../../../KodaX/docs/ARTIFACT_SDK.md#integration-gaps-recorded-on-2026-10-13)

## 404 的机制与不能推断的原因

确定的发布机制是：根 release 脚本针对单一根 tarball，独立 workspace 没有被该路径递归发布。npm 官方也把发布当前目录和显式发布 workspace 列为不同操作。这足以说明“根 SDK 已发布”为何不能保证独立包可安装。[release.mjs:2–9](../../../KodaX/scripts/release.mjs#L2)、[494–495](../../../KodaX/scripts/release.mjs#L494)、[552–561](../../../KodaX/scripts/release.mjs#L552)、[npm publish 官方示例](https://docs.npmjs.com/cli/v11/commands/npm-publish/#examples)

源码/文档确实完成过补充：包定义、九操作、Node/Host adapters、本地 packed consumer 测试都存在；`ARTIFACT_SDK.md` 的 shipped 字样容易被理解为可公开安装，而验收指南又明确要求独立 install/pack。当前应以 Registry、实际 exports 与消费者结果作为交付状态依据，并校正文档措辞。[manifest](../../../KodaX/packages/artifacts/package.json)、[SDK API](../../../KodaX/packages/artifacts/src/sdk.ts)、[本地 pack 测试](../../../KodaX/tests/packed-artifacts.test.mjs)、[shipped 描述](../../../KodaX/docs/ARTIFACT_SDK.md#artifact-sdk)、[独立安装说明](../../../KodaX/docs/test-guides/FEATURE_301_v0.7.97_TEST_GUIDE.md#enable-the-optional-adapter)

**未证实：** 本轮没有维护者独立包的发布操作日志，不能断言是忘记执行、认证/权限失败、私有发布、撤包或其他人为原因；当前 404 也不能证明历史上从未发布。不应把要求写成未经证实的“修复 npm 认证故障”。[本轮匿名 Registry 读取](kodax-artifacts-publication-recheck-2026-10-18.json)

## 未解问题

1. KodaX 是否有尚未告知下游的正式替代发行入口？如有，提供准确安装与 Host 启用步骤即可，不要求重复发布。
2. 独立包正式版本及兼容的根 SDK/Host 组合是什么？不强制两包同号，也不预设根 alpha.7 必须升级。
3. 当前 release 流程是否打算纳入这个既有可选包，以及由哪一步验证 Registry 发布与已运行 Host 的启用？需上游根据实际发布策略回答。

发布机制的完整逐行证据见 [独立 Artifact 发布路径审计](kodax-artifacts-publication-path-audit-2026-10-18.md)。本文件只准备可转发的问题和需求，没有执行发布、安装、配置更改或对外发送。
