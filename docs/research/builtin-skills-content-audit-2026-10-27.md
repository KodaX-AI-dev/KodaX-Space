# 内置技能内容是否需要调整，借鉴来源是否已有更新

> 审计前快照：本文的“当前”“尚未修改”及行号对应 Space `e3ba5893` / SDK `6d101b59`，保留为原始调查记录。后续 SDK 复审与 Space 内容实施状态见 [验证指南](../test-guides/FEATURE_135_0.1.47-alpha.3_TEST_GUIDE.md)。

结论摘要：已覆盖 Space 的 18 个内置技能、SDK 的 5 个核心技能及可选 Artifact 的 1 个技能，共 24 项。11 个 Space 借鉴技能可以追溯到 4 个上游仓库，7 个由 Space 本地维护；真正有技能内容更新的是 huashu-design、copywriting、customer-research、call-prep。应先修复 SDK 的命令白名单和评测脚本发布问题，再改进触发、流程及输出体验，选择性同步上游。当前只完成审计，未更新任何技能或来源配置。[来源清单](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills.sources.json) [完整清点及哈希](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-audit-inventory-2026-10-27.json)

## 范围与证据

- 核验日期为 2026-10-27，用户时区为 Asia/Shanghai。Space 基线为 `e3ba5893347e20b09d37f6ea95265daa375bacc3`，SDK 基线为 `6d101b599878ffd0e90fc79ddf24e8067d0379e5`；Space 实际依赖 SDK `0.7.97-alpha.9`。SDK 同时有其他线程的技能错误分类修复，本文没有修改该工作区。[清点快照](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-audit-inventory-2026-10-27.json)
- 24 项入口正文逐项审读；关键支持文件、文件引用和执行契约作定向核对，不声称完成全部模板、媒体和脚本实现的逐行审计。Space 18 个入口中明确的 Markdown 相对链接未发现目标文件缺失；这不证明所有脚本可执行。SDK 的发布脚本另有明确缺失，见下文。[SDK 与本地技能审计](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-sdk-firstparty-audit-2026-10-27.md)
- 内容判断采用 `writing-great-skills` 的触发、渐进披露、重复和完成判据方法。用户已确认的产品方向是默认允许自然语言选择合适技能，执行范围继续遵循用户和项目要求；本文不建议按 Coder/Partner 名称整体禁用技能。[审计方法](/C:/Users/ADMIN/.agents/skills/writing-great-skills/SKILL.md)
- 上游只核对第一方仓库、不可变提交、完整 Git tree、正文及补丁；没有运行模型效果评测，也没有执行技能自带脚本或使用付费模型。已经实测的技术问题与尚需行为评测的内容建议在下文分开表述。[设计来源核对](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-design-2026-10-27.md) [业务来源核对](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-business-2026-10-27.md)

## 来源及真正需要考虑的更新

| 来源 | 对应技能 | 本地固定版本 | 核验结果与同步建议 |
|---|---|---|---|
| [zarazhangrui/frontend-slides](https://github.com/zarazhangrui/frontend-slides) | frontend-slides | `9906a34d640d2111f724544cbc50f7f130569ae1` | 上游 HEAD 与 pin 相同，80 个本地文件逐 blob 一致；没有新版本可同步，但仍需要 Space 体验适配。 |
| [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design) | huashu-design | `c9b06710b057a45fe6165e52aa8690f55182ea13` | HEAD 为 `4fc7bfdb`，已有 v3.0.0 正文更新；建议评估模块化、真实参考板、验证和 PPTX 路径，重做本地补丁。 |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | copywriting、customer-research | `5b2c0007766c6a1cf1d53fd8fc73e979e0821022` | HEAD 为 `17772c7a80b7b8c7a47af30f648374cd8bd8adc5`；copywriting 2.0.2→2.3.1，customer-research 2.0.2→2.0.4，均有正文和支持文件变化。 |
| [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins) | process-doc、draft-response、knowledge-synthesis、status-report、call-prep、interview-prep、onboarding | `1f517b9de47e827c80cd933ed364e16838072239` | HEAD 为 `c75fda00ff0e41c8ee331ae312c8a07f1967653b`；只有 call-prep 目录变化，其余 6 项完整目录不变。 |
| Space 本地源 | feishu-office-suite 和 6 个 partner-* | `resources/first-party-skills/` | 可以确认本地维护源，未据名称或内容相似性推断额外外部来源；没有统一的第三方“最新版”可直接升级。 |

上表依据清单和两端完整目录 blob 比对，而非仓库最后提交日期。完整 SHA、提交时间、目录 tree SHA、许可证及本地补丁映射见两份来源笔记；仓库 HEAD 更新不等于每个技能都有更新。[设计证据](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-design-2026-10-27.md) [业务证据](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-business-2026-10-27.md)

四项更新各有保留价值：

1. **customer-research：优先选择性同步。** 新增把评论、页面和社区帖视为不可信资料的规则；保留 Space 现有参与者去重、事实与假设区分，以及不按固定样本数认定代表性的约束。[新版正文](https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/SKILL.md#L10-L12) [本地补丁](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skill-patches/customer-research-space-adaptation.patch)
2. **copywriting：正文和 reference 配套审阅后同步。** 新版区分空白简报、保留作者声音和局部编辑，加入更好的主张检查及去套话参考；保留 Space 的按需长度与事实校验，不恢复缺少原始研究链接的转化率数字。[新版正文](https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L42-L77) [本地补丁](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skill-patches/copywriting-space-adaptation.patch)
3. **call-prep：移植证据方法。** 新版改进逐条来源、读取完整邮件、区分未查询与无记录、处理已过期会议；Claude、Gong、Pages 等宿主专属流程需要映射到 Space 实际能力。[新版正文](https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/sales/skills/call-prep/SKILL.md)
4. **huashu-design：按一次内容迁移处理。** 新版有实质功能与结构变化，但也加入更多方向选择、本机学习及可选云能力；应保留现有去水印、去推广、可移植性改动。不能直接覆盖安装包资源或让技能自行拉取上游。[版本与差异证据](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-design-2026-10-27.md)

补丁复核结论：有更新的这 4 项都需要重新处理至少一份现有补丁；6 项未变化的 Anthropic 技能仍能应用现有补丁。已按同步器的 `--unidiff-zero` 等选项核对。现有许可证文件在 pin 与 HEAD 间未变化，但新版新增借鉴内容、脚本和资源仍应保留各自归属说明。[同步器](/C:/Works/GitProj/KodaX-AI/KodaX-Space/scripts/sync-builtin-skills.mjs:463) [设计补丁证据](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-design-2026-10-27.md) [业务补丁证据](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-business-2026-10-27.md)

## 先处理的兼容性问题

### SDK 的命令白名单与运行时语法不一致

四个核心技能使用 `Bash(git:*, gh:*)` 或 `Bash(npm:*, node:*, npx:*)` 等声明，运行时却把模式当作原始命令字符串的 glob，冒号并不会转成命令前缀分隔。真实策略回调已验证下列 4 次均返回 `[Blocked]`，没有执行任何 shell 命令：[运行时匹配器](/C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/skill-invocation-policy.ts:84) [诊断脚本](/C:/Users/ADMIN/AppData/Local/Temp/space-skills-audit-hqAAVQ/policy-probe.mts)

| 技能 | 正常工作所需命令 | 本次策略返回 |
|---|---|---|
| git-workflow | `git status --short` | 被该技能的 allowed-tools 拦截 |
| tdd | `npm test` | 被该技能的 allowed-tools 拦截 |
| code-review | `git diff --stat` | 被拦截；它还另缺少 Git 只读规则 |
| skill-creator | `node scripts/run-eval.js --help` | 被该技能的 allowed-tools 拦截 |

建议 SDK 确认并统一唯一受支持的声明语法，随之修正内置技能，显式覆盖带参数命令、边界匹配和拒绝越界命令。code-review 应有审查所需的只读 Git 能力。修复仍与宿主实际授权组合；不要通过改写 shell 命令绕过策略。这个问题属于可执行契约不一致，单纯开启模型调用不会解决。[逐项证据与建议](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-sdk-firstparty-audit-2026-10-27.md)

### skill-creator 的发布脚本引用缺失模块

`run-eval.js` 静态导入 `../../../skill-expander.js` 与 `../../../skill-loader.js`，但在 Space 实际安装的 SDK 发布布局中，解析到的目标不存在。正文承诺的完整评测链不能只靠文案保证，应在发布包上核验脚本入口、支持文件和 SDK 导入。该项是文件解析核对，没有执行评测脚本或调用付费模型。[脚本源码](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/run-eval.js:6) [发布包核对](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-sdk-firstparty-audit-2026-10-27.md)

## 客户体验与内容改进

### 设计流程应服从客户已经给出的范围

- **huashu-design 的指令相互冲突。** 正文把“直接做”列作跳过三方向的豁免，异常表又说它不构成豁免；正文一次最多 3 问，参考工作流却要求至少 10 问且一次列完；方向选择后还有后续停轮审批。应合并成一套规则，复用已知信息，明确客户何时已经作出选择。[豁免](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/huashu-design/SKILL.md:189) [异常表](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/huashu-design/SKILL.md:392) [正文澄清](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/huashu-design/SKILL.md:205) [参考文件](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/huashu-design/references/workflow.md:7)
- **frontend-slides 对新稿固定询问四项、生成三份风格预览。** 适合视觉探索，但用户已指定风格、内容、页数或只想快速交付时应允许直做。保留“编辑现有稿件”分支及视觉验证，不重复完整访谈。[提问](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/frontend-slides/SKILL.md:89) [预览](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/frontend-slides/SKILL.md:134)
- **先按交付格式分流。** frontend-slides 的输出是 HTML，huashu-design 本地正文默认偏 HTML/PDF，可选 Artifact 则提供 PPTX。用户请求可编辑 PPTX 时，应采用实际可提供该格式的路径，既有 HTML 稿才交给 HTML 增强流程。[HTML 交付](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/frontend-slides/SKILL.md:242) [huashu 格式规则](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/huashu-design/SKILL.md:316) [Artifact 方法](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/skills/artifact-review/SKILL.md:5)

### 跨平台能力与在线依赖需要写清

frontend-slides 正文包含 macOS 的 `open`、`brew`，以及 Bash、Python、npx 和浏览器下载流程；对 Space Windows 客户不能默认这些入口都可用。建议经宿主可用能力打开、渲染和导出，缺少依赖时明确缺口；对离线交付提供字体和资源策略。它同时要求单文件自包含与外部字体，需说明交付是否仍依赖网络。[字体规则](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/frontend-slides/SKILL.md:242) [打开文件](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/frontend-slides/SKILL.md:264) [部署与导出](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/frontend-slides/SKILL.md:289)

正文还对 Vercel 作“不会收费”的笼统保证，应改成根据客户现有计划与实时官方说明处理；官方 Hobby 文档明确该计划面向非商业个人用途，不能泛化成所有客户演示的免费部署承诺。分享和部署保持用户实际请求驱动。[本地表述](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/frontend-slides/SKILL.md:315) [官方 Hobby 说明](https://vercel.com/docs/plans/hobby#hobby-billing-cycle)

### 业务技能已有有效适配，适合精简并消除拉扯

现有补丁已补充事实、承诺、缺少工具及按需篇幅等边界，不能因为原正文有强模板就宣称这些边界完全缺失。改进重点是让正文和示例服从同一规则，而不是继续在开头追加更多补丁式禁令。[本地适配](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skill-patches)

- draft-response 开头要求只使用已确认承诺，后文仍给固定跟进频率和带负责人/时间线的通用要求；将这些内容降为“用户有既定安排时”的参考，默认优先输出可直接发送的正文。[已有限制](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/draft-response/SKILL.md:13) [跟进表](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/draft-response/SKILL.md:265)
- knowledge-synthesis 已要求按生效状态和范围评估来源，后文仍有按月龄、文件类别划分置信度的固定表。应以主张、来源独立性、正式效力与适用日期共同判断，并按问题压缩资料，不因只有 1–5 个结果就全部展示。[已有限制](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/knowledge-synthesis/SKILL.md:12) [时效表](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/knowledge-synthesis/SKILL.md:114) [小结果集](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills/knowledge-synthesis/SKILL.md:175)
- copywriting 与 customer-research 的 description 分别有 753、953 字符，许多同义触发和可选交接可移入按需参考；保留“写作/局部编辑/客户研究”等真正不同分支。压缩描述的收益是降低重复候选和误匹配，不是缩减技能能力。[描述及长度清点](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-audit-inventory-2026-10-27.json)
- 六个 partner-* 方法很短，宜继续自然语言触发；与业务专用技能按任务分工，例如通用商务沟通与客户支持回复、项目规划与状态汇报、专题研究与资料综合。专家使用方法不额外赋予工具权限，也不需要按 surface 名字一刀切隐藏。[本地方法源](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills) [逐项审计](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-sdk-firstparty-audit-2026-10-27.md)

以上是静态内容与契约审计，不是模型已在客户任务中违反规则的实测结论。功能阻断有策略回调或文件解析证据；提问次数、篇幅和措辞效果仍需后续场景对照验证。

## 24 项逐项处理建议

下表的行数是当前入口文件行数，不含支持文件；用于衡量披露负担，不以长短代替质量判断。[清点与哈希](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-audit-inventory-2026-10-27.json)

| 技能 | 行数 | 建议 |
|---|---:|---|
| huashu-design | 522 | 优先统一提问、方向选择、批准与格式规则；评估 3.0 的模块化及验证能力，迁移去水印等补丁。 |
| frontend-slides | 380 | 无上游更新；本地补按需提问/直做、Windows 入口、输出格式、离线资源及部署说明。 |
| copywriting | 269 | 选择性升级 2.3.1，保留作者声音及局部编辑；精简描述，保留事实和按需输出适配。 |
| customer-research | 316 | 优先吸收 2.0.4 的不可信数据规则；保持参与者去重及样本边界，精简描述。 |
| call-prep | 264 | 移植来源追踪、完整线程和会议状态处理；按已提供背景直接交付适量简报。 |
| draft-response | 300 | 无上游更新；精简长篇通用文风条目，消除跟进时间及承诺规则拉扯，优先正文。 |
| knowledge-synthesis | 266 | 无上游更新；改掉按时间/文件类别机械评分，按主张追溯来源并控制输出。 |
| process-doc | 85 | 保留现行与建议流程区分、正常/异常路径核验；完整 SOP 和 RACI 按请求展开。 |
| status-report | 77 | 保留指标口径和开发/验收/上线区分；小结请求不强制完整周报及红黄绿矩阵。 |
| interview-prep | 45 | 简单题目请求不扩成完整面试套件；依岗位/时长裁剪并保留证据评分。 |
| onboarding | 110 | 保留计划与已执行区分；固定首日日程降为示例，按角色、时区和现有制度裁剪。 |
| feishu-office-suite | 30 | 保留真实类型化工具和回执；触发与选中专家、实际支持的资源/操作对齐。 |
| partner-product-management | 32 | 保留证据到需求的短流程；明确直接给方案和确有缺口时提问的边界。 |
| partner-project-management | 16 | 保留目标、依赖、责任与完成条件；与状态汇报技能分工，无需大改。 |
| partner-deep-research | 28 | 保留来源、事实/推断和冲突处理；与知识综合区分研究取证和已有材料整理。 |
| partner-data-analysis | 16 | 保留粒度、单位、清洗及可复核计算；交付绑定实际可用分析/图表能力。 |
| partner-meeting-minutes | 16 | 保留讨论/提案/决定/行动项区分；后续问题只补关键缺口，无需大改。 |
| partner-business-communication | 16 | 保留事实与承诺边界；普通沟通用此方法，客户支持长回复再用 draft-response。 |
| code-review | 82 | 修复命令白名单，补只读 Git；保持证据与行号，不强制英文段名。 |
| git-workflow | 84 | 开放自然语言调用，修复白名单；操作范围与用户授权一致。 |
| tdd | 56 | 开放自然语言调用，修复白名单；按项目要求和任务规模选测试，不固定三段技术汇报。 |
| skill-creator | 127 | 修复发布脚本导入和命令白名单；最小创建与评测优化分支按需披露。 |
| visual-review | 80 | 保留实际渲染证据；按当前能力验证，缺少渲染能力如实说明。 |
| artifact-review | 16 | 保留可选 Artifact/PPTX 流程；与 visual-review 分别负责具体工具配方及通用视觉验收。 |

SDK 核心正文与 Space 已安装副本在规范化换行后无实质差异，不能把 CRLF/LF 差异误报成新版本；本地维护的 7 项源与分发副本一致。[对比证据](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-sdk-firstparty-audit-2026-10-27.md)

## 建议的实施顺序与验证

1. SDK 先处理可执行契约、发布包脚本和 git-workflow/tdd 的自动调用，再由 Space 升级消费。用真实加载后的策略检验正常命令与拒绝边界；发布包验证静态入口和支持文件，不用付费模型才能发现这些问题。[SDK 证据](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-sdk-firstparty-audit-2026-10-27.md)
2. Space 先统一两套设计技能的输出格式、直接交付与方向探索规则，再选择性同步 4 项上游变化。第一方源、第三方 patch、manifest 和 lock 应一起维护，保持现有同步器可重建。[同步器](/C:/Works/GitProj/KodaX-AI/KodaX-Space/scripts/sync-builtin-skills.mjs:450)
3. 用短请求、已有上下文、明确格式、无连接器、资料冲突和后续局部修改等场景核对触发与交付；不要只检查关键词或 Markdown 标题。涉及模型输出质量时，遵循仓库 eval 规则区分脚本可执行性与内容质量，不将静态审计描述为已证明质量提升。[评测要求](/C:/Works/GitProj/KodaX-AI/KodaX/benchmark/EVAL_GUIDELINES.md)

## 未证实与未解问题

- Space 7 项本地源的更早外部借鉴若没有明确记录，本次不作推定；SDK 内置内容可核对本地提交与公开来源说明，完整来源限制见附录。[来源限制](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-sdk-firstparty-audit-2026-10-27.md)
- 尚未做修改后的模型输出对照、完整脚本执行、跨平台视觉验收或连接器端到端验收，无法声称所有建议都会提高实际质量。
- huashu-design 保持现有强流程后仅显式调用，还是修改流程后开放自动调用，仍需产品决定；此处不替用户更改选择。
- 新版营销技能涉及更深一层借鉴来源及设计技能的新增本机记忆/可选云能力，应在实际引入对应内容时逐项确定范围，而不是因上游更新全部启用。[业务来源限制](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-business-2026-10-27.md) [设计来源限制](/C:/Works/GitProj/KodaX-AI/KodaX-Space/docs/research/builtin-skills-upstream-design-2026-10-27.md)
