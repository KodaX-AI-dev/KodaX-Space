# F147 — 实际字体、侧栏可读性与对话字号菜单

## 来源和结论

用户提供新的 Space、字号菜单和 ZCode 截图，明确要求比较 `C:/Works/PubProj/ZCode` 源码，并继续保留现有行距。Space 基点为 `2d9969b7`；参考仓库只读，检出基点 `aac47556`。没有修改 ZCode。

参考源码的关键事实：

- `packages/ui/src/styles.css`：`--ui-font-size` 默认 14px，`text-ui-base` 使用该值；界面采用 Tailwind 的系统 sans 字体栈。
- `packages/ui/src/TaskListItem.tsx`：两种普通任务行的标题均使用 `text-ui-base text-foreground`。`WorkspaceSidebarItem.tsx` 的项目标签则采用较弱一级的颜色。
- `DESIGN.md` 区分界面字号、正文和独立代码/终端设置，不通过修改根 `html` 字号改变布局。

Space 的普通会话行同样是 14px，却使用 `text-fg-secondary`；只核对 nominal font-size 不能证明与参考图具有相同的阅读效果。实测还发现中文字体不同：通过真实 Electron 的 `CSS.getPlatformFontsForNode` 读取字形，Space 的中文会话标题使用 **Noto Sans SC**，同一环境中复用参考系统字体栈的离屏探针使用 **Microsoft YaHei UI**。后者是字体解析探针，不冒充实际运行中的 ZCode。参考程序的个人字号设置和其他显示器/DPI 没有被读取或验收。

原包的实际截图、字号/颜色/字重/行高及平台字体证据保存在 `artifacts/f147-type-2026-10-21/before/`。普通会话和当前选中会话分别采样，避免用选中行的较亮颜色替代普通列表的证据。离屏字体探针在截图前移除，不改变保存的产品原图。

## 现有字号按钮的真实行为

沿用用户已要求的真实 Electron UI 验收接缝：打开“对话视图”、点击三个 Aa、读取可见消息段落的实际字号。原包中已有正文确实依次变为 14、15、17px；真实 SDK 正文同样能调整，因此不能把用户反馈解释成所有渲染路径都未响应。

用户截图是新对话空页：原控件只调整消息正文，不调整项目栏或空页统计。菜单缺少范围说明和可见预览，所以该页面无法展示选择结果。另外，实际回归确认选择刷新后丢失：选大字号为 17px，重新打开同一个 SDK 会话后变回 15px。失败证据是 `font-persistence-red.log` 中的 Expected 17px / Received 15px。

## 最小改动

1. 侧栏主文字改为 15px、时间改为 13px；普通会话标题使用接近主文字的颜色。保留项目 38px、会话 36px 的原行高下限、margin、分组留白和宽度逻辑。文字行高随字号自然增长，但不另行压缩行距。重命名输入继承对应行的字号。
2. 在既有 UI 字体栈中明确补充 Windows/macOS/Linux 中文 UI 字体回退；保留西文 Geist、原等宽栈和独立代码/终端设置。不增加字体文件、网络请求或依赖。
3. 菜单明确标为“对话字号”，提供实时预览、三按钮的可读名称与选中状态，并说明整个界面大小使用下方缩放。保持原小/中/大 14/15/17px 合同；同一份静态映射用于消息、按钮样本和预览。
4. 字号仍由 appStore 唯一持有，通过既有 localStorage 读写帮助函数保存；无效旧值回到中字号。没有新增设置维度或配置项。
5. 菜单在矮窗口中限制高度并可滚动，保留全部视图、字号及缩放按钮。背景项目、设置替换导航、三档视觉效果、上下文/token/宠物的实现不改。

## 验收条件

- 最终通过用户使用的 `out/win-unpacked/KodaX Space.exe` 验收，核对 ASAR 与实际构建入口一致。
- 真实点击三档，现有正文和预览的实际字号一致；空页有可见预览和作用范围说明；400px 矮窗口可键盘聚焦到缩放按钮。
- 已发布 SDK 会话的小、中、大选择分别在刷新、重新打开会话后保留。
- 对照同一密集三项目 fixture 的深色、浅色、1280px 窄窗、Agent 与 Git 变更截图，逐张检查文字、截断、换行和布局；记录实际平台字体，避免只读取容器 font-family 字符串。
- 设置/并行/菜单/侧栏回归保持，生产代码没有新增逐帧测量、动效循环或消息重解析。
- 截图不代表跨平台/DPI 性能或完整无障碍合规；已有长对话滚动问题不因本轮字号修正被宣称根治。

## 最终打包版视觉审查

2026-10-21，用户正常退出 Space 后，使用 `node scripts/pack.mjs --win --dir` 更新原 `out/win-unpacked`。最终验收指定该目录的 exe，使用独立测试桌面和 profile，没有关闭真实工作进程或写入个人会话。

同一密集列表的实际测量如下，字号不能代替下面的实图审查：

| 项目                | 原包                 | 更新后的原目录                |
| ------------------- | -------------------- | ----------------------------- |
| 项目 / 会话文字     | 14px / 14px          | 15px / 15px                   |
| 时间                | 12px                 | 13px                          |
| 普通会话深色文字    | `rgb(174, 173, 165)` | `rgba(238, 237, 233, 0.9)`    |
| 实际中文会话字形    | Noto Sans SC         | Microsoft YaHei UI            |
| 西文项目字形        | Geist Medium         | Geist Medium                  |
| 项目 / 会话行高     | 38px / 36px          | 38px / 36px                   |
| 右侧计划分组 / 正文 | 14px / 14px          | 14px / 14px（保留上一轮字号） |

`after/01-dense-dark.fonts.json` 与其他四份平台字体记录确认实际回退已生效；不是仅验证 CSS 字符串。`sidebar-comparison-native.png` 将原包、更新包与用户提供的 ZCode 截图左栏按原始像素裁切并排，不拉伸、不重绘文字。三列内容和背景本身不同，因此它是字形、大小和阅读感的辅助对照，不是像素等价测试。原始完整截图另行保留。

已逐张查看 `after/` 的 19 张产品原图：

- `01-dense-dark`、`02-dense-light`：普通/选中标题层级清楚，时间不挤压操作；放大字形后仍保留既有行距。长标题按原规则省略，底部列表继续滚动。
- `03-dense-1280`、`04-agents-changes-1280`、`05-changes-1280`：窄窗的计划和 Agent 长描述自然换行，Git 文件名清楚，侧栏可独立滚动；头部较长运行说明按原规则截断，没有压住右侧操作。
- `font-small`、`font-medium`、`font-large`：同一完整工作区下正文和预览依次变化，菜单选中状态、范围说明与缩放均可见。小/中差异仍是既有的 1px，大字号更明显；没有把三档含义改成整窗缩放。
- `01-workspace-dark`、`02-composer-focus`、`03-model-menu`、`04-settings-dark`、`05-settings-category`、`06-settings-light`、`07-workspace-light`、`07b-composer-light-focus`：检查中文、模型菜单边缘、深浅色文字对比、设置独占导航与聚焦时玻璃光效；没有发现本轮引入的裁字、重叠或第二套项目导航。
- `08-real-parallel-dark`、`09-real-parallel-settings`、`10-real-parallel-light`：本地 HTTP fixture 驱动两个项目的真实 SDK Run；设置往返和换主题后恢复工作区、草稿及活动状态。此处与前述显示事件 fixture 分开验证。

## 验证结果

- `npm test`：4,412 通过、20 条条件跳过、0 失败；`typecheck`、`lint`、`build:smoke` 通过，最终 renderer 重新构建及类型/lint 复查通过。
- 原目录打包完整性预检、`smoke:pack`、`smoke:boot` 通过；`smoke:complete-exit` 的打包版真实 SDK 接缝 6/6 通过。
- 指定原目录 exe 的四份定向 E2E 共 12/12 通过：三档字号与空页预览、400px 菜单可达、三档逐一刷新保留、密集侧栏、设置/Partner/文件搜索状态、真实双项目并行、动效质量与 reduced-motion、前后台和菜单边缘。没有通过放宽阈值、跳过失败用例或关闭功能取得通过。
- ASAR 中最终入口 JS `index-CTIg0s-J.js`、CSS `index-C_-Tgkim.css` 与构建文件逐字节一致。哈希和字节数见本机 `package-provenance.json`；更新的是产品原目录，`artifacts/` 仅保存审查截图、对照和日志。
- 全部本机证据在 `artifacts/f147-type-2026-10-21/`，包含 RED/GREEN 日志、`before/`、`after/`、包来源和冻结评审补丁。未发布、未改版本/SDK/依赖/锁文件，没有新增生产动效循环或渲染测量。

## Standards

0 项。独立评审按冻结补丁逐文件、逐 hunk 检查，未发现违反 `AGENTS.md` / `CONTRIBUTING.md` 的新增问题或可行动基线 smell。新增控件及辅助函数均短于 50 行；静态字号映射服务三个实际使用点，持久化沿用既有 store 和存储帮助函数。

## Spec

0 项。独立评审确认侧栏字号、普通标题颜色、中文回退、重命名、正文三档、范围说明、预览、可访问选中状态、持久化和矮窗滚动符合本轮范围；未发现功能删减、保护实现改动或 scope creep。初审时最终包装和运行验收尚未结束，未提前计为完成；最终运行证据见上段。

两轴分别汇总：Standards 0 项、无严重项；Spec 0 项、无严重项。
