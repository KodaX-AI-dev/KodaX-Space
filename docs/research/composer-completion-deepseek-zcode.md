# DeepSeek Harness 与 ZCode 如何显示和编辑输入补全？

结论摘要：两者都使用 Lexical 区分显示文本与引用身份；ZCode 的 command/skill/file 统一为原子 token，最接近“清晰显示、完整删除”的目标。DeepSeek 则刻意区分原子 command/file 与仍可逐字编辑的 skill 文本，不能把所有装饰样式都当作原子标签。依据见下文源码引用。

调研日期：2026-11-06。仅静态读取本地源码与测试，未启动应用、未执行其测试；“有测试”不等于本次运行通过。

源码基线（`git rev-parse HEAD`）：

- `C:/Works/PubProj/deepseek-harness`：`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。
- `C:/Works/PubProj/ZCode`：`a9fe401eede6e6e5e01be9048679c206fe6f02d9`。
- 本次检查的编辑器相关源码目录 `git status --short` 无输出。范围是 DeepSeek Web composer 与 ZCode 桌面/Web 共享 UI，不包含它们 CLI 的输入实现。

## DeepSeek Harness

### 候选与选后显示

- 候选面板按来源分组，支持本地化标题、命令别名、说明、图标、面包屑；查询更新时保留已有候选，没有候选时才显示 skeleton。鼠标选择使用 `mousedown` 防止编辑器丢焦点，并提供 listbox/option 与 `aria-activedescendant`。[MenuView.tsx](C:/Works/PubProj/deepseek-harness/packages/client/ui-input-trigger/src/client/MenuView.tsx:1)
- 文件候选展示文件/文件夹图标，并在适用时附父目录；目录有两种动作：普通选择把目录作为原子引用，Tab/箭头按钮向下浏览并保持面板打开。[fileCandidate](C:/Works/PubProj/deepseek-harness/packages/client/ui-reference/src/client/index.ts:235)、[onPick](C:/Works/PubProj/deepseek-harness/packages/client/ui-reference/src/client/index.ts:132)
- 文件/会话选后生成 `ReferenceChipNode extends DecoratorNode`，节点保存 `source/ref/label/appearance/clipboardText`，DOM 为 `contenteditable=false`。显示名与真实引用明确分离。[chip-node.tsx](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/chip-node.tsx:17)、[createDOM](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/chip-node.tsx:119)
- 引用外观是图标加单行名称，最大宽度 240px、溢出省略；失效引用有删除线与错误色。文件引用支持打开资源。[ReferenceChip.tsx](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/ReferenceChip.tsx:30)、[ReferenceChip.module.css](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/ReferenceChip.module.css:3)、[openReference](C:/Works/PubProj/deepseek-harness/packages/client/ui-reference/src/client/index.ts:165)
- Command 使用独立 `CommandChipNode`，承载命令 claim，显示 `/goal` 这样的完整 token；只有文档首块首节点保留命令身份，移位后降为文字，避免正文中的命令外观继续拥有执行语义。[command-chip-node.tsx](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/command-chip-node.tsx:20)、[leading seat transform](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/command-chip-node.tsx:133)
- **Skill 是重要例外**：`/` 面板按名称排序并展示描述，但选中返回普通 `/${name} ` 文本；词库扫描用 `TextRefNode` 添加引用样式，仍保留普通文字编辑语义，不是 `ReferenceChipNode`。模型输入也保留 literal，skill 的识别在 host 边界发生。[skill source](C:/Works/PubProj/deepseek-harness/packages/client/ui-skill/src/client/index.ts:168)、[skill onPick](C:/Works/PubProj/deepseek-harness/packages/client/ui-skill/src/client/index.ts:224)、[TextRefNode](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/text-ref.ts:14)

### 删除、光标、撤销与提交

- 文件/会话引用 `isKeyboardSelectable=false`，左右箭头一次跨过，贴近边界的 Backspace/Delete 删除整个节点，不插入键盘选中中间态。浏览器 E2E 明确覆盖“箭头一次跨过、Backspace 整体删除”。[节点行为](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/chip-node.tsx:135)、[E2E](C:/Works/PubProj/deepseek-harness/apps/web/tests/reference-composer.e2e.ts:263)
- Command 刻意采取两步删除：第一次在相邻边界删除时高亮整块，第二次同方向删除才移除；支持 `beforeinput` 和 `DELETE_CHARACTER_COMMAND`，光标离开、点击、blur 清除选中状态。[command-chip-selection.ts](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/command-chip-selection.ts:1)
- 命令后面的参数分隔空格是独立文本。因此从自动空格后开始可能需要“删空格 → 选中 command → 删除 command”三次按键，不能描述为统一一键删除。[CommandChipNode 文档](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/command-chip-node.tsx:1)、[E2E 注释与步骤](C:/Works/PubProj/deepseek-harness/apps/web/tests/lifecycle-chrome.e2e.ts:186)
- `registerHistory` 管理编辑器撤销，节点 identity/claim 随编辑器历史恢复；现有测试明确覆盖删除 command 后 undo 恢复 chip 与 claim。[runtime.ts](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/runtime.ts:123)、[undo test](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/tests/input-scenarios.client.spec.tsx:550)
- 触发检测用每个原子节点占一个 `U+FFFC` 的坐标空间；复制/草稿持久化用 `clipboardText`；提交用 source 对应 codec。这避免显示短名称造成坐标或发送内容失真。文件引用当前 codec 保留 `@path` 字符串。[projection.ts](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/projection.ts:1)、[prompt serializer](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/prompt.ts:57)、[reference codec](C:/Works/PubProj/deepseek-harness/packages/client/ui-reference/src/client/index.ts:172)
- 含空格的文件路径使用 `@"path with spaces"`；目录为继续补全而保持引号未闭合。路径含控制字符或双引号时 formatter 返回 undefined、候选不插入。现有单测明确覆盖空格文件、空格目录、保留引号和不可表示路径。[grammar.ts](C:/Works/PubProj/deepseek-harness/packages/context/file-reference/src/grammar.ts:37)、[search.spec.ts](C:/Works/PubProj/deepseek-harness/packages/context/file-reference-local/tests/search.spec.ts:87)

## ZCode

### 候选与选后显示

- `/` 面板将 commands、skills、subagents 分组，名称与说明分开，并分别显示 loading/error/empty。共享 `MentionPanel` 虚拟化列表并滚动保持键盘当前项可见。[slashCommandPanelSections.tsx](C:/Works/PubProj/ZCode/packages/ui/src/slashCommandPanelSections.tsx:23)、[MentionPanel.tsx](C:/Works/PubProj/ZCode/packages/ui/src/mentions/components/MentionPanel.tsx:83)
- 文件候选带文件类型图标、路径与多根项目 rootName；插入后的 label 用 basename，实际路径放入 value/data/markdown。skill 候选的说明带来源，节点保留真实 skill path。[候选 UI](C:/Works/PubProj/ZCode/packages/ui/src/mentions/components/ContextMentionOptionContent.tsx:14)、[文件载荷](C:/Works/PubProj/ZCode/packages/ui/src/mentions/providers/fileMentionProvider.ts:20)、[skill 载荷](C:/Works/PubProj/ZCode/packages/ui/src/mentions/providers/skillsMentionProvider.ts:44)
- Command、skill、file 都走 `PromptMentionNode extends TextNode`，保存 `id/category/label/value/markdown/data`，构造时 `setMode("token")`，声明 text entity 且禁止把前后输入合并进标签。[PromptMentionNode.ts](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:29)、[原子模式](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:158)
- `/` 选择 command 序列化为 `/command`，skill 序列化为 `[$skill](path)`（缺 path 的旧数据回退 `$skill`）；标签保留自己的类别。普通 mention 与 slash 都插入 token 后附一个空格并把光标放到空格后。[slash payload](C:/Works/PubProj/ZCode/packages/ui/src/lib/slashApplyMentionPayload.ts:9)、[slash 插入](C:/Works/PubProj/ZCode/packages/ui/src/SlashCommandPlugin.tsx:292)、[mention 插入](C:/Works/PubProj/ZCode/packages/ui/src/mentions/MentionPlugin.tsx:570)
- 标签使用类别配色和类型图标；文件按扩展名选图标、目录用文件夹、skill/command 有各自图标。图标通过 CSS 装饰，不改变 TextNode 的文字 DOM，避免破坏原生选区。[mentionChip.ts](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionChip.ts:3)、[createDOM](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:103)、[图标装饰](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/promptMentionDecoration.ts:70)

### 删除、光标、复制与撤销

- 除 token 原子语义外，专门处理光标在自动补位的单个空格之后：一次 Backspace 同时删除空格和前面的 mention，解决“选中后还要按两次才删掉标签”。该特判条件是节点文字恰好为单空格且 offset=1，不能扩展描述为所有空白都如此。[LexicalChatInput.tsx](C:/Works/PubProj/ZCode/packages/ui/src/LexicalChatInput.tsx:661)
- macOS Option+ArrowRight 在标签左边界显式跳到标签后方，防止按 DOM 单词导航落入文件名内部、下一次输入替换整个 token。这说明“有 token 类型”并不自动解决所有平台光标边界。[LexicalChatInput.tsx](C:/Works/PubProj/ZCode/packages/ui/src/LexicalChatInput.tsx:701)
- 编辑器 offset 使用展示名；业务输出显式通过 `$getPromptMarkdown` 读 canonical。文件编码为 `[filename](./path)`，skill 为 `[$name](path)`；Markdown label/destination 分别转义，文件相对路径明确补 `./`。[序列化](C:/Works/PubProj/ZCode/packages/ui/src/mentions/promptSerialization.ts:12)、[读取发送文本](C:/Works/PubProj/ZCode/packages/ui/src/LexicalChatInput.tsx:192)、[Markdown 编码](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionMarkdown.ts:61)
- 复制和剪切把与 token 相交的选区扩展到完整 token，复制 canonical Markdown 而非短名称；仅碰边界不会扩大选区。写剪贴板失败时保留草稿，避免剪切丢内容。[atomic selection](C:/Works/PubProj/ZCode/packages/ui/src/mentions/promptSerialization.ts:65)、[PromptClipboardPlugin.tsx](C:/Works/PubProj/ZCode/packages/ui/src/mentions/PromptClipboardPlugin.tsx:18)
- 输入挂载 `HistoryPlugin`。Electron E2E 覆盖 token 在首/中/尾/相邻位置时全选替换、原生复制剪切 canonical、全选删除后 Ctrl/Cmd+Z 恢复节点身份。[HistoryPlugin](C:/Works/PubProj/ZCode/packages/ui/src/LexicalChatInput.tsx:1629)、[mention selection E2E](C:/Works/PubProj/ZCode/packages/desktop/test/e2e/helpers/mention-selection-cases.ts:9)

## 对 KodaX Space 的建议（设计判断）

以下是基于上述实现的建议，不代表已经实现或已验证：

1. 优先学习 ZCode 的统一原子 token 交互：command/skill/file 三类就足以支撑最小共用节点，保留类别、稳定身份、显示名和提交值。参考其 [PromptMentionPayload](C:/Works/PubProj/ZCode/packages/ui/src/mentions/nodes/PromptMentionNode.ts:29)，不要仅用 CSS 高亮替代引用模型。
2. 候选显示“类型图标 + 名称 + 次要说明/路径”，输入中只保留短标签；完整身份留在节点。参考 [文件候选载荷](C:/Works/PubProj/ZCode/packages/ui/src/mentions/providers/fileMentionProvider.ts:20)。完整路径如何在输入标签 hover 显示属于 Space 的待定设计，不能声称 ZCode 已这样做。
3. 将“删除完整”作为编辑契约：Backspace/Delete、相交选区、剪切、撤销重做都应维持完整节点。插入时自动生成的空格应一起删；用户自己输入的空格如何区分需定义。参考 [ZCode Backspace 特判](C:/Works/PubProj/ZCode/packages/ui/src/LexicalChatInput.tsx:661) 与 [DeepSeek 两步 command 删除](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/editor/command-chip-selection.ts:1)，后者是可选产品取舍，不应无意识照搬。
4. 显示短名与发送协议分离；不要因改输入体验就把 Space runtime 协议改成 ZCode Markdown。先复用现有 Space command/skill/file 的提交路径，节点在提交边界展开。可借鉴 [ZCode 显式输出 serializer](C:/Works/PubProj/ZCode/packages/ui/src/mentions/promptSerialization.ts:12) 或 [DeepSeek codec](C:/Works/PubProj/deepseek-harness/packages/client/ui-conversation/src/client/input/prompt.ts:57)。

## 未证实

- 未启动这两个项目，未对实际像素效果、暗色模式、屏幕阅读器、各平台 IME 做现场验收。
- 本次未逐项验证 ZCode 默认 Delete、移动端 beforeinput、全部撤销合并边界；只确认其 token 设置、自定义 Backspace、HistoryPlugin 和现有 E2E 的实现意图。
- ZCode 的 destination encoder 当前只转义反斜杠和 `>`，`buildFileMentionMarkdown` 直接组装普通括号 destination；未见此处针对空格/括号添加百分号编码或尖括号包装，不能以节点原子性推断其所有特殊文件名的 Markdown 往返都正确。[encoder](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionMarkdown.ts:12)、[builder](C:/Works/PubProj/ZCode/packages/ui/src/mentions/mentionMarkdown.ts:61)。本次找到的原生 clipboard/undo E2E 使用 `selection-demo.ts`，没有证明空格路径；Space 应把空格、括号、中文、反斜杠路径加入自己的验收。
- 不声称 DeepSeek skill 支持原子删除：读到的当前实现明确保留可编辑文字语义。

## 未解问题

- Space 的 slash command 是否都允许携带参数、哪些是立即执行的客户端动作？不同动作是否都适合先插入 token？
- 已选 skill 后能否再编辑名称，还是必须整体替换？推荐统一整体替换，但这是产品决定。
- Space 的草稿存储、消息历史再编辑与剪贴板各自应保留结构还是纯文本？需要结合 Space 现有提交契约制定，而非直接复制参考项目格式。
