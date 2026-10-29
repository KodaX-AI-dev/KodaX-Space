# Space 内置的 9 项业务技能来自哪里，上游更新是否值得同步？

> 审计前快照：本文的“当前”“尚未修改”及行号对应 Space `e3ba5893` / SDK `6d101b59`，保留为原始调查记录。后续 SDK 复审与 Space 内容实施状态见 [验证指南](../test-guides/FEATURE_135_0.1.47-alpha.3_TEST_GUIDE.md)。

TL;DR：这 9 项来自 `coreyhaines31/marketingskills` 与 `anthropics/knowledge-work-plugins`；截至 2026-10-27，实际技能目录发生变化的只有 `copywriting`、`customer-research`、`call-prep`，其余 6 项没有内容更新。建议选择性移植前 3 项的证据与写作改进，保留 Space 适配；3 项现有补丁在最新源文件上均无法直接应用。[来源清单][space-manifest-marketing] [来源清单][space-manifest-anthropic] [营销 pin tree][marketing-pin-tree] [营销 HEAD tree][marketing-head-tree] [Anthropic pin tree][anthropic-pin-tree] [Anthropic HEAD tree][anthropic-head-tree]

## 核对边界与方法

- 本文只核对清单中的 9 项第三方业务技能。Space 的基线为本地提交 `e3ba5893347e20b09d37f6ea95265daa375bacc3`，来源清单、补丁及已安装技能目录均无相对该提交的改动；9 项都声明了 Space 适配补丁。[营销来源及补丁声明][space-manifest-marketing] [Anthropic 来源及补丁声明][space-manifest-anthropic]
- 2026-10-27 09:17:48–09:17:53 UTC（北京时间 17:17）通过 GitHub 第一方 REST API 读取默认分支及 HEAD，再以完整提交 SHA 读取两端 recursive Git trees；两个仓库两端的 tree 响应均为 `truncated: false`。判定以技能子目录全部 blob 路径及 SHA 为准，仓库新增提交数量不作为技能更新结论。[营销仓库元数据](https://api.github.com/repos/coreyhaines31/marketingskills) [Anthropic 仓库元数据](https://api.github.com/repos/anthropics/knowledge-work-plugins) [营销 pin tree][marketing-pin-tree] [营销 HEAD tree][marketing-head-tree] [Anthropic pin tree][anthropic-pin-tree] [Anthropic HEAD tree][anthropic-head-tree]
- 内容核对同时比较 `SKILL.md`、支持文件及 manifest 指定的 LICENSE；将上游文件下载到系统临时目录作文本 diff，并仅在临时副本中检查补丁。补丁检查已按同步器的实际选项复核：`git apply --check --unidiff-zero --whitespace=nowarn --directory=<相对目标目录> <补丁绝对路径>`。下文结果是本次观测，源文件与补丁的不可变链接列在相应条目；未修改来源清单、锁文件、技能或补丁，也未执行远程源码。[同步器 L463–474][space-sync-patch]

## 仓库 HEAD 与技能更新要分开

| 仓库 / 默认分支 | Space 固定提交及 committer 时间（UTC） | 本次 HEAD 及 committer 时间（UTC） | 固定版本到 HEAD |
|---|---|---|---|
| `coreyhaines31/marketingskills` / `main` | [`5b2c0007766c6a1cf1d53fd8fc73e979e0821022`](https://api.github.com/repos/coreyhaines31/marketingskills/commits/5b2c0007766c6a1cf1d53fd8fc73e979e0821022)，2026-09-05 04:48:02 | [`17772c7a80b7b8c7a47af30f648374cd8bd8adc5`](https://api.github.com/repos/coreyhaines31/marketingskills/commits/17772c7a80b7b8c7a47af30f648374cd8bd8adc5)，2026-10-26 19:16:42 | `ahead`，836 commits；本文覆盖的 2 项均有目录内容更新。[compare](https://api.github.com/repos/coreyhaines31/marketingskills/compare/5b2c0007766c6a1cf1d53fd8fc73e979e0821022...17772c7a80b7b8c7a47af30f648374cd8bd8adc5) [两端 trees][marketing-pin-tree] [HEAD tree][marketing-head-tree] |
| `anthropics/knowledge-work-plugins` / `main` | [`1f517b9de47e827c80cd933ed364e16838072239`](https://api.github.com/repos/anthropics/knowledge-work-plugins/commits/1f517b9de47e827c80cd933ed364e16838072239)，2026-09-04 20:32:34 | [`c75fda00ff0e41c8ee331ae312c8a07f1967653b`](https://api.github.com/repos/anthropics/knowledge-work-plugins/commits/c75fda00ff0e41c8ee331ae312c8a07f1967653b)，2026-10-27 00:20:46 | `ahead`，318 commits；本文覆盖的 7 项只有 `call-prep` 有目录内容更新。[compare](https://api.github.com/repos/anthropics/knowledge-work-plugins/compare/1f517b9de47e827c80cd933ed364e16838072239...c75fda00ff0e41c8ee331ae312c8a07f1967653b) [两端 trees][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] |

下面的“支持文件”不含从仓库其他位置单独复制的 LICENSE。营销技能的 `evals/**` 被当前 manifest 排除，因此其更新与实际分发内容分开计算。[排除规则][space-manifest-marketing]

| 本地技能 → 上游目录 | `SKILL.md` | 支持文件 | 本次同步判断（研究建议） |
|---|---|---|---|
| `copywriting` → `skills/copywriting` | 变化：版本 2.0.2 → 2.3.1。[pin][copy-pin] [HEAD][copy-head] | 新增 `references/ai-tells.md`；修改 `copy-frameworks.md`、`natural-transitions.md`；另修改被排除的 `evals/evals.json`。[pin tree][marketing-pin-tree] [HEAD tree][marketing-head-tree] | 值得选择性升级；正文与 3 个 reference 一并审阅，重做补丁。 |
| `customer-research` → `skills/customer-research` | 变化：版本 2.0.2 → 2.0.4。[pin][research-pin] [HEAD][research-head] | 仅 `references/source-guides.md` 变化；`references/interviews-and-surveys.md` 与 `evals/evals.json` 的 blob 不变。[pin tree][marketing-pin-tree] [HEAD tree][marketing-head-tree] | 优先吸收不可信外部资料规则，改动较小；保留 Space 样本与事实约束。 |
| `process-doc` → `operations/skills/process-doc` | 不变。[pin][process-pin] [HEAD][process-head] | 两端目录都只有 `SKILL.md`。[pin tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] | 无新内容可同步。 |
| `draft-response` → `customer-support/skills/draft-response` | 不变。[pin][draft-pin] [HEAD][draft-head] | 两端目录都只有 `SKILL.md`。[pin tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] | 无新内容可同步。 |
| `knowledge-synthesis` → `enterprise-search/skills/knowledge-synthesis` | 不变。[pin][synthesis-pin] [HEAD][synthesis-head] | 两端目录都只有 `SKILL.md`。[pin tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] | 无新内容可同步。 |
| `status-report` → `operations/skills/status-report` | 不变。[pin][status-pin] [HEAD][status-head] | 两端目录都只有 `SKILL.md`。[pin tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] | 无新内容可同步。 |
| `call-prep` → `sales/skills/call-prep` | 变化：主体从 258 行改为 112 行，无 frontmatter 版本字段。[pin][call-pin] [HEAD][call-head] | 两端目录都只有 `SKILL.md`。[pin tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] | 内容价值高、宿主耦合也高；抽取方法，避免整份替换。 |
| `interview-prep` → `human-resources/skills/interview-prep` | 不变。[pin][interview-pin] [HEAD][interview-head] | 两端目录都只有 `SKILL.md`。[pin tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] | 无新内容可同步。 |
| `onboarding` → `human-resources/skills/onboarding` | 不变。[pin][onboarding-pin] [HEAD][onboarding-head] | 两端目录都只有 `SKILL.md`。[pin tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree] | 无新内容可同步。 |

9 项原路径在 HEAD 中均存在，没有目录迁移或删除。另有同名技能不等于来源迁移：例如 Anthropic HEAD 中的 `partner-built/common-room/skills/call-prep` 与本项目采用的 `sales/skills/call-prep` 并存，`marketingskills/skills/onboarding` 也不是本项目 `onboarding` 的来源。[两端营销 trees][marketing-pin-tree] [营销 HEAD tree][marketing-head-tree] [两端 Anthropic trees][anthropic-pin-tree] [Anthropic HEAD tree][anthropic-head-tree] [本地路由][space-manifest-anthropic]

## 3 项实际更新的内容与取舍

### copywriting：更精准地编辑、更少套话，仍需保留 Space 事实检查

- 新增 3 种输入诊断：空白简报、已有真实作者声音、局部编辑；已有声音要保留其论点和用词，局部编辑只改指定范围。新增拆分单元起草、可证实性检查、竞争者替换测试及“没有理由就撤销改动”。这些直接补足“用户只改一行却重写整页”的行为边界，建议吸收；是否显示诊断过程仍服从用户要的交付物。[HEAD `SKILL.md` L42–77][copy-diagnosis] [Space 输出范围适配][space-copy-patch]
- 新增“主张必须有依据；不支持的主张要给出可支持替代表述及补证路径”；新增检查产品上下文的 Learnings，避免把已试过的角度重新提作新建议。建议保留这些方法，但上下文文件只在当前工作范围存在时读取，不能假定 Space 内置该营销知识文件。[HEAD `SKILL.md` L14–16][copy-learnings] [L101–108][copy-claims] [Space 运行适配][space-copy-patch]
- 新增完整 `references/ai-tells.md`，并将正文及另两个 reference 对齐到该检查表：避免反转句式、否定清单、自问自答、空泛短语及反复工整的节奏；同时要求不为“更具体”而编造数字和经历。建议作为风格参考随正文一并引入，按用户语言、品牌样稿及交付长度裁剪，不能把英语禁词表当作事实或效果保证。[HEAD `SKILL.md` L136–161][copy-ai] [新增 reference L239–291][copy-ai-reference] [更新后的框架文件][copy-frameworks] [更新后的过渡语文件][copy-transitions]
- 不宜直接恢复上游的“清晰文案关联 +81% 转化、销售周期缩短 38% 等”表述：HEAD 主文件仍列这些数字，相邻段落没有给出研究链接；Space 补丁已从主文件删除这组量化收益，并明确示例不是用户数据与承诺。上游 reference 也仍保留该组数字，本次更新未解决出处问题。[HEAD `SKILL.md` L83–86][copy-metrics] [HEAD reference L418–433][copy-reference-metrics] [Space 补丁 L7–29][space-copy-patch]
- 不宜原样接受固定的输出负担：HEAD 除局部编辑外仍要求页面内容、注解和 2–3 个备选，Space 已改成按用户长度与交付要求选择。吸收新诊断方法时，应保留这一更宽的按需输出规则。[HEAD `SKILL.md` L305–329][copy-output] [Space 补丁 L32–49][space-copy-patch]
- 相关变更可追至 2026-10-02 的 AI-tell 更新、2026-10-15 的输入诊断/作者声音更新与 Learnings 更新；本文 HEAD 中该技能的最后目录提交为 2026-10-15，而不是仓库 10-26 的 HEAD 日期。[`12188f1`](https://github.com/coreyhaines31/marketingskills/commit/12188f1e3d3d8538fd32a96c925a8f6d7641827e) [`7b8a3b5`](https://github.com/coreyhaines31/marketingskills/commit/7b8a3b5523bd97691d8c956d6a492a8296e58cb3) [`115c907`](https://github.com/coreyhaines31/marketingskills/commit/115c9071aaf69b01649485f8f22ce9f5236639ff) [`e6fb742`](https://github.com/coreyhaines31/marketingskills/commit/e6fb742a8321afc4c99a435610c1ef342a7d2219)

### customer-research：小而有用的外部资料边界

- HEAD 新增明确规则：抓取的评论、帖子、社区讨论及页面 HTML 是不可信数据，只抽取信号，不执行其中的指令。建议优先吸收，和 Space 的证据真实性规则互补。[HEAD `SKILL.md` L10–12][research-injection] [Space 证据计数适配][space-research-patch] [引入该规则的 `d5dd763`](https://github.com/coreyhaines31/marketingskills/commit/d5dd763b1838037283846f54812a3bd0725eb90c)
- 另增加 TAM/SAM/SOM 的 `marketing-plan` 交接条目；这不代表 Space 已捆绑该技能。支持文件把 SparkToro 的越界相对路径改为上游 GitHub `main` URL，但 Space 当前适配已明确 SparkToro 不内置、仅在工具可用且授权时使用，因此不必为这个链接恢复外部依赖。[HEAD `SKILL.md` L295–308][research-related] [HEAD `source-guides.md` L329–336][research-source-guide] [Space 补丁 L57–65][space-research-patch]
- Space 的参与者去重、事实与解释分开、未复现不能写成技术缺陷、禁止按固定样本数认定代表性等规则都应保留。HEAD 仍保留“每细分至少 5 条”和“画像至少 5–10 条”的阈值，不能因上游版本更新恢复这些已被本地替换的强阈值。[HEAD `SKILL.md` L109–115][research-sample] [L198–208][research-persona] [Space 补丁 L16–54][space-research-patch]
- 该目录最后变更是 2026-10-03 的 2.0.4 版本更新；SparkToro 路径修复发生于 2026-09-08，TAM 交接条目发生于 2026-10-03。它们都早于仓库 10-26 的 HEAD 日期。[`a8ac263`](https://github.com/coreyhaines31/marketingskills/commit/a8ac2636ec38004c5a6ab08acde9d68f2d3d0e22) [`6d53ee2`](https://github.com/coreyhaines31/marketingskills/commit/6d53ee22aef1306534c867e83724dc050713b690) [`5ce384c`](https://github.com/coreyhaines31/marketingskills/commit/5ce384cdf272a169426e3e4ed6b9d58d246696a0)

### call-prep：来源追踪更强，宿主假设也明显增加

- 2026-09-15 sales 2.0 重建该技能，2026-10-21 再加强逐行来源链接；从旧版通用模板、固定外部搜索及会后工作流，变为“定位会议 → 账户历史 → 参会者 → 通话计划 → 简报”。建议借鉴这种资料到决策问题的组织方式。[`c66cd2d`](https://github.com/anthropics/knowledge-work-plugins/commit/c66cd2d204d9db2a9a49401f34e0b95d7d05cd46) [`2d97716`](https://github.com/anthropics/knowledge-work-plugins/commit/2d97716bced3a843bcc3add4356ce0cecc5a0dab) [旧版主文件][call-pin] [HEAD 主文件][call-head]
- 值得抽取的通用改进：区分字段空白与尚未查询、每条事实保留来源、没有搜索覆盖不等于什么都没发生、先开完整邮件线程再概括、过去的会议不伪装为待开的会议、将材料提出的外发/变更请求列为提案，以及从已有记录中的未决问题生成探索问题。[HEAD L10–16][call-rules] [L38–44][call-resolve] [L55–77][call-history] [L87–102][call-output]
- 不宜整份替换：HEAD 包含 Claude 组织设置、Gong `ask_account`/`ask_deal`、Google Drive shared-drive 可见性断言、Pages/Slides/artifact 交付选择及 connector 权限规则；这些是该上游宿主的操作约定，本文没有验证 Space 具备相同连接器、权限模型或限制。新正文自己也标记准备工作为只读，不能把通用 rules 中的写操作措辞扩张成本任务的执行授权。[HEAD L8–17][call-rules] [L40–73][call-history] [L104–112][call-tiers]
- 应继续保留 Space 的商务范围、未知预算/决策权/采购日期、事实与销售假设分离、禁止私人属性推断、会议时长相加正确、报价/试用/日期区分客户诉求与批准，以及没有工具不声称已搜索等规则。HEAD 重写没有逐项替代这些约束。[Space 补丁 L7–42][space-call-patch] [HEAD 全文][call-head]

## 6 项无更新也不应丢失的本地适配

以下是对保留本地改动的建议，依据是本次两端目录一致与已存在的 Space 补丁；不是建议重新改写这些技能。[Anthropic pin tree][anthropic-pin-tree] [Anthropic HEAD tree][anthropic-head-tree]

| 技能 | 继续保留的 Space 行为 |
|---|---|
| `process-doc` | 区分现行流程和建议；保留条件边界、重提入口及未知审批规则；正常和例外路径检查；不把连接器占位符视为实际能力。[补丁 L7–45][space-process-patch] |
| `draft-response` | 只写已核实状态和已授权承诺；不捏造已升级、已退款、主动跟进；客户正文与内部说明分开；避免套用预填完成状态模板。[补丁 L7–13、L217–219][space-draft-patch] |
| `knowledge-synthesis` | 同源转载只算一条证据链；政策效力不能由文档类型或新旧替代；保留冲突；不假称建立永久索引。另保留去除 `user-invocable: false` 的本地元数据适配。[补丁 L3–16][space-synthesis-patch] |
| `status-report` | 区分开发、验收、上线；完成率给分子/分母；预算比例不等于加权进度；没有基准不捏造趋势、红黄绿标准与公司风险矩阵。[补丁 L7–49][space-status-patch] |
| `interview-prep` | 岗位能力与行为证据评分；无回答不评分；不以无关个人属性筛选；不虚构面试委员会、审批或面试形式。[补丁 L7–13][space-interview-patch] |
| `onboarding` | 核对日期/工作日/时区；日程和账号计划不写成已执行；最小权限；不虚构公司制度、导师或生产权限承诺。[补丁 L7–33][space-onboarding-patch] |

## 补丁与本地内容的复核结果

本次把 pin 和 HEAD 的技能目录分别复制到临时目录，用 manifest 中的原始补丁检查。首次普通 `--check` 后，已在原始临时快照上对 9 项的 pin、HEAD 全部按同步器实际选项重新核验：`git apply --check --unidiff-zero --whitespace=nowarn --directory=<相对于临时根目录的技能目录> <补丁绝对路径>`，命令工作目录为临时快照根目录。结果仍为 pin 全通过、HEAD 仅下列 3 项失败，失败位置也一致；结论不是遗漏 `--unidiff-zero` 所致。[同步器 L463–474][space-sync-patch]

另在 pin 临时副本实际套用补丁后，与本地分发文件逐项比较文本（仅规范化 CRLF/LF，按 manifest 排除 `evals/**`，LICENSE 另行校验）。9 项本地文本都与“固定源 + 声明补丁”一致，文件集合也相同；没有发现未记录的正文漂移。来源声明和补丁可由下面的不可变链接复核。[来源声明][space-manifest-marketing] [来源声明][space-manifest-anthropic]

| 技能 | pin 上 `--check` | HEAD 上 `--check` | HEAD 失败位置 / 相关补丁 |
|---|---|---|---|
| `copywriting` | 通过 | 失败 | `SKILL.md:41`；清晰文案段落及输出格式周边已改变。[补丁][space-copy-patch] [HEAD][copy-head] |
| `customer-research` | 通过 | 失败 | `SKILL.md:7`、`references/source-guides.md:333`；顶部新增规则、SparkToro 链接上下文改变。[补丁][space-research-patch] [HEAD][research-head] [支持文件][research-source-guide] |
| `process-doc` | 通过 | 通过 | 无上游目录变化。[补丁][space-process-patch] [HEAD][process-head] |
| `draft-response` | 通过 | 通过 | 无上游目录变化。[补丁][space-draft-patch] [HEAD][draft-head] |
| `knowledge-synthesis` | 通过 | 通过 | 无上游目录变化。[补丁][space-synthesis-patch] [HEAD][synthesis-head] |
| `status-report` | 通过 | 通过 | 无上游目录变化。[补丁][space-status-patch] [HEAD][status-head] |
| `call-prep` | 通过 | 失败 | `SKILL.md:3`；描述、开头及主体均被重写。[补丁][space-call-patch] [HEAD][call-head] |
| `interview-prep` | 通过 | 通过 | 无上游目录变化。[补丁][space-interview-patch] [HEAD][interview-head] |
| `onboarding` | 通过 | 通过 | 无上游目录变化。[补丁][space-onboarding-patch] [HEAD][onboarding-head] |

因此，仅提升 manifest 中的 ref 不是本次可直接采用的同步方式：3 项必须重做补丁；建议先选择要引入的内容，再重放所有本地适配，并以短文案、少量研究材料、无连接器通话准备等场景检查输出。此为依据以上差异和补丁检查给出的同步建议，不是已完成同步。

## 许可证及更深一层来源

manifest 指定的许可证路径在 pin 与 HEAD 的 blob SHA 完全相同，下载后 SHA-256 也都与 manifest 声明一致。这里只报告源码事实，不对新版本全部内容的许可来源作完整法律审计。[营销许可声明][space-manifest-marketing] [Anthropic 许可声明][space-manifest-anthropic] [两端营销 tree][marketing-pin-tree] [HEAD tree][marketing-head-tree] [两端 Anthropic tree][anthropic-pin-tree] [HEAD tree][anthropic-head-tree]

| 适用技能 | 许可证路径与正文 | pin = HEAD 的 SHA-256 |
|---|---|---|
| `copywriting`、`customer-research` | `marketingskills/LICENSE`，MIT，Copyright 2025 Corey Haines。[HEAD L1–13][marketing-license] | `b70d71e24e40fce5da8f4b6f9cd862096a048e433db7f3c8cac5e348e6d34591` |
| `process-doc`、`status-report`、`call-prep`、`interview-prep`、`onboarding` | `knowledge-work-plugins/LICENSE`，Apache 2.0 标题。[HEAD L1–6][anthropic-license] | `a6946284993aeec75c7d75906064b66210c46051e562077efb30eb6dcfe72e26` |
| `draft-response` | `customer-support/LICENSE`，Apache 2.0。[HEAD L1–6][support-license] | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `knowledge-synthesis` | `enterprise-search/LICENSE`，Apache 2.0。[HEAD L1–6][search-license] | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |

两点需要在后续同步时留意：

- Anthropic 根 LICENSE 末尾 L205–212 有一段与 Apache 正文无关的文字；固定 pin 已包含完全相同的 blob，因此这是已有文件状态，不能报告为本次许可证变更。[pin 根 LICENSE L205–212](https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/LICENSE#L205-L212) [HEAD 根 LICENSE L205–212](https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/LICENSE#L205-L212)
- 新版 `copywriting` 明示诊断/起草方法借鉴 Profound 的 `improved-copywriting`，新增 reference 也列出 Profound/Wispr Flow 的技能作为来源，并标注上游库为 MIT。若引入这些段落，应保留这些来源说明；“它确实来自何提交、原版权通知是否另需分发”尚未在本次针对 2 个直接来源仓库的核对中验证，不能只凭营销仓库根 LICENSE 未变就认定新增内容的全部归属已经审清。[HEAD `SKILL.md` L77][copy-attribution] [HEAD `ai-tells.md` L295–307][copy-ai-sources]

## 可复核的目录 tree SHA

Git tree SHA 覆盖整个目录内容，以下值由两端未截断的 recursive tree 响应读取；相同 tree SHA 直接支撑“没有支持文件暗中变化”的判断。[营销 pin tree][marketing-pin-tree] [营销 HEAD tree][marketing-head-tree] [Anthropic pin tree][anthropic-pin-tree] [Anthropic HEAD tree][anthropic-head-tree]

| 上游技能目录 | pin tree SHA | HEAD tree SHA |
|---|---|---|
| `skills/copywriting` | `e5457b0306878bac731cda9a05e8b68d882b7b40` | `5de411655b1692373f8950f56d50991bd5294a8e` |
| `skills/customer-research` | `e137d628841013c62251db1e25b12c71bbfc3f47` | `8f5ba9a5187f4c9c4a92ad13b3b77f05710597b3` |
| `operations/skills/process-doc` | `4f5d846f3362ec7debd5659bed1f5ad713531ef4` | `4f5d846f3362ec7debd5659bed1f5ad713531ef4` |
| `customer-support/skills/draft-response` | `cb6e12f9d367906d88f7d683110cb4601c7b1c91` | `cb6e12f9d367906d88f7d683110cb4601c7b1c91` |
| `enterprise-search/skills/knowledge-synthesis` | `c79597fffe8c754779af5802d5c1bce392821724` | `c79597fffe8c754779af5802d5c1bce392821724` |
| `operations/skills/status-report` | `303c2be4210a9633d1ea3cc13c3adc82199d7a8c` | `303c2be4210a9633d1ea3cc13c3adc82199d7a8c` |
| `sales/skills/call-prep` | `15af0a69c20abf73a919acda5f6e5ed5a716e008` | `cfb8b70626328ebe9626948f8805120c3d1718b5` |
| `human-resources/skills/interview-prep` | `b966ffd25c89f63fa40f3ad0e9f5eb1ae30d367c` | `b966ffd25c89f63fa40f3ad0e9f5eb1ae30d367c` |
| `human-resources/skills/onboarding` | `6ec7bebb10356b93b364d789e9eaa6185a2a6407` | `6ec7bebb10356b93b364d789e9eaa6185a2a6407` |

## 未证实

- 未验证各方法在 Space 用户任务中的转化、访谈质量或销售效果；本文“值得同步”是依据内容差异与本地边界的研究判断。
- 未验证 `copywriting` 声称的 +81% 等数据的原始研究、样本和适用范围；未把上游风格禁则当作可靠的 AI 文本检测器。
- 未验证新版 `call-prep` 对 Gong、Google Drive、Claude UI 和 connector 行为的描述是否适用于本项目宿主；这些远程说明只作为待评估资料。
- 未对新版 `copywriting` 引述的更深层技能仓库逐提交追溯版权来源；这里只确认直接上游新增了这些归属说明。

## 未解问题

1. 产品上是否接受新版 `copywriting` 的默认诊断说明、逐行理由和英语风格强规则，还是只让它们用于内部检查？建议继续优先满足用户指定交付物。
2. `call-prep` 的新连接器细节有多少是 Space 实际支持的能力？建议以现有能力为边界移植证据规则，待真实连接器接入后再采用产品专属步骤。
3. 若引入新版 `copywriting` 的第三方借鉴段落，是否需要补充更细的版权通知？需在正式同步时追踪该第三方库的确切版本与许可文件。

[space-manifest-marketing]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skills.sources.json#L67-L100
[space-manifest-anthropic]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skills.sources.json#L119-L228
[space-sync-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/scripts/sync-builtin-skills.mjs#L463-L474
[marketing-pin-tree]: https://api.github.com/repos/coreyhaines31/marketingskills/git/trees/5b2c0007766c6a1cf1d53fd8fc73e979e0821022?recursive=1
[marketing-head-tree]: https://api.github.com/repos/coreyhaines31/marketingskills/git/trees/17772c7a80b7b8c7a47af30f648374cd8bd8adc5?recursive=1
[anthropic-pin-tree]: https://api.github.com/repos/anthropics/knowledge-work-plugins/git/trees/1f517b9de47e827c80cd933ed364e16838072239?recursive=1
[anthropic-head-tree]: https://api.github.com/repos/anthropics/knowledge-work-plugins/git/trees/c75fda00ff0e41c8ee331ae312c8a07f1967653b?recursive=1
[copy-pin]: https://github.com/coreyhaines31/marketingskills/blob/5b2c0007766c6a1cf1d53fd8fc73e979e0821022/skills/copywriting/SKILL.md
[copy-head]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md
[research-pin]: https://github.com/coreyhaines31/marketingskills/blob/5b2c0007766c6a1cf1d53fd8fc73e979e0821022/skills/customer-research/SKILL.md
[research-head]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/SKILL.md
[process-pin]: https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/operations/skills/process-doc/SKILL.md
[process-head]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/operations/skills/process-doc/SKILL.md
[draft-pin]: https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/customer-support/skills/draft-response/SKILL.md
[draft-head]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/customer-support/skills/draft-response/SKILL.md
[synthesis-pin]: https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/enterprise-search/skills/knowledge-synthesis/SKILL.md
[synthesis-head]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/enterprise-search/skills/knowledge-synthesis/SKILL.md
[status-pin]: https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/operations/skills/status-report/SKILL.md
[status-head]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/operations/skills/status-report/SKILL.md
[call-pin]: https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/sales/skills/call-prep/SKILL.md
[call-head]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/sales/skills/call-prep/SKILL.md
[interview-pin]: https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/human-resources/skills/interview-prep/SKILL.md
[interview-head]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/human-resources/skills/interview-prep/SKILL.md
[onboarding-pin]: https://github.com/anthropics/knowledge-work-plugins/blob/1f517b9de47e827c80cd933ed364e16838072239/human-resources/skills/onboarding/SKILL.md
[onboarding-head]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/human-resources/skills/onboarding/SKILL.md
[copy-diagnosis]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L42-L77
[copy-learnings]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L14-L16
[copy-claims]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L101-L108
[copy-ai]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L136-L161
[copy-ai-reference]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/references/ai-tells.md#L239-L291
[copy-frameworks]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/references/copy-frameworks.md
[copy-transitions]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/references/natural-transitions.md
[copy-metrics]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L83-L86
[copy-reference-metrics]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/references/copy-frameworks.md#L418-L433
[copy-output]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L305-L329
[copy-attribution]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/SKILL.md#L77
[copy-ai-sources]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/copywriting/references/ai-tells.md#L295-L307
[research-injection]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/SKILL.md#L10-L12
[research-related]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/SKILL.md#L295-L308
[research-source-guide]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/references/source-guides.md#L329-L336
[research-sample]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/SKILL.md#L109-L115
[research-persona]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/skills/customer-research/SKILL.md#L198-L208
[call-rules]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/sales/skills/call-prep/SKILL.md#L8-L17
[call-resolve]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/sales/skills/call-prep/SKILL.md#L38-L44
[call-history]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/sales/skills/call-prep/SKILL.md#L40-L77
[call-output]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/sales/skills/call-prep/SKILL.md#L87-L102
[call-tiers]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/sales/skills/call-prep/SKILL.md#L104-L112
[space-copy-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/copywriting-space-adaptation.patch#L7-L49
[space-research-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/customer-research-space-adaptation.patch#L7-L65
[space-process-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/process-doc-space-adaptation.patch#L7-L45
[space-draft-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/draft-response-space-adaptation.patch#L7-L219
[space-synthesis-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/knowledge-synthesis-space-adaptation.patch#L3-L16
[space-status-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/status-report-space-adaptation.patch#L7-L49
[space-call-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/call-prep-space-adaptation.patch#L7-L42
[space-interview-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/interview-prep-space-adaptation.patch#L7-L13
[space-onboarding-patch]: https://github.com/KodaX-AI-dev/KodaX-Space/blob/e3ba5893347e20b09d37f6ea95265daa375bacc3/resources/builtin-skill-patches/onboarding-space-adaptation.patch#L7-L33
[marketing-license]: https://github.com/coreyhaines31/marketingskills/blob/17772c7a80b7b8c7a47af30f648374cd8bd8adc5/LICENSE#L1-L13
[anthropic-license]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/LICENSE#L1-L6
[support-license]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/customer-support/LICENSE#L1-L6
[search-license]: https://github.com/anthropics/knowledge-work-plugins/blob/c75fda00ff0e41c8ee331ae312c8a07f1967653b/enterprise-search/LICENSE#L1-L6
