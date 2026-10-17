# F147 — 融合工作区与设置：功能保留清单

2026-10-16。用户已批准 `space-ui-exploration/index.html#integrated` 方向进入正式产品。实施授权包含工作区、设置、全部既有功能、多项目并行、深浅/系统主题、三档视觉质量及性能。默认保留功能；任何取消、删除或收窄能力须另行对齐。本次没有功能删除提案，不改变 SDK、IPC、权限、执行策略或发行版本。

2026-10-17 用户进一步批准 Workflow 入口降级：移除左栏常驻卡片，清理仅服务该卡片的组件、投影字段与文案；保留顶部活动视图菜单中的 Workflow、流程库、历史运行、相关会话右侧的进度/暂停/恢复/停止和完成结果。多项目并行仍由项目与会话列表承载，不增加配置项。

## 逐项对应

| 既有能力 / 实现                                                                                                            | 融合后入口及处理                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Coder / Partner（SurfaceTabs）                                                                                             | 左栏材质分段切换，原隔离与可用性规则保留                                                                                           |
| 多项目树、展开持久化、拖排、归档、重命名、项目菜单、新建会话、每项目加载/刷新/更多/全部会话                                | 原 LeftSidebar / ProjectTree / ProjectSessionPicker，全数保留；仅调整密度、选中材质与行距                                          |
| Session 树、父子关系、置顶/归档/筛选/排序、重命名/删除、真实消息时间                                                       | 原 SessionTree / ContextMenu；选中和键盘焦点更清楚                                                                                 |
| 多项目并行、运行/等待/未读/错误、其他客户端 RunningPeers                                                                   | 原状态源及会话行、项目计数继续显示；设置打开时左导航仍可见                                                                         |
| 开文件夹、项目文件树、搜索/刷新/文件操作、设置底栏                                                                         | 原 FilesPanel；与导航栏共享连续边界和材质                                                                                          |
| 左栏常驻 Workflow 卡片                                                                                                     | 按 2026-10-17 用户批准移除；顶部活动视图菜单保留完整管理入口，右侧按相关会话展示运行及最近结果                                     |
| 输入草稿、图片/文件、拖放/粘贴、@路径、slash/Skills、历史、模型/effort/模式、排队/打断/停止/重试、上下文预算、通知、吉祥物 | 原 BottomBar 保持挂载与全部 handlers；只改变外层间距/玻璃/聚焦反馈                                                                 |
| 当前输出、独立历史/搜索、图片/代码/表格/工具、复制、折叠、滚动、恢复/断连/错误、提问/权限审批                              | 原 ConversationStreamV2 / RuntimeStartupStatus / AskUser / PermissionModal；连续画布不重新限制全局内容宽度                         |
| 对话 / 成果（原型 B）                                                                                                      | 工具栏快捷切换至既有 Artifact 工作区；原 TranscriptViewMenu 全部视图仍可用，不以 CSS 隐藏真实输出                                  |
| 完整审查与专注（原型 C）                                                                                                   | 原 Diff/Artifact/Workflow 全宽工作面、侧栏 default/half/max/custom、全局专注模式及返回路径全部保留                                 |
| Task Dock 的 Run/Plan/Agents/Workflow/Changes/Sources/Artifacts/Context、外部 Agent、安全/学习提示                         | 原 RightSidebar / sections / 数据源保留，分栏取代浮起的大卡片                                                                      |
| Preview、Diff、Terminal（多 tab）、Agents、MCP、Memory、Workflow、Artifact 独立窗口                                        | 原 CommandToolbar / PopoutOverlay / FloatingSurfaceHost，全部保留                                                                  |
| Partner 的上下文、资料/产物、审阅、插件库、专家、连接器、可信确认、独立详情                                                | 原 PartnerWorkspace / PartnerRightSidebar / extensions 保留业务及生命周期，只共用外壳样式                                          |
| 设置六类及分类键盘导航                                                                                                     | 完整设置工作面，保留 preferences/providers/runtime/extensions/license/diagnostics、面板 hidden 保编辑状态、初始目标与自动化 broker |
| 偏好：语言、终端 shell、Windows 关闭行为、默认工作区、自动聚焦、原生通知、Workflow host 政策                               | 原面板与持久化全部保留；增补主题及视觉三档的设置内入口，与标题栏/菜单共享原 store                                                  |
| Providers：内置/自定义、协议、模型、API key、默认值、增删改与失败恢复                                                      | 原 ProvidersPanel / ProviderCard / CustomProviderForm 保留                                                                         |
| Runtime：模式、安全重启、配置/迁移、压缩、Sandbox readiness/安装、外部 Agent、Skills、导入导出等                           | 原 RuntimePanel 全部保留                                                                                                           |
| 扩展/连接组件及专家、License激活/刷新/注销、Diagnostics导出与隐私                                                          | 原 ExtensionSettingsPanel / LicensePanel / DiagnosticsPanel 保留                                                                   |
| 设置错误恢复入口、菜单/快捷键/语义控制                                                                                     | 所有入口路由到同一个设置工作面；错误中的 Provider settings 不再创建第二套设置                                                      |
| 退出设置                                                                                                                   | 保留 Escape 和关闭按钮，新增明确返回；设置成为页面后没有遮罩背景，页面外单击不再表示关闭；嵌套确认/编辑器优先处理 Escape           |
| 应用菜单、窗口控制、诊断、Handoff、帮助、命令面板、缩放、更新、Quick Ask、安全退出、OS badge                               | 保留所有原组件及快捷键                                                                                                             |

## 材质和性能边界

- 暖石墨/暖纸白，共享语义 tokens；绿色品牌与琥珀操作色不混用状态含义。
- 中央画布连续铺满，侧栏以分隔线组织，输入区和局部静态 chrome 保留玻璃。长文、代码与流式正文不采样背景。
- 极简：实色、无模糊、无装饰动效；均衡：静态环境光与玻璃；全特效：更通透材质、景深与缓慢环境光。
- 延续流式输出、历史恢复、滚动/拖动、失焦/后台的效果降载；尊重系统 reduced-motion，不引入 WebGL、动画库或常驻 JS 动画循环。
- 选中材质、分段底板、短入场、聚焦光晕以 transform/opacity 为主，不能位移命中目标。

## 验证接缝

复用既有 renderer / Electron E2E 的用户操作边界：设置开关与定向打开、六分类/编辑保持、主题/质量持久化、草稿保持、多项目选择及并行状态、结果/审查/专注返回、窄窗可达性。保留现有业务回归，并以实际产品截图检查深浅主题和三档材质。测试不依赖原型示例数据或模拟计时按钮。
