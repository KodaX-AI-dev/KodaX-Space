# Pi 如何实现命令、Skill、文件补全与完整删除？

结论摘要：Pi 的 CLI 补全和本 checkout 的 P2 Web 文件补全主要是“清晰候选 + 纯文本替换”；真正实现原子光标移动、整块删除和恢复的是 CLI 大段粘贴 marker，不能把这项能力归给全部 slash/skill/file 补全。

调研日期：2026-11-06。本地 checkout：`C:\Works\PubProj\pi`，HEAD `63bc4da65adc2b45b1674d85a303d5eaefe3ae07`（`git rev-parse HEAD`）。以下为源码及现有测试阅读，没有启动交互程序或执行测试。覆盖 `packages/tui`、`packages/coding-agent` CLI，以及本 checkout 内 `apps/p2` Web；不把这些实现泛化为其他版本或其他 Pi 客户端。

## 1. 候选显示与身份

- 统一候选结构是 `value`、`label`、可选 `description`；它把写入值与显示名分开，但没有 file/skill 节点 ID 或原子编辑属性。SlashCommand 另有 `argumentHint`、参数补全接口。[类型定义](C:/Works/PubProj/pi/packages/tui/src/autocomplete.ts:246)
- slash 列表把参数提示与描述拼成 `hint — description`；Skill 注册为 `skill:name`，并沿用来源描述。模糊搜索优先匹配去掉 `skill:` 的短名称，再补充全名匹配，因此输入 Skill 名即可找到 `/skill:name`。[候选组装](C:/Works/PubProj/pi/packages/tui/src/autocomplete.ts:335)、[Skill 注册](C:/Works/PubProj/pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts:826)
- 文件候选以 basename 为主标签、相对显示路径为描述，目录以 `/` 结尾；前 20 个结果进入候选列表。文件完整路径用于 `value`，避免把 basename 当作文件身份。[文件候选](C:/Works/PubProj/pi/packages/tui/src/autocomplete.ts:817)
- TUI `SelectList` 区分主列和描述、选中主题色；限定可见行数并显示当前位置/总数，上下键循环、PageUp/PageDown 翻页，鼠标点击也可确认。[绘制](C:/Works/PubProj/pi/packages/tui/src/components/select-list.ts:76)、[键盘](C:/Works/PubProj/pi/packages/tui/src/components/select-list.ts:146)

## 2. 选中后仍然是文本

- slash 补全直接拼成 `/${item.value} `；`@` 文件补全将值拼进原行。文件后加空格、目录不加空格；引号目录的光标停在闭引号前，允许继续补全子路径。返回结果只有 `lines`、`cursorLine`、`cursorCol`。[补全应用](C:/Works/PubProj/pi/packages/tui/src/autocomplete.ts:412)
- 路径含补全分隔符或用户已输入引号时，值变成 `@"path"` / `"path"`。这里的转义是字符串语法与光标处理，并没有变成可视化 chip。[路径加引号](C:/Works/PubProj/pi/packages/tui/src/autocomplete.ts:129)、[避免重复闭引号](C:/Works/PubProj/pi/packages/tui/src/autocomplete.ts:422)
- Tab 确认补全前保存 undo snapshot；确认键选择 slash 后会继续进入提交，文件候选确认后则回到编辑。这种“Enter 可执行命令、Tab 只补全”的差异需明确告知用户，不能直接照搬为桌面全部实体的默认行为。[键盘处理](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:779)
- 补全可以一次撤销回原前缀；现有测试明确验证 `di → dist/ → undo → di`。[撤销测试](C:/Works/PubProj/pi/packages/tui/test/editor.test.ts:2096)

## 3. 完整删除的真正对象：大段粘贴 marker

- 普通 Backspace/Delete 按 grapheme（用户可感知字符）删除。没有 slash/skill/file 补全记录参与分段；结合纯文本替换实现，可判断这些补全默认不会获得“按一次 Backspace 删除整个实体”的能力。[Backspace](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:1390)、[Delete](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:1789)、[分段特殊规则](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:31)
- 超过 10 行或 1000 字符的粘贴才会存入 `pastes` registry，并插入 `[paste #N +M lines]` 或 `[paste #N M chars]`。`segmentWithMarkers` 只将 registry 中确实存在的 ID 合并为原子段；伪造的同形文本不算实体。[粘贴折叠](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:1308)、[原子分段](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:42)
- 原子分段统一影响左右移动、删除和换行测量。已有测试覆盖左右箭头整块跨越、Backspace/Delete 整块删除、单词移动、撤销后恢复 registry、多 marker 和窄终端换行；这比仅写一个 Backspace 特判更完整。[原子行为测试](C:/Works/PubProj/pi/packages/tui/test/editor.test.ts:3831)、[恢复 registry 测试](C:/Works/PubProj/pi/packages/tui/test/editor.test.ts:3982)、[不信任手输 marker 测试](C:/Works/PubProj/pi/packages/tui/test/editor.test.ts:4081)
- Undo snapshot 同时保存文本/光标、`pastes`、计数器；恢复时三者一起恢复。提交先展开 marker，再调用 `onSubmit(string)`，随后清空 registry 与 undo 栈。[快照及恢复](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:2126)、[提交](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:1374)
- TUI 鼠标拖拽交给屏幕层做“选中后复制”，点击才定位编辑光标；不能据此宣称它有浏览器富文本编辑器式选区删除。[鼠标处理](C:/Works/PubProj/pi/packages/tui/src/components/editor.ts:659)

## 4. Skill 的显示与发送表示不同

- 输入阶段保持 `/skill:name args`。AgentSession 发送流程再识别 `/skill:`、读取 Skill 文件、剥除 frontmatter，转换为含 name/location 的 `<skill>` 内容块并追加参数；未知 Skill 保留原文，读取失败上报错误后保留原文。这是明确的输入表示与运行语义分层，但不是编辑器实体节点。[Skill 展开](C:/Works/PubProj/pi/packages/coding-agent/src/core/agent-session.ts:2274)

## 5. P2 Web：同样区分文本补全与独立附件

- P2 composer 是受控 `<textarea value={draft}>`。`@` 文件补全选中后经 `applyFileCompletion` 拼接新文本，更新 draft，再设置 caret；没有向 textarea 插入 chip 的机制。[textarea](C:/Works/PubProj/pi/apps/p2/plugins/chat/web.tsx:350)、[应用补全](C:/Works/PubProj/pi/apps/p2/src/web/file-completion.tsx:146)
- 候选浮层用 listbox/option、`aria-selected`，主标签和路径描述分列；鼠标 mousedown 阻止失焦后选择。方向键移动、Enter/Tab 接受、Escape 关闭；补全处理优先于发送/停止。[浮层](C:/Works/PubProj/pi/apps/p2/src/web/file-completion.tsx:230)、[快捷键](C:/Works/PubProj/pi/apps/p2/src/web/file-completion.tsx:165)、[composer 顺序](C:/Works/PubProj/pi/apps/p2/plugins/chat/web.tsx:373)
- 文件索引查询有 80ms debounce、request ID 丢弃旧结果、组合输入期间暂停查询和按键处理；这一部分适合直接借鉴为中文输入与异步候选的交互原则。[查询](C:/Works/PubProj/pi/apps/p2/src/web/file-completion.tsx:26)、[过期结果检查](C:/Works/PubProj/pi/apps/p2/src/web/file-completion.tsx:100)、[IME](C:/Works/PubProj/pi/apps/p2/src/web/file-completion.tsx:216)
- Web 文件选择器/粘贴图片形成独立附件，显示在 textarea 上方，带预览或图标、文件名、删除按钮；这是可以完整移除的附件卡片，与正文 `@path` 文本补全不是同一对象。[附件类型](C:/Works/PubProj/pi/apps/p2/plugins/chat/web.tsx:182)、[附件绘制与移除](C:/Works/PubProj/pi/apps/p2/plugins/chat/web.tsx:333)

## 6. 对 KodaX Space 的启示（设计建议，不是 Pi 已有能力）

1. 候选的 `label / description / value` 分离、Skill 来源提示、文件 basename + 路径展示值得借鉴；上面第 1 节提供实现依据。
2. 如果目标是 command/skill/file 都作为整体编辑，不能只复制 Pi 的文本补全；应将 Pi 粘贴 marker 的“身份登记、原子边界、撤销同时恢复语义状态、提交展开”原则迁移到 Space 的输入模型。上面第 3 节是依据，具体编辑器技术需结合 Space 决定。
3. “文本输入为对象标记”和“实际发送内容”应分别设计，既让用户看到短而清楚的名字，也保留准确路径/Skill 身份；第 4 节证明 Pi 已采用输入阶段与发送阶段分层，但不代表 Space 应复制 XML 协议。

## 未证实

- 没有运行 TUI/Web 验证实际视觉、终端兼容性、浏览器原生撤销行为；这里引用的是实现和已存在测试，不声称测试本轮通过。
- 未证实 P2 Web 对 slash/skill 提供与 CLI 相同的候选交互；所检查 Web 文件补全 hook 只覆盖 `@` 和路径 Tab，不能据此断言整个 P2 没有其他入口。
- 文件补全生成 `@path` 不自动证明文件已上传或文件内容已加入模型上下文；本调研只跟踪编辑器输出，未审计所有后续文件解析路径。

## 未解问题

- Space 的命令对象是否应可选中后直接执行，还是始终在输入区等待再次发送？Pi 对 slash 与文件的 Enter 行为不同，仍需产品决策。
- 原子对象被复制到外部应用时应输出短标签、完整路径，还是显式调用语法？Pi TUI 的屏幕复制机制不足以回答 Space 富文本剪贴板契约。
