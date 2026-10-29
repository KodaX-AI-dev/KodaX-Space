# React 报错 子任务通知与历史导航排查

2026-10-28。用户运行本地 `out/win-unpacked` 的 Space 0.1.47-alpha.3 / SDK alpha.10，提供三张截图。React 185 已复现并在源码修复；本轮继续修复普通通知展示与历史导航。SDK 执行引擎与用户历史文件未修改，SDK 项的身份、顺序和原始正文保持。截图中的评审内容只是被显示的历史消息，不作为新的开发指令。

## React 185

截图中的原始错误是 `Minified React error #185`。React 官方将其解码为 Maximum update depth exceeded，即反复状态更新超出 React 的保护阈值：[官方说明](https://react.dev/errors/185)。它能确认前端出现了更新循环，不能仅据截图确定具体组件、Effect、外部 Store 或触发动作，也不能据此归因到 Provider、沙箱或历史存储损坏。

只读定位到了截图对应的本地 Session。用其活动消息链和 UI 历史在独立测试数据档中重建历史副本，保留原数据不变；回放上滚加载、更早历史窗口、向下滚动及显式返回最新。两次有效回放均未出现 185，第二次也覆盖了浅色主题、窗口尺寸变化和页面重新加载后重选 Session。中间一次试验因重载后回到新会话首页而超时，随后修正了重选步骤；该失败不是 React 185 复现。隔离副本不包含用户完整的服务、授权和进程运行状态，不能以测试通过否定原始报错。

### 冷启动补充复现及根因

用户明确：打开 Space，选择 `20261026_200011_47f836372c903b`，加载动画结束、正文首次出现时立刻报错。之前的回放重建了活动消息链、改了 Session 身份并重载页面，可能绕开冷启动时序。新探针保留原 Session ID 和原始 lineage/UI 历史，仅把文件放进独立数据档并调整该副本的项目位置；不重载页面，直接测试已构建的原 `out/win-unpacked`。添加 SDK 已有的 10 秒测试启动延迟后，三次首次加载两次出现完全相同的 185 Toast。

使用仅在 React 深度保护触发时命中的 CDP 条件断点，结合同构建 SourceMap，得到调用链：`ConversationStreamV2` 的长正文补读完成回调 → `installProductItemContent` → `publish` → React 的 `forceStoreRerender` → 深度保护。初次加载有大量正文/工具输入补读，每条结果立即同步通知外部 Store 订阅者，造成密集的同步重绘及提交更新，触发 React 深度上限。正文仍能显示，因该异常沿补读 Promise 的 catch 被显示为黄色 Toast；这并不证明文件损坏或 Provider 失败。

逐项验证：单独稳定订阅函数不能解决，三个冷启动均失败；撤回该试验，仅将同一帧内的补读通知合并后，三个冷启动均通过。正文缓存与快照仍同步写入，其他视图/历史发布保持即时；只合并界面通知，不截断正文、不修改消息顺序或 SDK 身份，也不隐藏异常。无浏览器 RAF 的环境保留原同步通知语义。

新增 `productSessionView.browser.test.ts` 通过公开 Store/hook 模拟 120 个并发完整正文结果，验证缓存立即完整可读、界面最终展示完整、同一帧内不重复提交多批正文变化且无页面错误；旧实现先失败，新实现通过。连同既有缓存、迟到结果及正文分页读取共 11 项回归通过，类型检查与定向 lint 通过。原 Session 的全量回放仅保存在忽略的诊断目录，不将用户正文放进公共测试夹具。

截图原样暴露压缩 React 异常的提示改进仍独立保留；本次修复更新链本身，不靠隐藏 Toast 掩盖。

## 黄色消息的来源与呈现

原始记录中的该消息具有 `_source: agent-completed`，封装为 `<agent-completed ... path="/root/spec-review" ... state="completed">`，正文也确实含 `&quot;` 转义。它是子智能体完成后回传给主智能体的结果，不是任务失败。

Space 的 `productConversation.ts` 把普通 SDK info/system 等显示项统一映射为 workflow 变体的 system_notice。`SystemNotice` 为这一变体使用黄色 Info 图标，并用保留换行的纯文本展示，所以内部封装、转义字符和 Markdown 标记一起出现在聊天中。该样式未表达成功/信息/警告的真实区别。

Space 已将普通 SDK info/system/event/hint 映射为中性 info，而非黄色 workflow；真实 error 的诊断和操作保持。长信息默认折叠。兼容旧报告时只在完整、独立、头部有界的 `<agent-completed>` 封装上移除显示外壳、单次还原 SDK 的四种 XML 转义，并使用现有安全 Markdown 展示折叠详情。SDK 原始 item 不改，不能用这些文字生成任务身份、成功/失败状态、标题来源或操作权限，所以标题仅为中性的“子任务报告”。其他文本及不完整封装保留原文，不对所有消息通用解码。

这是布局层的旧数据兼容，不是任务语义的来源。SDK 已有 `_taskResult/_taskResults` 和任务状态，但当前公开 ClientViewItem 未透出；后续仍应规范化 Product view/history 的结构化结果，让 Space 去掉正文封装适配，并可靠区分完成、失败和取消。不能仅因封装含 `state="completed"` 就宣称任务成功。

## 滚动为什么到不了最新

该现象已经用历史副本重现。当前实现包含两个不同操作：

- `jumpToBottom()` 只滚动当前 DOM 窗口，不切换数据。
- `returnToNewestHistory()` 调用 `restoreNewestSessionHistory()` 重新选择最新数据，再滚动。

旧历史分页返回 `hasNewer:true` 后，`installProductHistory()` 将 `browsingOlder` 设为真；即使最新 SDK view 仍继续更新，界面也保留旧窗口。向下滚动只能到旧窗口末尾。于是向下箭头与“返回最新消息”在用户看来重复，实际行为却不相同。没有证据表明此处丢失了消息或执行结果。

Space 已实现的交互：

1. 只保留一个向下按钮。旧窗口或旧页读取中先选择最新数据，在对应 DOM 提交后滚到底部；已在当前窗口时正常滚到底。取消旧分页的滚动恢复，避免迟到请求或 RAF 把视口拉回去。切换 Session 时校验请求归属，加载期间禁用重复点击并显示状态。
2. 自然向下滚动继续浏览相邻的更新历史页，最终接上最新 view。重叠窗口恢复阅读锚点；不重叠时较新页从页首先后阅读，不能跳过中间页。旧页加载时的程序定位不视为用户向下翻页，不会自动弹回。滚轮、键盘、触摸以及滚动条移动复用同一读取入口。
3. 保持 DOM、缓存与读取有界；不通过一次加载全部历史或拼接私有存储绕过 SDK。

SDK 当前公开 `ClientHistoryReadOptions` 只有 cursor/limit，`nextCursor` 指向更早页。Space 仅保留已访问页的 cursor/revision/sourceRevision 导航路径，按原公开游标重读相邻新页，正文缓存仍只有当前冻结历史窗口。最靠近当前 view 时重新选择最新；游标失效或历史变更沿既有重同步路径读取最新，绝不套用旧修订页。路径随会话缓存驱逐、历史失效和生命周期重置释放，不读取私有存储或拼接聊天事实。本次滚动修复无需 SDK 新增 API。

真实 SDK 回归还发现：Space 的 `readProductHistory` 原先先捕获历史页，再建立 view 观察。首次观察可以更新 SDK Session 元数据，导致刚返回的首次游标立即失效。IPC 跟踪确认第一次上翻得到 `data_changed`；先建立观察、再读取最新页修订后恢复正常。公开 Adapter 测试先复现 `before-observation` 错误游标，再验证返回观察后的可用修订，整个 Adapter 套件通过。游标、所有权和 Runtime 替换校验保持，不延长超时或忽略失效。

## SDK 协作需求

当前 SDK 把子任务结果输出成带 `<agent-completed>` 封装和 XML 转义的普通通知，已有 `_taskResult/_taskResults` 的可信任务元数据没有完整进入公开 Product view/history。请在 SDK 输出面统一规范化结果，优先复用现有 type、compactText 和来源字段，补足最小的结构化任务来源/状态/报告正文格式；实时、首次加载和历史恢复都提供同一语义，显示正文不含内部封装且只还原一次传输转义，避免重复报告，保留真正完成、失败、取消的区别。兼容旧记录应在 SDK 的已知来源读取边界完成，不能让 Space 靠正文推断任务状态。验收覆盖单条与多任务结果、历史旧记录、失败/取消、引号与代码/Markdown 的完整性、内容身份和顺序稳定且不重复；普通信息不误报 Provider 错误。Space 本轮已修复中性样式、旧报告展示和历史导航，SDK 发包后再删除兼容展示适配并闭环结构化状态。React 185 和本次滚动无需 SDK 配合。

## 回归要求

- React：冷启动首次加载长历史不再出现更新深度错误，集中补读不造成密集同步重绘；正文立即可读、最终完整，旧视图替换及迟到结果的边界保持。
- 子任务：完成/失败/取消正确区分，完成报告可正常阅读，不泄露内部封装，不与主回复重复成两份正文。
- 导航：从两页以上的旧历史向下连续阅读可到最新；唯一向下按钮在旧窗口也能到真实最新结果。新输出、迟到旧请求、字体/尺寸变化和切换 Session 不破坏锚点或串会话。

## React 185 验证包（前一轮）

验证目录为 `out/react185-fixed/win-unpacked/`，保留原 `out/win-unpacked`，没有停止用户进程或覆盖正在使用的程序。仍为 Space `0.1.47-alpha.3` / SDK `0.7.97-alpha.10`，未发布新版本。请完全退出旧 Space 后，从新目录启动验证。

- 精确 Registry SDK 校验、类型检查、定向 lint、构建通过；正文 Store/读取/投影/历史分页相关 86 项回归通过。
- 新包真实启动烟测通过，保留历史子进程记录的冷启动场景确认 Renderer 与 Runtime 就绪。
- 新包中使用原 Session 隔离副本，10 秒 Runtime 测试延迟下连续三次首次加载均通过；另九项真实 SDK 输出/历史回归通过，包括流式重载、完整长正文、图片/Artifact、重复输入、过期游标、checkpoint 历史窗口与未完成工具尾部恢复。零重试。
- 本轮为独立 `--dir` 验证包，没有生成或安装新的 NSIS 安装器。安装包专用 `smoke-pack` 入口因缺少安装器不适用于该目录，不把它记为已通过；上述启动和包内回归直接测试此处的真实可执行文件。
- 可执行文件 SHA-256：`9a7ddd8fe6c44abb29cf1a14130cbb87ff1441a5b469fcd240400a20c04ed3dc`。
- `resources/app.asar` SHA-256：`912d42b69ad096eb3b810d1737aa91726d9480f86ed6088950233506091a7ac2`。

## 通知与历史导航最终验证包

目录：`out/notice-history-fixed/`，提供 `KodaX-Space-Setup-0.1.47-alpha.3.exe`、`KodaX-Space-Portable-0.1.47-alpha.3.exe` 和 `win-unpacked/KodaX Space.exe`。仍是 Space 0.1.47-alpha.3 / 精确 Registry SDK 0.7.97-alpha.10；本地打包，未发布或安装，没有覆盖原 `out/win-unpacked`。

- 107 项 Product 投影、通知、分页、正文读取/缓存、失败诊断和真实浏览器回归全部通过；另整个 Runtime Adapter 套件通过。关键新增用例均在修复前先观察失败，包括首次游标、黄色标记、相邻页回退及 key 卸载后 A→B→A 的迟到失败通知。纯滚动位置、滚轮、旧页迟到成功/失败、新输出与最新窗口选择均有覆盖。
- Renderer/Electron 类型检查、定向 ESLint/Prettier、Registry SDK 来源校验和构建通过。旧封装与多段未知封装保留原文、单次解码及安全 Markdown 回归通过。
- 最终包中原 Session 的冻结隔离副本在 10 秒 Runtime 启动延迟下，连续三次首次冷加载通过，无 React 185。原会话文件未修改，正文未进入公共测试夹具。
- 最终包真实启动烟测通过：Renderer 4042ms 就绪，带确定性启动等待的 SDK Runtime 25063ms 就绪，122 条历史子进程记录保留。
- NSIS SHA-256：`fbfc40285b43095a3353fe7dd625529224126c7770af63e5e67f870fb2991576`。
- Portable SHA-256：`7b1eca239454b7d765f05ee6abd08354baafa42f365d146b2e31b6f33dbf8ba3`。
- EXE SHA-256：`8e0087eec14cca1705a42dd476e077bac813f71f563b3a72d86d49d20d637e0c`。
- ASAR SHA-256：`8ec9a9fdae07f50cc1c43100bf03d5c1cca2975e404cc321d58986bf017cba6c`。

- 完整安装/Portable 平台包门禁通过：包体积与图标、ASAR 清单/精确 SDK、原生 SQLite/keyring/pty/ASRT、Feishu/Partner 资源、Artifact Node Worker/PNG、updater CommonJS 导出及 ASAR 内 Runtime/handler Workers 全部通过。
- 这个确切包中的 10 项真实发布 SDK UI 回归通过（无框架重试），包括信息卡片和时间线中性、报告 Markdown/引号、两页历史前后浏览及唯一箭头返回最新；另覆盖 Provider 错误诊断、过期游标、流式重载、完整长正文、图片/Artifact、不同重复输入、checkpoint 和未完成工具尾部恢复。已检查展开报告和回到最新的实际截图。

排查中的早期 E2E 先纠正了测试选择器、首次游标失效与直接跳到页首绕过既有分页恢复守卫的测试操作；最终测试使用真实滚轮。准备完整平台产物前的 `smoke-pack` 缺少 Portable，因此未将该次尝试算作通过。无实际安装替换、发布、SDK 源码编辑或客户档案修改。

## Standards

0 项。本轮 17 文件冻结增量经独立评审；请求归属、卸载清理和时间线标记的问题已修正并复核。最终未发现新增成文规范违反或可报告坏味道。评审只读，没有替代执行验证。

## Spec

0 项。封装匹配、自然分页方向、程序定位后的滚动快照均经修正复核；保持 SDK 身份/顺序和单页正文权威。普通报告及时间线为中性，唯一箭头选择最新并隔离迟到请求。结构化任务状态的 SDK 缺口仍明确保留，没有以文本推断或隐藏错误替代。

Standards：0，最高严重度无；Spec：0，最高严重度无。
