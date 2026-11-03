# F121 v0.1.47：SDK 聊天输出迁移回归

当前 Registry beta.1 的完整能力补审、修复及未关闭范围见 [2026-11-03 执行记录](../releases/kodax-beta1-space-fixes.md)。除下面既有输出回归，还需核对：文件/env 原来源与重启、Partner 实际 Agent 模式及其他客户端更改、所有 queue error 的完整材料分类和显式取回、Main/Host 换代恢复、Workflow 局部/全重连快照、Artifact 缺失但 Skill/聊天可用、连接器保存失败不得误报连接成功。SDK live Host 重绑、旧原文/回执、promotion view 与锁内模式准入仍按该记录单独验收。

使用真实 Provider 的 Coder 会话，核对 [ADR-010](../ADR/ADR-010-sdk-product-output.md)。自动回归用已安装 SDK 与隔离的本地 HTTP Provider，不使用个人历史或外部模型账号。

2026-10-14 的 16 项自动 E2E 是本地补丁 SDK 的历史验证。2026-10-15 已安装真实 Registry `0.7.97-alpha.6`，包含 accepted-user 图片恢复和草稿修复，开发链接已撤下。SDK 接入时的回归及包体记录见 [alpha.6 接入记录](../releases/kodax-0.7.97-alpha.6-integration.md)，当前 Space `0.1.47-alpha.2` 候选的新构建与验证见 [alpha.2 发布准备](../releases/v0.1.47-alpha.2-release-readiness.md)。本地构建通过不等于 Space 安装包已对外发布。

1. 发送包含本地文件附件的提示。输入、思考、正文、工具和 Artifact 各出现一次；回答结束后等待后台刷新，再 Ctrl+R，数量和内容一致。
2. 再发送完全相同的提示。必须保留两次输入与两次回答，不能按正文去重。
3. 在回答流式输出时 Ctrl+R，重新选择会话。保留已有部分，继续到完整回答，不能追加第二份同轮输出。
4. 生成超过当前 SDK 预览上限的正文。首段和末段均可读；刷新后仍能补读全文。
5. 发送图片，点击用户气泡的缩略图打开完整预览，刷新后重复操作。缺失图片显示不可用状态；图片访问通过 Space 安全预览协议。
6. 在运行中追加队列输入、刷新、Stop，再发送新提示。队列只交付一次，结束的旧输入不重新冒出。
7. 浏览较早历史页，然后切换窗口焦点或等待后台刷新。保留正在读的旧页；点击返回最新后再显示当前 view。外部输入或 Rewind 使旧游标失效时重新取最新页，不拼接不同修订。
8. 使用 Ctrl+F 搜索当前窗口以外的历史，打开命中正文；校验长正文补读。Fork/Retry/Rewind 保留 SDK 边界，过期边界应拒绝并提示重载。
9. 制造 Provider 认证失败或可重试错误。SDK 错误只显示一次，保留 Provider 设置/重试及诊断信息。执行 Space 命令和工作流时，本地通知仍可见。
10. 删除会话或切换大量会话，确认对应输出缓存回收。Mock、Partner、Quick Ask 分别按各自执行范围回归。
11. 新建普通 Coder 会话但不发送，再切换会话或重启：不新增空历史。首条有效输入发送后应持久化；仅修改名称或设置不能提升其消息排序，旧空记录隐藏后原文件仍保留。
12. 在共享 Coder 查询 Space 使用方法，核对 `space_manual` 的草稿、排序、独立历史与退出说明。`kodax_manual` 仍提供 SDK/CLI 机制；退出说明使用当前 Product lifecycle，旧接口明确标为历史。
13. 在配置好的 Gemini 路由发送简短文本并允许 SDK 提供完整工具表。不得再出现 `relationship_scan.depth` 数字枚举的 TYPE_STRING 错误；该字段继续接受整数 1–3，不在 Space 改写工具 schema。此项真实 Provider 验收与隔离 HTTP E2E 分别记录。

自动化入口：`sdk-product-output.spec.ts`、`sdk-unified-contract.spec.ts`；Mock 图片兼容与启动分别见 `file-attachments.spec.ts`、`renderer-boot.spec.ts`。单元回归涵盖输入缺 turnId、附件正文不同、同 outputId 多块、历史冻结、缓存删除、旧游标失效、正文读取超时、错误诊断连接，以及快照捕获后到达的新 observer 帧不能被旧快照覆盖。

## alpha.12 候选适配（2026-11-02，未正式升级）

候选固定点、实际测试及未完成边界见 [适配清单](../releases/kodax-0.7.97-alpha.12-preparation.md)。此前 Alpha 版本验证记录保持历史含义。

1. 真实 Host：`node --import tsx e2e/alpha12-partner-host-acceptance.mjs`。隔离数据根，验证 builtin/.agents Skill、Partner Agent、实际 shell scope、无模型请求的交付工具及文件字节；只在精确独占 owner 与可停 preflight 后停止该测试 Host，并验证 shutdown receipt。
2. Coder 创建后切换 Agent/Coding/Script；空闲才允许，以 Host revision CAS 写入。其他窗口改设置或切换会话时拒绝旧选择，不把它重试覆盖新值。Partner 创建/恢复后的下一 Run 必须为 Agent。
3. 当前 Run 的模式、toolScope/modelToolScope、reasoning requested/sent 与会话选择分别观察；缺字段保持未知，子请求/旧 Run 不覆盖；verified:false 不是失败，缓存拒绝不逐轮 toast。
4. Partner 读/搜连接器在 Plan 可用；写入仍按权限和绑定检查。Root generic shell/write/subagent 保留；独立 Actor 不继承根专家连接器授权。连接器删除/撤销后不从旧 snapshot 复活。
5. 旧凭证 source 固定、环境变量消失、私有/共享冲突、存储临时失败、删除墓碑、改名和 CAS 冲突均不换账号；OAuth 拒绝 token 仅刷新同注册，不重放 generation POST。真实账户验证另记。
6. 修改配置后观察 application；活跃 Run 不被“已保存”说明覆盖。损坏配置、auth 或 pending input 保留原件并可重试，未知执行不重新提交。
7. 统计换代 cursor conflict 返回 reset，先替换第一页再按 ID/revision 更新；partial/issues 不隐藏。没有费用报价时不显示零价或账单金额。
8. 历史 Fork/Rewind/Retry 保留 canonical/nativeHistory 与原图/工具块；模型切到 text-only 后只拒绝新图片，不改旧历史；原件缺失不以 preview 冒充。首次历史加载独立于 Host ready，Issue 371 保持开放。
9. 两客户端同 profile/同存储根：A 退出保护 B；更新安装在 preflight 后出现新 Peer 时，个人清理成功不能当 Host 已停，不得继续替换程序文件。丢失退出响应查询原 requestId；不按锁年龄解除 fence。
10. 正式发布后安装 Registry 包并锁完整 integrity，再跑真实 Electron/ASAR 启动、手动更新、退出、沙箱显式激活和 Linux 自动回退。保留 Node/Electron ABI 串行检查。真实 Kylin/macOS/ARM 与外部服务不算当前离线通过项。

专家默认方法及消费时绑定的验收按 [SDK 交接](../releases/kodax-alpha12-partner-sdk-handoff.md) 执行，当前不能勾选完成；不以测试专用 `/coding` 进程内 fixtures 替代正式产品路径。

### alpha.12 准备阶段补充边界

- 断开 Space 连接而让共享 Host/其他客户端继续存活，追加本地 slash 通知只保留 Space side-store，不直接追加 SDK canonical 文件；删除应明确要求重连。
- Fork 后注入连接丢失及本地 metadata 保存失败，回滚不得改用独立文件 writer；无法核验删除则保留新 Session/附件并记录清理失败。
- 旧 Host 不兼容时，Partner/Coder 历史均终止轮询、显示实际原因；Host ready 后可重新获取历史，不以 ready 代替历史加载完成。
- 退出回执报告 replacementRunning 时不得安装更新。仅旧 owner 退出不代表替代 Host 已停止。
- Quick Ask 转正式会话暂缺 Host 公共 promotion/tag 接口：候选应提示不可用且保留会话，不能 saveSession 直写。SDK 补接口后需按 SDK 交接文档再验收，此项当前未通过产品闭环。

## Registry beta.1 专项（2026-11-03）

上方 alpha.12 记录保留原时点；默认方法、消费绑定和 Quick Ask 不再等待接口，当前验收见 [beta.1 记录](../releases/kodax-0.7.97-beta.1-integration.md)。

1. 核对 Root/Desktop/lockfile、物理安装与 ASAR 全部为正式 `0.7.97-beta.1`，无开发链接；实际 Host 声明 productExecutionBinding:1/sessionPromotion:1，旧 Host 遵守安全升级边界。
2. 普通 Partner 和全部 16 位当前专家走同一 Host Agent；第一次/连续输入默认 Skill、角色及原问题保留。显式 Skill 只改本轮方法，关闭默认方法只关方法；下一轮按保存的偏好工作，shell/write/子 Agent 继续受正常权限约束。
3. 保持一个 Run 活动，after-turn 排队后成功切换/移除专家或连接器；实际消费采用最后成功提交值。失败/未确认保存不改变 authority。禁用包、卸载 Skill 或撤销连接器后，失败队列保留 inputId 与原文，不自动删除、重试或切换账号。
4. 队列卡片显示阻断原因；显式取回返回完整长文本和附件。注入 Host→Main、Main→Renderer 响应丢失并重试，应读相同 withdrawn 事实且返回完整原文，不再次提交模型。旧队列缺完整恢复记录时原样保留并提示限制，不拿预览充当原文。
5. 重连/冷恢复保留原业务快照、persona、方法回执与 principal，重绑当前 lease 并收紧工具。新选专家不替换原 Run；无原证明旧 checkpoint 拒绝自动恢复。独立 Actor 不借用根专家连接器授权，同授权 steer 留在原 AMA Run，变化的授权拒绝。
6. Quick Ask 回答后 Continue in Coder：原 Session ID、历史/原生记录、附件、lineage 和统计保留，确认后才关闭浮层并加入侧栏。忙碌、冲突、丢响应和重启查询原 requestId；metadataRevision 变化后刷新分页边界，不能断言旧 history item ID 恒定。
7. Provider 配置并发改名/无关字段更新只见完整旧或新文件；锁忙保留 conflict/lock_busy 并有限重试，损坏保留 read_failed/原字节。磁盘/Windows 占用不重置账号、凭证或 CAS。原配置与 API_KEY 入口、私有/共享选择和撤销墓碑不变。
8. 复验 Agent/Coding/实验性 Script 的首次选择与安全空闲 CAS、普通问题等待/Skip、权限审批、估算进度、报告中性展示、工具原文分页、长历史滚动、手动更新/稳定通道、启动和退出恢复；SDK schema JSON 必须在成品中。Issue 371、真实外部账号与其他平台实机分别保留验证范围。
