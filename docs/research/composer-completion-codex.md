# Codex 如何实现命令、技能与文件补全，以及整体删除？

结论摘要：此本地版本的 Codex **TUI** 把已确认 slash 命令和 skill/plugin mention 建模为带范围的原子文本元素，显示、移动和删除共享元素边界；普通文件补全仍插入可编辑路径字符串，不能把前两者的整体删除结论推广到文件。证据：[slash 元素同步](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:492)、[mention 插入](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2873)、[文件插入](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2852)。

## 调研范围

- 日期：2026-11-06。
- 本地 checkout：`C:/Works/PubProj/codex`，`git rev-parse HEAD` 输出 `2c502d8b3d382dd609179164f31396d95deee55c`。
- 范围为 `codex-rs/tui` 的真实实现和已有测试；仓库 README 明确定位 Codex CLI，并另行链接 desktop app。本笔记不代表 Codex 桌面输入框的实现。[README](C:/Works/PubProj/codex/README.md:1)
- 未启动 TUI，未执行测试；下面区分代码事实与建议，不把静态源码阅读写成实机验收。

## 1. 候选如何清楚区分

| 对象 | 实现事实 | 源码依据 |
| --- | --- | --- |
| Slash command | 行中包含命令名、模糊匹配高亮与 description；并非只有补全字符串。 | [command_popup.rs](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/command_popup.rs:228) |
| Skill / plugin mention | 数据分开保存 `display_name`、`description`、`insert_text`、`path`、`category_tag`；候选行显示类型、名称、描述、命中高亮和当前选择标记。 | [MentionItem](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/skill_popup.rs:22)、[候选行](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/skill_popup.rs:156) |
| 文件 | 路径过长时保留能区分文件的文件名、压缩父路径；压缩后的高亮重新按显示字符串匹配，而选中值仍保留原路径。 | [文件行渲染](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/file_search_popup.rs:118)、[选中路径](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/file_search_popup.rs:99)、[测试](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/file_search_popup.rs:265) |

默认 mention v2 模式下，`@` 列出插件、文件系统项和技能，`$` 列出单个技能与 app；关闭该特性时入口不同。这是该 checkout 的模式边界，不能抽象成所有版本都只用 `@file` / `$skill`。[入口与模式说明](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:34)

## 2. 选中之后，不是统一一种字符串处理

### Slash command：确认完整名称后才成为元素

只有第一行开头、名称已知、后面存在空白、光标不在名称中间的命令才形成 `0..element_end` 的原子范围；未知名称和仍在编辑的前缀保持普通文本。同步函数删除失效范围并添加正确范围。[判定](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:129)、[同步](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:492)

命令补全生成 `/name `；并非所有候选的接受行为都一致，例如 `/skills` 的 Tab 接受有立即 dispatch 的特例。因此不能把命令候选一律等同于“插入标签”。[补全与 dispatch 特例](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/slash_input.rs:532)

### Skill / plugin mention：原子显示值和真实目标分开

选中 mention 后替换当前 token，调用 `insert_element(insert_text)`；用返回的 element ID 关联 `{ sigil, mention, path }`。因此显示名称和真正技能/插件路径可以分开，语义身份不必依赖可见字符串重新猜测。[插入与 binding](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2873)

序列化 mention bindings 时只遍历仍存在的元素，并核对显示值与绑定一致。因此删除元素以后，不会仅因为侧表曾保留过路径就把它提交出去。[有效 binding 快照](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2988)

### 普通文件：路径文本，不是原子元素

普通文件选择调用 `replace_range(token_range, &inserted)`；路径有空白且不含双引号时加双引号，随后把光标放到分隔空白之后。此路径不调用 `insert_element`，源码注释中的“保留 atomic”说的是保留其他已有元素，不能读成新文件也是 atomic。[文件插入完整实现](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2852)

图片路径是特例：能够成功读取图片尺寸时转为附件；失败时回落到路径文本。[图片分支](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2569)

## 3. 整体删除来自编辑模型，不是背景样式

- 元素保有稳定 ID 与文本范围；插入元素后加入排序的 range 表。已有文本也可以标记为元素，不必替换成特殊占位字符。[element ID 与范围](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:1807)、[元素插入](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea/editing.rs:64)
- Backspace 使用 `prev_atomic_boundary`，Delete 使用 `next_atomic_boundary`，再执行范围替换；Left/Right 同样采用原子边界。[删除](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:1219)、[光标移动](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:1482)
- 插入位置不能落在元素内部；跨越元素的替换范围扩张到完整元素边界，避免只删半个标签。[插入限制](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:1901)、[范围扩张](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:1919)
- 鼠标选择也读取同一元素范围，不是仅对键盘 Backspace 做特殊判断。[鼠标范围处理](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea/mouse.rs:158)
- 元素默认以 Cyan 前景色绘制；这是 TUI 文本着色，不是 DOM chip/pill 组件。[元素绘制](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:2309)
- 已有测试覆盖元素左边界 Delete、泰语元素 Backspace 原子性、按词删除元素、命令空格后元素化；测试存在不代表本轮已运行通过。[Delete 测试](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:2599)、[Backspace 测试](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:2584)、[按词删除测试](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:3314)、[命令测试](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:10237)

补全后光标位于一个分隔空白之后，所以“元素整体删除”不等于“补全结束后第一次 Backspace 必然连空白和元素一起删”；还要区分光标是否已经紧邻元素边界。[分隔符契约](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:62)

## 4. 撤销、历史与提交

- Vim undo/redo 保存完整 composer draft，而不仅是 text；撤销恢复完整快照。这是 Vim 模式能力，不能据此推断普通输入模式有桌面编辑器式 Ctrl+Z。[完整草稿撤销](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/vim_history.rs:1)、[恢复操作](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer/vim_history.rs:76)
- 会话内历史保留 text elements 与附件；跨会话持久历史主要是文本，task links 有专门恢复能力，不能宣称所有对象都无损持久化。[历史边界](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:81)
- 提交包含 `UserInput::Text { text, text_elements }`；技能按有效绑定路径匹配 catalog，另行添加 `UserInput::Skill { name, path }`，并去重。视觉标签与模型输入的结构化语义因此是两层。[文本提交](C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/input_submission.rs:315)、[技能提交](C:/Works/PubProj/codex/codex-rs/tui/src/chatwidget/input_submission.rs:339)

## 对 KodaX Space 的启发（建议，不是已实现事实）

1. 候选数据至少分开类型、显示名、说明、真实目标；文件显示缩短，提交仍用完整目标。依据是 Codex `MentionItem` 和文件选择器的分离方式，而非照搬它的终端布局。[MentionItem](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/skill_popup.rs:22)、[文件选中值](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/file_search_popup.rs:99)
2. 若目标是所有 command/skill/file 标签都整体删除，需要统一编辑对象边界，把删除、光标、选区、撤销都纳入同一模型。Codex 提供了 slash/mention 的范例，但没有提供普通文件整体删除的现成范例。[元素编辑](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/textarea.rs:1919)、[文件文本插入](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2852)
3. 选中一个 skill 后应保存真实路径/ID，不能仅靠再次解析显示名称决定执行哪个技能；删除后提交层只能看到仍存在的对象。Codex 的 element ID binding + live-element snapshot 值得复用这个原则。[binding](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2898)、[snapshot](C:/Works/PubProj/codex/codex-rs/tui/src/bottom_pane/chat_composer.rs:2988)

## 未证实

- Codex 桌面应用是否采用 contenteditable、Lexical、ProseMirror 或其他编辑器，本次 TUI 源码不提供证据。
- 未实机验证终端、输入法及复制粘贴的整体体验；不能把源码中的边界处理宣称为所有平台体验无缺陷。

## 未解问题

- Space 是否需要普通文件路径也变成不可拆分标签，还是保留手工修改路径的能力？这是产品选择；Codex TUI 选择普通路径文本。
- Space 的第一轮 Backspace 是否先删除分隔空白、直接移除标签，或先选中后再删？“完整删除”需明确此处预期。
- Space 对历史回填、跨输入框复制粘贴、撤销重做要求达到哪种语义保真程度？Codex 的本地与持久历史能力并不完全一致。
