# 为什么命令 Tab 补全后仍被列表拦住，怎样让参数补全有明确终点？

> 后续实施：本方案已在当前工作分支落地，执行验证见[实施验收](ui-interaction-fixes-validation-2026-11-09.md)。以下保留诊断与讨论当时的范围和证据。

2026-11-09。结论：用户报告的交互已在真实 BottomBar、ComposerEditor 和 SlashCommandPopover 上复现。接受 `/help` 后，动态参数补全立即重新打开并默认选中第一个帮助主题，Enter 接受主题而未提交；主题完成后仍重新补全，重复 Enter 可继续追加同一主题。建议用“接受当前候选后是否有明确下一层”决定续开，普通终止接受关闭菜单，可选帮助主题由用户主动输入前缀再触发。本文只诊断和提出方案，未修改业务代码。

## 1. 范围与复现证据

KodaX 源码基线为 `ffeb9ed7`。工作树没有 node_modules，本次复用主检出 `C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules` 中的 esbuild 和 Playwright。临时诊断脚本位于系统临时目录，未加入业务测试；其入口挂载真实 BottomBar、ComposerEditor、SlashCommandPopover、appStore 与 I18nProvider。仅把 IPC 替换为内存 fixture：提供真实内置名称 `help`、`agent-mode`、`compact` 及空技能列表，不连接用户会话、模型或外部服务。样式/图片和 Vite glob 采用构建替身，不影响本次按键与文本断言。

实际执行命令：

```powershell
node C:/Users/ADMIN/AppData/Local/Temp/kodax-slash-ui-probe.cjs
node C:/Users/ADMIN/AppData/Local/Temp/kodax-slash-ui-probe.cjs --assert-fixed
node C:/Users/ADMIN/AppData/Local/Temp/kodax-slash-ui-controls.cjs
```

第二条命令断言“Tab 接受可选参数的 `/help` 后菜单应关闭”，当前稳定 RED，约 1.2 秒退出：

```text
AssertionError: Tab accepting optional /help must close completion so Enter can submit it
1 !== 0
```

无 `--assert-fixed` 的诊断轨迹如下；退出成功仅表示采集完成，不表示交互已通过：

| 输入/动作 | 编辑器真实文本 | listbox 数量 | IPC 观察 |
| --- | --- | --- | --- |
| `/hel` 后 Tab | `/help ` | 1 | 拉取命令与技能候选 |
| 再按空格 | `/help  ` | 1 | 无执行 |
| 再按 Enter | `/help agent-mode ` | 1 | 未调用 slash.exec |
| 再按 Enter | `/help agent-mode agent-mode ` | 1 | 未调用 slash.exec |
| 另输入 `/help zzz` 后 Enter | `/help zzz` | 1，空候选态 | 未调用 slash.exec |
| 接着 Esc、Enter | 空 | 0 | 调用 slash.exec，name=help、args=[zzz] |

最终使用 HTTPS fixture origin，所有步骤 `pageerror=[]`。操作 ID 为随机值，不作为断言依据。原生 Electron Shell、真实命令发现列表、不同输入法和用户截图中的完整环境尚未启动；本次已经覆盖真实输入组件的序列化、键盘拦截和弹窗重新挂载路径。

追加了两个正向对照，并保留原始输出：对照脚本另加入真实无参内置命令 history；`/compact` 是自由文本参数不提供候选的对照，不能把它误称为无参命令。

```json
{"step":"No-freeform-candidate /comp Tab","text":"/compact ","listboxes":0,"errors":[]}
{"step":"No-argument /hist Tab","text":"/history ","listboxes":0,"errors":[]}
{"step":"Explicit /help topic prefix","text":"/help ag","listboxes":1,"suggestions":"Slash commands and skillsagent-modeUse AMA adaptive multi-agent modeargTab / Enter to insert · ↑↓ to navigate · Esc","errors":[]}
{"step":"Accept explicit help topic","text":"/help agent-mode ","listboxes":1,"errors":[]}
```

这说明普通无参和无候选自由文本命令已能在接受后关闭；`/help ag` 的合法主题筛选也可工作。应修复的是接受时机、参数位置和结束条件，不应删除全部帮助主题补全。[history 无参 handler](../../apps/desktop/electron/slash/builtin.ts#L2215) · [help 参数](../../apps/desktop/electron/slash/builtin.ts#L2232)

另外运行 Node 22 的原生 TS stripping 直接调用真实 `slashInput.ts`：`shouldOpenSlashCompletion` 对 `/help`、`/help `、`/help  `、`/help agent-mode ` 均返回 true；`/compact `、`/mode auto ` 返回 false，`/extensions sdk ` 返回 true。说明并非所有命令都无法结束。[判定实现](../../apps/desktop/renderer/src/shell/slashInput.ts#L212)

## 2. `/help <命令>` 本身的语义需要先澄清

本地内置 `/help` 明确声明 `argsHint: '[command]'`。无参数列出命令，有参数读取 `ctx.args[0]` 并按命令名或别名显示该主题的帮助。因此 `/help agent-mode` 在当前发现包含 agent-mode 时是合法帮助查询；它与执行 `/agent-mode` 是不同动作。用户举出的 `/help agent` 是否是合法主题取决于实际命令发现结果，本次 fixture 没有捏造名为 agent 的内置命令。[builtin.ts:2229](../../apps/desktop/electron/slash/builtin.ts#L2229)

问题在于：用户只接受了 `/help`，界面自动续开可选主题列表并让默认候选接管 Enter，导致无参数 `/help` 难以直接提交。即使支持主题参数，也没有理由反复追加多个主题，因为当前 handler 只读取第一个参数。[help handler](../../apps/desktop/electron/slash/builtin.ts#L2236)

## 3. 从真实失败信号检验三个假设

| 排序假设与可证伪预测 | 本次结果 | 证据 |
| --- | --- | --- |
| 动态参数判定不限制当前参数位置；若属实，帮助主题完成并带空格后仍开列表 | 已证实：`/help agent-mode ` 继续开，第二次 Enter 追加 agent-mode | [dynamic opener](../../apps/desktop/renderer/src/shell/slashInput.ts#L166) · 上述实际轨迹 |
| 顶层接受没有保留“本次候选已完成”的意图；若属实，原子命令插入后会从序列化文本重新触发参数列表 | 已证实：onSlashPick 清除 dismissed，插 token+空格；activeSlash 从 prompt 再算，随即进入 slashArgMode | [BottomBar 接受](../../apps/desktop/renderer/src/shell/BottomBar.tsx#L2386) · [模式判定](../../apps/desktop/renderer/src/shell/BottomBar.tsx#L1195) · [token 插入](../../apps/desktop/renderer/src/shell/useComposerEditor.ts#L134) |
| 没有候选时仍拦截 Enter；若属实，未知帮助主题无法沿普通提交路径验证 | 已证实：`/help zzz` Enter 不调用 slash.exec，Esc 后 Enter 才调用 | [空候选分支](../../apps/desktop/renderer/src/shell/SlashCommandPopover.tsx#L713) · 上述实际轨迹 |

这些假设不是三个彼此排斥的原因，而是同一失败链中的不同环节。

## 4. 根因链

1. `getActiveSlashCompletion` 从光标前找最近的 command-like slash，再将其后含空格的整段作为 query。检测读取的是序列化 prompt，并没有通过原子 token 身份知道“这个命令名已经接受”。[slashInput.ts:88](../../apps/desktop/renderer/src/shell/slashInput.ts#L88) · [序列化 token 值](../../apps/desktop/renderer/src/shell/composerEditorProjection.ts#L14)
2. `onSlashPick` 对普通命令构造 `/name `，调用 `setDismissedSlash(null)`，通过 editor.insertToken 插入命令与尾空格。后续 render 的 `/help ` 满足动态补全命令白名单与任意参数正则。[BottomBar.ts:2394](../../apps/desktop/renderer/src/shell/BottomBar.tsx#L2394) · [动态命令表](../../apps/desktop/renderer/src/shell/slashInput.ts#L35)
3. `/help ` 被 Popover 识别为 slashArgMode，`commandHelpSuggestions` 将命令名称和别名作为帮助主题参数；每次 query 变化把 selectedIdx 重置为 0，因此自动高亮第一项。[slashArgMode](../../apps/desktop/renderer/src/shell/SlashCommandPopover.tsx#L604) · [帮助参数](../../apps/desktop/renderer/src/shell/SlashCommandPopover.tsx#L347) · [重置高亮](../../apps/desktop/renderer/src/shell/SlashCommandPopover.tsx#L670)
4. Tab 与 Enter 共用候选接受路径，父级先调用这个键盘处理器，consumed 后不走普通提交。空格不是该处理器的关闭动作；输入后的完整 query 又使动态 opener 返回 true。[按键接受](../../apps/desktop/renderer/src/shell/SlashCommandPopover.tsx#L742) · [父级优先级](../../apps/desktop/renderer/src/shell/BottomBar.tsx#L2776)
5. 动态 opener 没有“第一个帮助主题已完成”的停止条件。候选构造也把尾空格当作新参数起点，于是重新列出全部主题；`applySlashArgCompletion` 在 query 尾部追加选中值。[opener](../../apps/desktop/renderer/src/shell/slashInput.ts#L166) · [参数拼接](../../apps/desktop/renderer/src/shell/SlashCommandPopover.tsx#L119)

补全开启策略与候选生成分别维护命令别名、静态选项和动态逻辑，已有重复事实；修复时应让两者对当前参数位置有一致判断。暂不需要为所有命令引入通用语法引擎，也不宜直接解析 argsHint 的人类提示文字当可执行语法。[别名表一](../../apps/desktop/renderer/src/shell/slashInput.ts#L12) · [别名表二](../../apps/desktop/renderer/src/shell/SlashCommandPopover.tsx#L229)

## 5. 其他实现怎样划清“接受”和“继续补全”

以下是源码/官方文档证据，不是本次对竞品的实机操作。

| 产品与范围 | 可证实行为 | 对 KodaX 的启发 |
| --- | --- | --- |
| ZCode 当前共享 UI，commit a9fe401eede6e6e5e01be9048679c206fe6f02d9 | Enter/Tab 均接受候选；插入原子 mention 和空格后清空 activeToken/activeTrigger；触发正则不跨空白。部分 App 层命令选择即执行，不插入 token | 明确结束当前词元的补全；不能直接照搬其“部分命令选中即执行”作为所有 Space 命令规则。[接受与关闭](C:/Works/PubProj/ZCode/packages/ui/src/SlashCommandPlugin.tsx:249) · [按键](C:/Works/PubProj/ZCode/packages/ui/src/SlashCommandPlugin.tsx:365) · [触发正则](C:/Works/PubProj/ZCode/packages/ui/src/lib/promptInputTriggers.ts:38) |
| deepseek-harness 当前 GUI，commit fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159 | 区分 pick 与 drill，普通接受记下 dismissal 并关闭；只有明确 drill 走下一层。菜单关闭时按键放行，Tab/Enter普通接受结果为 pick-highlighted | “本次选择完成”应能独立于文本前缀存在；续开必须有明确的下一层行为。[键盘仲裁](C:/Works/PubProj/deepseek-harness/packages/client/ui-input-trigger/src/client/controller.ts:266) · [settle](C:/Works/PubProj/deepseek-harness/packages/client/ui-input-trigger/src/client/controller.ts:575) |
| deepseek-harness 编辑器 | detectText 使用 U+FFFC 表示已确认 chip，clipboardText 另用于持久化和提交 | 补全检测不必一直重新解释已接受对象的发送文本；这是较完整编辑器方案，本次最小修复未必需要照搬。[projection.ts:1](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/projection.ts:1) |
| 官方 Codex TUI 本地源码，commit 2c502d8b3d382dd609179164f31396d95deee55c | Tab 常规补全命令，部分命令有立即 dispatch 特例；Enter 可执行所选命令。命令名过滤函数在光标越过命令名进入空格/参数后返回 None | 输入模式必须在词元边界结束；不能宣称所有产品 Enter 都只是插入。本证据只覆盖 TUI。[Tab](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:283) · [Enter](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:376) · [命令边界](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:583) |
| Claude Code 官方 CLI 文档 | Autocomplete 默认 Tab接受、Esc关闭。特别是 fullscreen 的 mid-prompt `/com` 列表初始无高亮，Enter发送原输入；Tab插入首项，或箭头选择后Enter接受 | 默认展示可选建议不必自动取得 Enter 所有权。该段只描述句中补全，不证明起始命令、子命令和 Desktop 行为完全相同。[按键契约](https://code.claude.com/docs/en/keybindings#autocomplete-actions) · [mid-prompt](https://code.claude.com/docs/en/interactive-mode#complete-a-command-mid-prompt) |

ZCode 根与 UI AGENTS、deepseek-harness 根/packages/client AGENTS、Codex bottom_pane AGENTS 已读取；本次未修改上述仓库。ZCode 按根规则运行 freshness，main 与 origin/main ahead 0 / behind 0。本次没有运行其测试。

## 6. 推荐的状态与按键规则

以下为拟议交互规则，并非全部已由现有命令元数据结构化提供。建议先实现实际出现的命令类别，以小表格/既有注册信息表达具体规则。

| 当前阶段 | Tab 接受后 | 空格 | Enter |
| --- | --- | --- | --- |
| 正在编辑顶层命令名，如 `/hel` | 插入 `/help`；可选参数不自动续开；焦点留在编辑器 | 已完整命令进入参数输入区，不再持续匹配顶层名字 | 当前菜单有显式候选选择时接受；已经接受的命令进入普通提交 |
| 无参数命令或自由文本参数命令，如 `/compact` | 完成名称后关闭；参数提示可保留为非抢键文本 | 输入普通文本 | 普通提交/校验；不拼另一条顶层命令 |
| 可选帮助主题，如 `/help` | 完成顶层名称后关闭 | 保持普通输入，不用重复空格唤回菜单 | 直接执行无参数帮助；用户开始输入 `/help mo` 时再显示主题候选 |
| 确有枚举或子层，如 `/mode a`、`/extensions sdk` | 接受后仅在合法下一层仍存在时续开；如 sdk 后可补 load | 完成末级值后结束该位置补全 | 只能接受当前合法层候选；参数满足后由普通提交处理 |
| 已完整的单值动态参数，如帮助主题/一个 model | 当前值完成后关闭 | 进入后续普通输入；确有下个参数才按其规则触发 | 不再把该参数候选追加第二次 |
| 技能名已接受 | 保留技能身份并关闭；不列出顶层 slash 候选当技能参数 | 自由输入技能请求 | 按技能原有发送路径提交，不自动执行命令目录首项 |
| 菜单无匹配项 | 不替换用户文本；可留空态反馈 | 正常输入 | 将合法完整命令交给普通提交/参数校验，不能无声吞键 |
| IME composition 或 Shift+Enter | 不中断组合输入 | 不抢占 | Shift+Enter换行；组合输入确认不误提交 |

对于“可以继续补全”的两种方式可采用渐进做法：合法固定子层可自动显示并清楚标明所属命令；可选参数先提供非抢键提示，待用户输入非空前缀或主动请求候选后再进入选择状态。这样 `/help` 可以直接执行，`/help mo` 仍能便利地查 model/mode。

## 7. 最小修复边界与验证

建议最小范围为现有 `BottomBar.onSlashPick` 的接受结果、`slashInput` 的当前参数位置判定、Popover 键盘仲裁，保留现有原子 command/skill token 与发送路由。终止接受、继续下一层和仅提示参数应有明确语义；不要只在 `/help` 文案或 Esc 分支加特殊处理。

后续实现前应确认的公共验证边界是“真实 Composer 中键入/接受/提交”，它能捕获原子 token 重新触发和 Enter 所有权；单独测 `shouldOpenSlashCompletion` 抓不到父组件重算、Lexical 序列化与键盘拦截的整条链。当前临时 harness 已能复现该边界，但未作为永久测试加入，业务源码没有改动。

必要回归：

1. `/hel`→Tab→Enter：执行一次无参 help，不自动插入主题。
2. `/help ` 后额外空格不复活主题选择；`/help mo` 仍可主动补主题；主题接受后再次 Enter 提交而不重复追加。
3. 无参数、自由文本、单值枚举、嵌套固定选项、动态 model/session 值分别完成后终止；合法后续参数仍可输入。
4. 无匹配项和候选加载失败时，不无声吞掉合法提交；候选加载中是否暂缓接受要有可见状态。
5. Command、skill、文件候选切换，别名、光标中间编辑、撤销/重做、IME、Shift+Enter 与 Esc 都保住现有语义。
6. 带尾部已有参数的补全只替换当前词元，保留后续文本；不把 `/agent-mode` 当 `/help` 的自动后缀。

## 未证实与未解问题

- 用户运行环境中 `/agent` 的确切注册来源及其 help-topic 资格未核对；本次实测用了可确认的 agent-mode。
- 竞品 Desktop 对每种子命令、可选参数、空结果、加载中的全套策略未实机验证；Claude 的证据是 CLI 文档，Codex 的证据是 TUI 源码。
- 顶层列表仍打开且用户未曾移动高亮时，Enter 应接受默认项还是优先发送原文，是需要明确的产品规则。本次推荐先终止已接受命令的列表，再单独评估是否采用“无默认高亮”的更广泛调整，避免顺便改变全部补全习惯。
- 当前临时 UI fixture 只提供三条命令，足以证明问题链，但完整命令/技能注册与跨项目异步加载还需正式回归。
- 尚未应用修复、未新增永久测试、未执行应用全套测试，不宣称问题已修复。
