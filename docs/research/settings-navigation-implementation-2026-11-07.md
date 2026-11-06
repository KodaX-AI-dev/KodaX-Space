# 设置分组直达导航实施与验收

日期：2026-11-07。需求来自用户批准的 [综合方案](settings-design-consensus-2026-11-07.md) 及对应 ASCII 示意图。本轮为 F147 源码优化，不升级 SDK、版本或配置协议，不发布安装包。

## 实施范围

- 应用、任务、能力、系统分组直接展示具体页面，关于位于导航下部；分组标题不可点击。外部 Agent 按现有能力状态显示，普通打开只读其状态，不自动预检或运行测试。
- 常规保留语言、终端、窗口、工作区和通知；外观独立。上下文压缩与 Workflow 限制同页，外部 Agent、MCP、技能各自直达。
- 排障集中健康状态、Host、配置/迁移详情和诊断导出；MCP 的迁移说明和跳转随内容一起迁移。关于包含版本、更新与许可证，旧激活入口定位授权区域。
- 首访挂载、访问后保留本次打开期间的表单；共享必要 overview 读取，迁移预览只在排障首次访问时读取。资源刷新不覆盖压缩草稿，项目切换使旧读取和资源状态失效。
- 操作错误按所属页面保存；共享读取错误单独处理。现有保存、重载、安装及实际配置所有者保持。
- 内部 canonical 页面与旧 key 兼容边界分开，自动化观察继续使用旧类别；没有新增模型请求、提示词注入或设置搜索服务。

主要源码：[设置工作面](../../apps/desktop/renderer/src/features/settings/SettingsModal.tsx)、[入口兼容](../../apps/desktop/renderer/src/features/settings/settingsNavigation.ts)、[Shell](../../apps/desktop/renderer/src/shell/Shell.tsx)、[布局](../../apps/desktop/renderer/src/workspace.css)。

## Standards

固定基点 `2e8bbd7e28b688a6fd5a9509140b828dce9fff56`。以本轮不可变补丁 `artifacts/settings-implementation/review.patch` / `review-v2.patch` 独立评审；排除了并行工作模式开发，公共文案/手册以本轮开始时快照计算差异。

首轮发现：P2 共享错误状态导致排障失败显示到无关页面；相关低风险 Duplicated Code 判断为四份重复错误横幅。已改为按操作页保存错误、独立 overview 读取错误、复用小型 SettingsError；回调稳定避免重复加载迁移预览。复核无新增实质问题。

Standards 最终未解决发现：0。

## Spec

独立对照综合方案。首轮发现：P2 操作错误未按所属请求拆分；P2 MCP 文案仍指向“上方迁移按钮”，与迁移后的内容位置不符。

前者先用真实 Electron 回归复现（迁移失败切回上下文仍显示），再修复错误归属；后者更新中英文并增加跳转，直接打开排障、展开并聚焦配置详情。MCP/技能/外部 Agent 的重复页内标题收紧为配置来源、安装位置和注册项。复核确认两项解决，未发现新配置编辑器、模型调用或其他范围扩张。

Spec 最终未解决发现：0。

## 验收证据与限制

行为测试在 [settings-navigation.spec.ts](../../tests/e2e/settings-navigation.spec.ts) 与既有设置/迁移/工作面等 E2E；旧 key 映射在 [settingsNavigation.test.ts](../../apps/desktop/renderer/src/features/settings/settingsNavigation.test.ts)。执行记录与截图在本机 `artifacts/settings-implementation/`。结果在验证结束后追加。

测试使用隔离 profile，不代表用户真实账号、沙箱安装或生产环境健康；读取状态不自动执行安装/迁移/连接测试。视觉验收必须逐张查看实际截图，不能只凭 DOM 或截图生成成功宣称视觉合格。

只读配置与文件编辑体验属于用户要求的下一步研究，见后续可编辑性笔记；本轮不借导航重排新增写配置能力。

### 实际检查

- `npm run typecheck`、`npm run lint`、`npm run build:smoke` 通过；最终 renderer 在修正窄窗标题与导航间距后重建。构建仍有既有 chunk 体积与 Browserslist 提示。
- `settingsNavigation.test.ts` 2/2；新入口兼容模块行、分支、函数覆盖均100%，不将其冒充完整UI覆盖率。
- 设置原有交互首轮15条通过；旧中文标签断言及压缩输入名称后续纠正，对应回归通过。语言切换、全部外观档、工作面草稿与返回、迁移、延迟健康回复等专项6条通过。
- External Agent管理/本地化/Workflow picker、input-required任务取消审计、更新确认、草稿保留及迁移错误隔离、布局截图6条通过；产品信息中英文2条在将检查明确定位页头后通过。最终导航3条在视觉修正后重跑3/3通过，最终8张截图已逐张重新查看。
- `npm test` 完成：4,680通过、20显式跳过、6失败；合计4,706。失败为 `runtime-host-adapter.test.ts` 的Host work-mode CAS、Partner Workflow与两条cold queue，`slash-builtin.test.ts` 的旧 `/agent-mode` 注册断言，以及并行修改中的 `AgentModeSelector.browser.test.ts` 超时。失败路径不经过本轮设置页面；未修改这些实现或降低这些断言。此工作树全量测试不能标绿。

### 实际视觉走查

隔离 Electron 的中文深/浅色1440×960、1100×520短高、640×600窄窗实际截图已逐张查看。检查了常规、MCP、上下文与限制、外观和关于；长路径换行、主要操作、导航与内容独立滚动、键盘Home/End及返回均有行为验收。首轮截图发现窄窗标题断成两行，及导航的旧Tailwind间距覆盖footer自动间距，已修正并重拍。目录：`artifacts/settings-implementation/screenshots/`。

这是本地源码与隔离环境验证，不等于发布安装包或验证用户真实账号/平台授权。完整可编辑性调研见[只读设置研究](settings-editability-review-2026-11-07.md)。
