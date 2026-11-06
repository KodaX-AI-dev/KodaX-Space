# Space 哪些设置需要手改文件，是缺少界面还是 SDK 不支持？

结论摘要：不是所有“只能看”的内容都缺少设置能力；版本、健康状态、来源与 Host 事实应当只读。最明确的体验缺口是 **MCP 声明编辑**：Space 目前没有 CRUD 界面/IPC，但所安装的 SDK 已公开校验、增改、删除与带版本校验的配置写入能力。优先补这个闭环，比把所有技术字段改成输入框更合理。文件仍可作为共享持久化格式，用户不应因此被迫手工维护 JSON。以下将源码事实与设计判断分别说明。

日期：2026-11-07。Space 导航重组完成后的工作区源码快照；SDK 为实际安装的 `@kodax-ai/kodax@0.7.97-beta.2`（[package.json:3](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:3)）。只读静态调研，没有修改产品代码、真实配置、安装资源或运行模型请求。SDK 声明检查了公开 package exports；未把内部类型 chunk 的存在单独当作公共 API 证据。

## 1. 现有设置不是全部只读

表中“判断”是产品建议；“当前事实”由引用代码支持。

| 对象 | 当前事实与实际动作 | 判断 |
| --- | --- | --- |
| 常规偏好 | 默认工作区、语言、终端、关窗有明确写 IPC；不是必须手改文件。见 [settings.ts:115](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:115)。 | 保留直接编辑，并清楚说明何时作用于新终端/新会话。 |
| 外观、聚焦与通知 | 使用既有 store setter；主题/视觉质量、自动聚焦、通知均可直接修改。见 [AppearanceSettings.tsx:24](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/settings/AppearanceSettings.tsx:24)、[appStore.ts:9519](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/store/appStore.ts:9519)、[appStore.ts:9609](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/store/appStore.ts:9609)。 | 属于普通应用设置，保持即时反馈。 |
| 服务商与模型 | 已有写密钥、删除密钥、默认项、自定义 Provider 增改等；密钥不会通过 list/push 返回 renderer。见 [provider.ts:13](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/provider.ts:13)、[写凭据:234](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/provider.ts:234)、[默认项:286](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/provider.ts:286)、[自定义:311](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/provider.ts:311)。 | 不是只读缺口；凭据来源、保存与当前会话生效关系仍需要准确文案。 |
| 上下文压缩 | 界面有保存动作，Main 调 `updateKodaxCompactionConfig`，写共享配置后尝试 Runtime reload。失败时能返回“文件保存了，但运行态未应用”。见 [user-config.ts:311](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/user-config.ts:311)、[settings.ts:72](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:72)、[settings.ts:152](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:152)。 | 不应继续描述成“去文件修改才生效”；应区分保存成功与应用成功。 |
| Workflow 限制 | 页面通过 `workflow.policy.set` 写 Space 的 `workflow-policy.json`；运行时从 policy 构造 maxAgents/maxConcurrency/tokenBudget。见 [workflow.ts:121](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/workflow.ts:121)、[workflow-policy.ts:68](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/workflow-policy.ts:68)、[存储:95](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/workflow-policy.ts:95)。 | 是可编辑的 Space 策略，不是账户总 token 用量设置。 |
| MCP 配置 | 设置页显示路径、来源、数量和重载；IPC 有 discover/status/start/stop/tools/logs/reload，无服务器声明 CRUD。见 [mcp.ts:91](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/mcp.ts:91)。另有 MCP 工作面能查看服务器、工具和执行显式生命周期操作，且能安装 MCPB 包。见 [McpPanel.tsx:1](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/popouts/McpPanel.tsx:1)、[MCPB 安装:155](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/shell/popouts/McpPanel.tsx:155)。 | **普通服务器声明的新增/编辑/删除，是明确缺口**。不能据此说整个 MCP 功能只读。 |
| 技能 | 已有用户/项目目录或 ZIP 安装、缓存失效及发现接口；检查到的 Skill IPC 没有卸载/启停。见 [skill.ts:81](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/skill.ts:81)、[安装目标:30](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/skill/install.ts:30)。 | 第二优先级可做已安装列表、来源与实际可用性，复用 discover；卸载/禁用需先明确文件所有权和 SDK 语义，不把它当现成动作。 |
| 外部 Agent | 有注册增改、移除、就绪/预检、任务操作 IPC。见 [agent.ts:174](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/agent.ts:174)、[增改/移除:190](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/agent.ts:190)。 | 已具备真实管理动作，不应为了“可编辑”再造一个全局 Agent 模式控制台。 |
| 扩展与连接组件 | 扩展已有安装、启停、卸载；组件已有安装/校验修复。见 [ExtensionSettingsPanel.tsx:43](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ExtensionSettingsPanel.tsx:43)、[ConnectorComponentsPanel.tsx:13](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/renderer/src/features/extensions/ConnectorComponentsPanel.tsx:13)。 | 安装不等于账号连接，更不等于所有会话授权；不要合并动作状态。 |
| 沙箱、Host、健康与诊断 | 沙箱提供 status/refresh/setup；Host 统一 daemon，明确拒绝 embedded；健康、版本、revision 是观测事实。见 [sandbox.ts:12](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/sandbox.ts:12)、[settings.ts:101](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:101)。 | 这些只读项合理，应标成状态/技术详情；不应伪装成可保存设置。 |

## 2. MCP 缺少编辑界面，并非缺少 SDK 写能力

### 已证实的公共能力

1. 包公开 `./runtime`、`./repl`、`./mcp` 等入口，而不是要求调用内部路径。见 [package exports:22](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:22)。
2. `RuntimeMcpService` 有 `validateServer`、`upsertServer`、`deleteServer`、`reloadServers`；该类型由公共 `sdk-runtime.d.ts` 导出。见 [公开导出:7](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-runtime.d.ts:7)、[服务声明:916](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/types-chunks/sdk-runtime-DNS-cBUS.d.ts:916)。
3. 公共 repl 声明和导出 `listMcpServers(configHome?)`、`getMcpServerConfig`、`upsertMcpServer(name, config, configHome?)`、`removeMcpServer`、`validateMcpServerConfig`。首次 mutation 会将 legacy 条目完整带入 split document，防止新增权威文件时静默停用其他服务器。见 [声明及说明:2443](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-repl.d.ts:2443)、[导出:2646](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-repl.d.ts:2646)。
4. 公共 repl 也导出 `readMcpIntegration`、`parseMcpIntegrationDocument`、`writeIntegrationDocument`；snapshot 有 revision，写入可指定 `expectedRevision`，`null` 表示目标必须仍然不存在。见 [公共导出:22](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-repl.d.ts:22)、[snapshot:13](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/types-chunks/integration-config.d-BNowXE8k.d.ts:13)、[写入声明:72](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/types-chunks/integration-config.d-BNowXE8k.d.ts:72)。
5. 实际分发实现先验证，进入配置写锁，检查 revision，写临时文件、fsync，再 rename/link 发布；CRUD 先读取完整 snapshot、保留其他服务器，并在已有 user 文件时传 revision。见 [writer 实现:3](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/chunks/chunk-XHDDJT4K.js:3)、[CRUD 实现:345](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/chunks/chunk-PIJGKPSX.js:345)。这里引用压缩发行代码的实际行号，不把内部符号当公共入口。

**推论**：Space 可以基于已有 SDK 公共合同补 Main IPC 与 UI，不需要为了常规 MCP 编辑先要求 SDK 从零增加配置写入能力。需要选定 Host 管理路径与文件级 scope 路径，并以明确验收验证；公共函数存在不等于 Space 当前已打通。

### 还不能省略的四个边界

- **长时间打开的草稿冲突**：`upsertMcpServer` 会在调用时重新读 revision，保障本次 read/write 之间的竞争；它没有“表单打开时 revision”的参数。CLI 在用户编辑草稿期间改同一条目，单纯 upsert 仍可能覆盖新值。设计上应携带草稿基线 revision、检测冲突并让用户刷新/比较，或使用已有 `writeIntegrationDocument(expectedRevision)`，同时保留未编辑条目。已有 split 文件的 CRUD 使用 revision，而 legacy/default 首次写入没有携带缺失目标的 expectedRevision；编辑器也需要明确首写的冲突策略，可考虑先完成显式迁移再取得基线，或用公共 writer 的 expectedRevision:null 保护目标仍不存在。依据上述公开签名和实际 CRUD 实现，这是推论，不是已实现保证。
- **项目写入不等于项目运行态支持**：repl 的 `configHome` 能指向项目 `.kodax`，Space 现有项目 reader 就按这个路径读。见 [kodax-user-config-loader.ts:56](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/mcp/kodax-user-config-loader.ts:56)。但 RuntimeMcpService 没有 projectRoot 参数；Space 的 Runtime discover 分支也没有使用传入 projectRoot，并将条目投影为 global；Runtime reload 调共享 Host `mcp.reloadServers()`。见 [mcp.ts:92](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/mcp.ts:92)、[mcp.ts:154](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/mcp.ts:154)、[runtime-host-adapter.ts:8367](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/runtime-host-adapter.ts:8367)。因此应先验证真实项目执行语义，不能仅凭“文件写成功”承诺项目服务器已在当前任务生效。
- **秘密字段不能丢失**：MCP config 包含 env、headers、OAuth 等，而当前 metadata projection 只给 envCount，不返回值。见 [McpServerConfig:16](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/types-chunks/config.d-CJy1WENT.d.ts:16)、[config-reader.ts:186](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/mcp/config-reader.ts:186)。新增编辑器需要明确空白表示保留还是删除；不能拿现有删减的展示对象整条覆盖。设计上可沿用凭据的掩码/显式替换思路，避免无故把所有已存秘密返到界面。
- **持久化与激活分开反馈**：Space 已有配置写后 reload 失败的表达模式，MCP 也有明确 reload。见 [settings.ts:72](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:72)、[mcp.ts:154](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/mcp.ts:154)。建议显示“已保存/已应用/应用失败及重试”，不把按钮成功统一解释成服务器健康，也不在浏览设置时自动连接或跑测试。

## 3. 沙箱旧投影不是可以直接复活的编辑器

Space schema 保留了 bounded `sandbox.envPass`、`totalEnvPass`、`editable`；注释明确禁止部分投影覆盖超出 IPC 限额的 CLI 配置。见 [settings schema:105](C:/Works/GitProj/KodaX-AI/KodaX-Space/packages/space-ipc-schema/src/channels/settings.ts:105)、[projection:839](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/user-config.ts:839)。

但当前 SDK 的实际 `loadConfig` 明确解构丢弃 `sandbox`（`let { sandbox: ..., ...rest } = ...`），公共 `saveConfig` 声明和 Runtime patch 键表也没有 sandbox。见 [分发实现:4](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/chunks/chunk-XHDDJT4K.js:4)、[saveConfig 声明:789](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/types-chunks/utils.d-BG2iYEqT.d.ts:789)、[Runtime patch 键表:479](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/types-chunks/sdk-runtime-DNS-cBUS.d.ts:479)。公共 sandbox 包给出 per-run filesystem/network/env 输入与 doctor/setup 类型，不是这个旧 envPass 表单的全局持久化合同。见 [sdk-sandbox.d.ts:12](C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/dist/sdk-sandbox.d.ts:12)。

**设计判断**：沙箱就绪状态、显式安装与诊断继续保留；不能根据遗留 `editable` 字段新增一个看似可保存、实际不参与执行的全局策略页。应先核对当前 SDK 支持的真实策略所有者；必要时清理过时投影，而非复活退役配置。

同理，Host 的 Embedded 选项已经被 Main 拒绝；保留相关枚举不代表它应该重新变成可切换设置。见 [settings.ts:101](C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/ipc/settings.ts:101)。

## 4. 竞品中值得借鉴的是编辑闭环

- ZCode 的 MCP 表单支持普通表单/JSON 两种输入、解析错误和明确保存；保存目标来自表单自己的 scope，源码特别避免读取旧 currentProjectPath；新增、修改、删除有对应持久化动作。见 [McpServerForm.tsx:146](C:/Works/PubProj/ZCode/packages/ui/src/settings/McpServerForm.tsx:146)、[McpSettingsSection.tsx:1370](C:/Works/PubProj/ZCode/packages/ui/src/settings/McpSettingsSection.tsx:1370)、[删除:1402](C:/Works/PubProj/ZCode/packages/ui/src/settings/McpSettingsSection.tsx:1402)。**设计判断**：Space 优先借鉴“明确编辑目标、校验、保存与失败保留”，不必第一版复制所有 scope 或 JSON 编辑功能。
- DeepSeek 的模型编辑把凭据操作与 namespace 设置写入分开，写入带 expectedRevision，并区分 written/conflict/refused。见 [operations.ts:15](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/operations.ts:15)、[写入合同:49](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/operations.ts:49)、[实际调用:86](C:/Works/PubProj/deepseek-harness/packages/client/ui-settings-models/src/client/operations.ts:86)。**设计判断**：这比“让用户保存整个 JSON 文件”更适合桌面表单；可复用 Space 已有凭据隔离及 conflict/reload 提示，不需要引入竞品插件框架。

以上仅源码研究，没有运行竞品，也不宣称它们在所有平台/错误场景下均已通过视觉或保存验收。

## 5. 建议讨论的最小下一步（未实施）

1. **先做 MCP 编辑闭环**：列表显示真实来源与状态；支持新增/修改/移除及 SDK 校验；显式保存后重载并区分结果；保留秘密字段、未知字段及其他条目；携带编辑基线 revision。第一片可先落用户级共享配置，项目级入口待实际执行作用域验证后加入。这是基于现有公共能力及 Space 缺口的优先级判断。
2. **技能先补列表与来源，而非再做文件参数页**：复用安装与 discover，让用户知道安装到了哪里、是否可用。删除/禁用须先明确 builtin、用户手放文件、Space 安装包的所有权与恢复语义；本轮没有证据可把这三类统一为一个现成安全卸载动作。
3. **把只读技术事实明确标成状态/详情**：Host、版本、来源、revision、健康和 doctor 结果不用输入框。对于暂未支持 UI 写入的真实配置，明确“当前界面只读、配置来源、如何应用”，避免看起来能设却只能看。

文件作为 CLI/SDK/Space 共享持久化层可以保留；UI 通过同一公共写入链维护它。此次建议不是建立另一套 Space 配置真相，也不需要模型替用户改 JSON。普通本地编辑/校验/状态展示无需模型请求；连接测试、安装和运行预检继续显式触发。

## 未证实

- 未在隔离环境执行 SDK MCP 写入/重载实验；对锁/原子替换及 CRUD 语义的判断来自已安装发行实现和公共类型，不能代替后续集成测试。
- 尚未证明共享 Host 的项目 MCP 配置在多项目并行会话中如何激活；现有路径概览和文件级合并 reader 不足以证明当前 Runtime 已按项目隔离。
- 未证实 SDK 提供技能完整包生命周期（启停、卸载、来源所有权）公共合同；本轮仅确认 Space 安装/discover 与缺少相应 IPC。
- 没有用户使用频率或任务查找实验；“MCP 第一优先”是明确功能缺口与已有写入能力之间的工程/体验判断。

## 未解问题

- 首版 MCP 是否先只开放用户级共享配置，以便先完成一条真实可用的编辑→保存→应用闭环？
- MCP 已存 env/headers 应采用哪些保留/替换交互，才能既不泄露值也不无意清空？
- 项目级 MCP 的生效合同应由共享 Host 服务补齐，还是已有 SDK 能力需要正确接线？需针对当前 SDK 做独立的多项目执行验收后定案。

这些是下一轮产品与实现范围讨论输入，本笔记不代表已经获准新增编辑器。
