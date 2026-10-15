# Issue 220：未发送会话草稿与空白任务回归

需求来源：用户要求 SDK/REPL 未发送的新会话先作为草稿，首次有效输入被接受后再持久化；Space 不显示空白任务，合理处理旧空记录，并纳入 SDK 新版本。

## 预期行为

- SDK `sessions.create({ draft: true })` 支持读取、设置与观察，首个有效用户输入进入 canonical 历史前不创建持久化 Session。显式普通创建仍可保存命名的空会话。
- Ink 与经典 REPL 的生产命令绑定统一声明草稿。`/new`、启动、设置变化后直接退出均不产生新的历史记录。无效或未被接受的输入保持草稿；输入接受后即保存，执行失败也保留输入。
- Space 要求 SDK 与 Host 均提供 `sessionDrafts:1`，普通 Coder 明确声明草稿；旧 Host 缺少能力时拒绝准入。Quick Ask 的独立生命周期保持不变。
- 旧记录仅在 SDK 完整历史确认没有消息、分支、通知、Artifact、扩展、错误或 Actor 恢复状态，且没有 SDK/Space 标题时，从列表中隐藏。原记录保留。命名空会话及有历史的未命名会话仍可访问。
- 空字符串与纯空格标题使用现有本地化「未命名会话」名称。可见条数在过滤后计算，旧空记录不占分页额度。

## 手动步骤

1. 在新 SDK 上启动 REPL，改变 Provider/模式，输入文字但不提交，退出；重新打开 REPL 与 Space，历史列表不新增空记录。
2. 启动后连续执行 `/new`，退出。验证没有留下这几次未提交会话的文件。
3. 提交空白或被拒绝的输入，验证仍无历史；提交有效输入，验证输入被接受后已有持久化历史，刷新和重启均保留一次。
4. 首个输入被接受后让 Provider 返回错误或立即停止，输入仍可恢复。后续重复提交同一 inputId 不重复持久化。
5. 准备旧的未命名 metadata-only 会话、命名空会话、标题为空的有内容会话和 active path 为空但有旧分支的会话。Space 只隐藏第一类；文件全部保留。
6. 先显示较多旧空记录，再打开项目列表和全部历史选择器。可见额度仍返回真实会话；刷新后未命名内容会话有可读名称。
7. 空摘要读取后通过 SDK 重命名记录，完整历史已经有标题时仍保留；转正期间并发读取设置及首次设置写盘失败后重试均不丢草稿设置。

## 自动入口与发布边界

- SDK：`sdk-runtime.session-drafts.test.ts`、`sdk-client.inputs.test.ts`，验证生产 REPL 绑定与真实共享 Host 输入接受。
- SDK 存储边界：`packages/repl/src/interactive/storage.drafts.test.ts`，验证草稿编辑、不可变读取边界、跨实例不可见与有效输入保存。
- Space：`session-empty-records.test.ts`、RuntimeHostAdapter 草稿准入回归、`session-empty-records.spec.ts`，验证历史保留、列表额度、侧栏名称和刷新。
- 已发布的 Registry `0.7.97-alpha.6` 包含用户图片恢复与草稿支持。Space 精确锁定该版本，并要求 SDK 与 Host `sessionDrafts:1`；开发链接已撤下。当前真实发布包回归及打包结果见 [alpha.6 接入记录](../releases/kodax-0.7.97-alpha.6-integration.md)。

## 2026-10-14 自动验证结果

- SDK 草稿/输入/设置/CLI/schema/存储边界回归 61/61，通过；既有存储关联回归 168/168，通过。
- Space adapter/旧记录/列表回归 258/258，通过；新增空记录 Electron 测试和既有真实 Host 输出/队列/退出回归共 14/14，通过。
- SDK 草稿三个生产接缝的新增可执行语句起始行覆盖 45/47（95.74%），不是全仓覆盖率；Source、测试与 Space 类型检查通过，Space lint、生产构建及 SDK bundle/声明构建通过。
- Standards 与 Spec 各 0 项残留。SDK 和安装包尚未发布，个人旧 Session 文件未删除。
- 机器记录：[session-draft-lifecycle-2026-10-14-evidence.json](../releases/session-draft-lifecycle-2026-10-14-evidence.json)。

## 2026-10-15 Registry 与安装包验证

- SDK `0.7.97-alpha.6` 已从官方 Registry 安装，根/Desktop/lockfile 对齐，开发链接已撤下。
- 最终全量 4,355 通过、20 项条件跳过、0 失败；真实 SDK Electron 18/18；最终 Windows 程序的共享 SDK 契约 6/6、旧空记录/标题/消息排序 2/2。
- Registry 字节、ASAR 依赖/native Worker、启动、类型检查、lint、构建与两轴复审全部通过。Space 候选包已生成，未对外发布；个人历史文件保留。
- [独立验收及文件指纹](../releases/kodax-0.7.97-alpha.6-integration-evidence.json)。
