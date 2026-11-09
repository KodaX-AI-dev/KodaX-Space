# Issues 239–241：成果打开、命令补全与历史阅读回归

版本：Space 0.1.47-alpha.4 源码修复，SDK 0.7.97-beta.4。本指南覆盖用户批准的三个交互切片；发布状态以实际发布记录为准。

## 公共验证边界

- Artifact：真实聊天卡片 → Shell 条件挂载 → 侧栏选择 → artifact.read。仅测已挂载 ArtifactsView 会漏掉首次事件丢失。
- 补全：真实 Composer 的键入、Tab、空格、Enter 与序列化/提交；仅测字符串 opener 会漏掉编辑器与弹窗重新触发。
- 历史：真实 ConversationStreamV2 的入口、相邻分页、搜索定位、返回和滚动；IPC 使用隔离 fixture 控制延迟、失败与来源状态，不访问个人会话。

## 人工用例

使用独立测试 profile、临时项目和虚构内容。准备至少两份 Artifact（PDF 与 HTML）、一段跨多页历史，以及一段实时显示范围与保存页不同的会话。部分/歧义来源与确定性故障可使用下方自动化 fixture，不能通过修改个人历史制造。

| 用例              | 优先级 / 类型     | 前置条件                                              | 操作                                                                   | 预期                                                                                                      |
| ----------------- | ----------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A1 首次打开       | P0 / 正向、UI     | Coder 右栏关闭，聊天有两份成果                        | 点击第二份的“打开”                                                     | 一次展开并选中第二份，开始读取；无需第二次点击，不能落到默认第一份                                        |
| A2 切换与重挂载   | P0 / 边界、UI     | 右栏已看 A                                            | 点击 B，关闭右栏，再从聊天点 A                                         | 每次一个动作到达指定目标；无旧目标重放                                                                    |
| A3 请求归属       | P0 / 安全、负向   | 使用延迟列表 fixture                                  | 请求 A 后切换项目或会话，再返回                                        | 不消费旧上下文请求；迟到列表不覆盖最后选择                                                                |
| C1 帮助命令结束   | P0 / 正向、UI     | 输入框为空                                            | 输入 `/hel`，Tab，空格，Enter                                          | Tab 后为 `/help ` 且菜单关闭；额外空格不复活；只执行一次无参 help                                         |
| C2 主动参数建议   | P0 / 正向、边界   | 输入框为空                                            | 输入 `/help mo`，选择主题，再 Enter                                    | 仅建议合法帮助主题；末级接受后关闭，Enter 提交，不重复追加主题                                            |
| C3 合法续层       | P0 / 边界         | 当前发现包含相关命令                                  | `/extensions sdk` 接受后继续补 load，接受末级；另试 model/session 参数 | 真正下一层仍可补全；末级不再次追加；自由文本可正常输入                                                    |
| C4 空候选与加载   | P0 / 负向         | ready 无匹配、held discovery、failed discovery 各一例 | 按 Enter，必要时按 Esc                                                 | ready 无匹配交给正常提交/校验；加载和失败保持原有保护，显示状态；不凭空插入候选                           |
| C5 编辑器保真     | P0 / 兼容性       | 技能、文件候选可用                                    | IME 确认、Shift+Enter、光标中部补全、撤销/重做                         | 组合输入不误提交，Shift+Enter 换行，技能身份和尾随文字保留                                                |
| H1 单页也可达     | P0 / 正向、边界   | 保存历史仅一页，但比 view 内容更多                    | 点击顶部“浏览历史消息”                                                 | 落点说明可见；进入最近保存页，无 nextCursor 也可读；可返回原处                                            |
| H2 连续前后阅读   | P0 / 正向、兼容性 | 多页同修订记录                                        | 滚轮、键盘、触摸、原生滚动条向上再向下                                 | 已读项保留、顺序正确且无重复；程序定位不触发多余翻页                                                      |
| H3 失败与完整性   | P0 / 负向、UI     | 注入旧页失败或 partial/ambiguous 来源                 | 加载、失败后重试                                                       | 已读内容保持可读；提供重试；未确认完整时不显示“已到本会话开头”                                            |
| H4 搜索范围       | P0 / 正向、边界   | 当前显示文字只存在于未保存 live；另有旧页关键词       | Ctrl/Cmd+F 查 live，再显式切保存检索查旧词                             | 默认“已加载内容”找到眼前文字；保存范围明确，结果数不冒充全文出现次数                                      |
| H5 命中直达与降级 | P0 / 正向、负向   | 使用可定位、仅原文、过期命中各一例                    | 单击命中、返回结果；另点“查看原文”                                     | 单击优先读上下文，不先读全文；不可定位可读原文，过期可重查；返回查询、焦点和原位置                        |
| H6 迟到与阅读权   | P0 / 安全、边界   | 定位或原文请求在途                                    | 改查询、换会话、返回；读旧记录时产生新输出                             | 旧响应不串会话或抢滚动；“返回最新消息”显式恢复跟随                                                        |
| V1 视觉与输入     | P1 / UI、兼容性   | 深/浅色、窄/宽窗口、125%/200% 缩放                    | 键盘遍历历史边界、搜索和成果入口                                       | 标签、热区、焦点可识别；无横向溢出或输入区遮挡；平台快捷键正确                                            |
| P1 有界成本       | P1 / 性能         | 大量短消息、一个长 Markdown、一个工具密集轮           | 首开、上翻、展开、检索和返回                                           | 首开不为入口或目录读取全部历史；定位不以完整原文为前置；记录响应、IPC字节和锚点漂移，不能把设计预算当成绩 |

## 自动化入口

```powershell
npm run build:packages
node --test --import tsx apps/desktop/renderer/src/shell/artifactOpen.browser.test.ts apps/desktop/renderer/src/features/artifact/ArtifactFileActions.browser.test.ts apps/desktop/renderer/src/features/artifact/ArtifactView.browser.test.ts
node --test --import tsx apps/desktop/renderer/src/shell/SlashCommandCompletion.browser.test.ts apps/desktop/renderer/src/shell/slashInput.test.ts apps/desktop/electron/test/slash-input.test.ts apps/desktop/electron/test/skill-slash.test.ts
node --test --import tsx apps/desktop/renderer/src/shell/conversationHistoryNavigation.browser.test.ts apps/desktop/renderer/src/features/session/ProductHistorySearch.browser.test.ts
npm run typecheck
npm run lint
npm test
npm run build:smoke
```

Electron / 打包回归使用仓库的隔离 profile 和 isolated-desktop runner。不要用个人 profile，也不要并行切换同一个 better-sqlite3 addon 的 Node/Electron ABI。自动化结果、成品检查和仍未执行的平台人工用例分别记录在[实施验收](../research/ui-interaction-fixes-validation-2026-11-09.md)。F144 虚拟化、全局目录和未读计数不在本次实现范围内。
