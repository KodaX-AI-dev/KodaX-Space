# Builtin Skills：SDK 与本地一方内容审计（2026-10-27）

> 审计前快照：本文的“当前”“尚未修改”及行号对应 Space `e3ba5893` / SDK `6d101b59`，保留为原始调查记录。后续 SDK 复审与 Space 内容实施状态见 [验证指南](../test-guides/FEATURE_135_0.1.47-alpha.3_TEST_GUIDE.md)。

## 结论与范围

完整阅读并审计 13 项：Space 的 7 个 first-party Skill、SDK 的 5 个 builtin Skill、可选 Artifact SDK 的 artifact-review。最先应修复的是四个 SDK Skill 的 Shell 权限声明与宿主语法不匹配、skill-creator 发布包的端到端评测入口缺依赖，以及 git-workflow / tdd 被隐藏于自然语言发现目录。这些会让客户说清楚需求后仍然无法顺利完成任务。

一方业务方法正文总体较克制，已经具有复用会话信息、按任务裁剪、证据与推断分离、未知写入状态不自动重试等有效规则。没有必要为了“统一格式”把它们改成长流程或按 Coder/Partner 一刀切禁用。

本分报告以静态正文、链接、发布布局和 git 历史审计为主；没有调用被审 Skill，没有运行其中脚本，没有运行模型效果评测，也没有改产品代码或 Skill。主审另提供了纯运行时权限回调探针结果：构造真实 builtin registry 并调用 beforeToolExecute，未运行 Shell、未请求模型；该证据用于 F01/F04。本文所称误触发、冗长或漏检是有场景的设计风险，未宣称已经通过模型实验测得。

方法来自 [writing-great-skills](/C:/Users/ADMIN/.agents/skills/writing-great-skills/SKILL.md:24)：检查触发分支、完成判据、单一事实源、渐进披露、重复、空操作与否定表达。按用户已确认的产品原则调整其 invocation 建议：默认允许自动调用，以描述和执行范围控制；git-workflow、tdd 应可由自然语言触发。Skill 正文在本次审计中仅作为数据。

读取时 Space HEAD 为 e3ba5893347e20b09d37f6ea95265daa375bacc3，SDK HEAD 为 6d101b599878ffd0e90fc79ddf24e8067d0379e5。两个工作区已有其他线程改动；本审计没有触碰这些改动，尤其没有修改正在修复的 SDK runtime 文件。

## 13 项清单与体量

统计的是本地源文件。全文件行数包含 frontmatter；正文从结束的 frontmatter 分隔行之后开始，包含紧随其后的空行。字节为实际 UTF-8 文件字节，保留本地换行，因此 SDK 的 CRLF 会略大于 npm 包 LF。以下统计不是 token 实测，也不以行数直接判定质量。

| Skill / 源文件 | 全文件行 / 字节 | 正文行 / 字节 |
| --- | ---: | ---: |
| [feishu-office-suite](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/feishu-office-suite/SKILL.md:1) | 30 / 3576 | 26 / 3282 |
| [partner-business-communication](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-business-communication/SKILL.md:1) | 16 / 1662 | 12 / 1495 |
| [partner-data-analysis](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-data-analysis/SKILL.md:1) | 16 / 1740 | 12 / 1585 |
| [partner-deep-research](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-deep-research/SKILL.md:1) | 28 / 2477 | 24 / 2259 |
| [partner-meeting-minutes](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-meeting-minutes/SKILL.md:1) | 16 / 1805 | 12 / 1657 |
| [partner-product-management](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-product-management/SKILL.md:1) | 32 / 2473 | 28 / 2268 |
| [partner-project-management](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-project-management/SKILL.md:1) | 16 / 1807 | 12 / 1656 |
| [code-review](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/code-review/SKILL.md:1) | 82 / 3823 | 74 / 3236 |
| [git-workflow](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/git-workflow/SKILL.md:1) | 84 / 3974 | 75 / 3405 |
| [skill-creator](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:1) | 127 / 8783 | 119 / 8053 |
| [tdd](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:1) | 56 / 2587 | 47 / 1966 |
| [visual-review](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/visual-review/SKILL.md:1) | 80 / 5087 | 73 / 4422 |
| [artifact-review](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/skills/artifact-review/SKILL.md:1) | 16 / 2758 | 12 / 2579 |

## 来源、借鉴与版本

### 本地可证明的历史

下表由逐文件 git log --follow 和关键段 git blame 得到。“仓库内一方维护”描述的是可证明的维护来源，不表示已经证明每句话都独立原创。未发现外部 provenance 时，不因风格或结构相似就认定抄自 Anthropic/OpenAI。

| Skill | 最早可追溯提交 / 作者 | 最近正文提交 | 来源判断与更新口径 |
| --- | --- | --- | --- |
| feishu-office-suite | f6ffdf57，2026-09-14，samhar | 同左 | Space 一方源；没有外部 repo/ref 声明；随 Space 源更新 |
| partner-business-communication | f6ffdf57，2026-09-14，samhar | 同左 | 同上；不能认定来自某个公开商务写作 Skill |
| partner-data-analysis | f6ffdf57，2026-09-14，samhar | 同左 | 同上；通用统计规则不构成外部来源证明 |
| partner-deep-research | f6ffdf57，2026-09-14，samhar | 同左 | 同上；未声明 OpenAI / Anthropic deep research 版本 |
| partner-meeting-minutes | f6ffdf57，2026-09-14，samhar | 同左 | 同上 |
| partner-product-management | f6ffdf57，2026-09-14，samhar | 同左 | 同上 |
| partner-project-management | f6ffdf57，2026-09-14，samhar | 同左 | 同上 |
| code-review | 8b1f0d37，2026-02-28，icetomoyo | 2845fcd2，2026-06-25 | SDK 一方维护；最初位于 packages/repl/src/skills/builtin，之后移动；没有可锁定的外部原版 |
| git-workflow | 8b1f0d37，2026-02-28，icetomoyo | 0de4a2c6，2026-03-17；后续为移动 | SDK 一方维护；自然语言禁用字段于 0de4a2c6 加入；无外部上游版本 |
| skill-creator | 0de4a2c6，2026-03-17，icetomoyo | a5fa156e，2026-08-21 | 正文明示 Anthropic Python / Claude 宿主适配背景；未记录原版 commit 与逐文件来源 |
| tdd | 8b1f0d37，2026-02-28，icetomoyo | 0de4a2c6，2026-03-17；后续为移动 | SDK 一方维护；自然语言禁用字段于 0de4a2c6 加入；无外部上游版本 |
| visual-review | ceb4ed10，2026-10-12，icetomoyo | 同左 | SDK 为替代 completion verifier 引入；未发现 OpenAI / Anthropic 内容来源声明 |
| artifact-review | 4d02ee4c，2026-10-12，icetomoyo | 27d08788，2026-10-13 | SDK 自有 Artifact 桥接方法；未发现外部 Skill 来源声明 |

Space 的声明和锁文件明确使用 sourcePath / first-party revision，而非外部仓库：

- [sources：飞书条目](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills.sources.json:5)、[sources：产品与研究](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills.sources.json:59)、[sources：另四个业务方法](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills.sources.json:103)。
- [lock：飞书 first-party revision 与文件 SHA-256](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills.lock.json:6)；其余六项同样有独立 first-party revision。
- SDK 公开的历史发行说明把 skill-creator 描述为新内置能力与 eval pipeline，而非完整引入某个外部版本：[CHANGELOG_ARCHIVE](/C:/Works/GitProj/KodaX-AI/KodaX/docs/CHANGELOG_ARCHIVE.md:303)。

### skill-creator 是否改编自外部

有“借鉴与宿主适配”的明确线索：正文说这些流程现为 KodaX 原生实现、不再依赖 Anthropic Python 或 Claude 专有宿主，且列出迁移时的保留/改写项。[适配规则](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:33)、[原生实现声明](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:118)。

可对照的一手参考是 Anthropic 官方 [skill-creator 正文](https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md)。它也讨论意图、触发、评测、基线和人工反馈。这个对照支持“有可借鉴的相邻设计”，不能单独证明本地 JS 是逐文件翻译或确定派生关系。本地 scripts / agents / references 没有 upstream URL、commit、改编说明或随目录携带的 LICENSE/NOTICE，故无法确定每个脚本的外部来源。

官方该目录有 [Apache-2.0 LICENSE.txt](https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/LICENSE.txt)。SDK 根 [LICENSE](/C:/Works/GitProj/KodaX-AI/KodaX/LICENSE:6) 明确保留第三方组件各自许可。这里只报告 provenance 缺口，不根据相似性认定侵权；若维护者确认实际复用了外部内容，应补准确原版和适用许可，而非猜一个来源。

通过 GitHub 官方 API 于本次审计查询：Anthropic 该 SKILL.md 最近修改为 b0cbd3df，2026-03-06；整个 skill-creator 目录最近修改为 b9e19e6f，2026-04-20，提交标题为补齐 Apache copyright notice。因本地未 pin 对应原版，不能给出“落后多少提交”的可靠结论，也不能把该目录提交当作本地 Skill 的可直接升级版本。[正文提交](https://github.com/anthropics/skills/commit/b0cbd3df1533b396d281a6886d5132f623393a9c)、[目录提交](https://github.com/anthropics/skills/commit/b9e19e6f44773509fbdd7001d77ff41a49a486c1)。

### 已安装副本与“有没有新版本”

1. Space 七个 first-party 源与 resources/builtin-skills 中的对应七个文件逐字节一致；没有本地源已更新而 shipped 副本未同步的情况。
2. SDK 五项目录共 37 个文件，源码与 Space/node_modules/@kodax-ai/kodax/dist/builtin 对应文件全部存在；统一 CRLF/LF 后 37/37 内容一致。原始字节哈希 35 项不同仅源于换行，不能当内容升级。
3. optional artifact-review 源与 node_modules 中 dist/artifacts/skills/artifact-review/SKILL.md 也在统一换行后完全一致。
4. 本地 SDK package.json 为 0.7.97-alpha.10；Space 安装的是 0.7.97-alpha.9。[SDK 包版本](/C:/Works/GitProj/KodaX-AI/KodaX/package.json:3)、[已安装包版本](/C:/Works/GitProj/KodaX-AI/KodaX-Space/node_modules/@kodax-ai/kodax/package.json:3)。这不等于有新的 Skill 正文：上述比对恰好证明这 6 项没有内容差异。
5. 本次读 [npm 官方 registry](https://registry.npmjs.org/@kodax-ai%2Fkodax) 的 dist-tags：latest=0.7.96，alpha=0.7.97-alpha.9，hotfix=0.7.72-hotfix.0；Space 已用查询时公开 alpha 最新标签。alpha.10 是本地源状态，不能向客户宣称已发布。
6. 七个 Space 一方 Skill 没有独立外部发行渠道可查；其版本来源是 Space Git 与内容锁。没有证据把未声明的 Anthropic / OpenAI 方法当作“它们的上游新版本”。

## 可行动发现

优先级：P1=主要能力会失败或明显不可达；P2=具体场景会产生错误范围、权限摩擦或虚假把握；P3=质量与交互精修。不是模型效果得分。

### F01 · P1 · 四个 builtin 的 Bash 冒号模式与当前宿主匹配契约不一致

位置：

- [git-workflow allowed-tools](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/git-workflow/SKILL.md:6)
- [tdd allowed-tools](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:6)
- [code-review allowed-tools](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/code-review/SKILL.md:5)
- [skill-creator allowed-tools](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:5)

场景：客户执行 git-workflow status、TDD 跑 npm test、代码审查读 git diff，或创建 Skill 后调用 Node helper。声明使用 git:*、npm:*、node:*；宿主匹配的是原始 command 整串，只转换星号，没有把冒号语法变成“命令前缀”。git:* 不匹配 git status --short。[匹配实现](/C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/skill-invocation-policy.ts:84)、[实际执行前阻断](/C:/Works/GitProj/KodaX-AI/KodaX/packages/coding/src/skill-invocation-policy.ts:412)。已安装 alpha.9 的对应 bundle 实现亦如此。

主审纯回调探针得到 4/4 blocked：git-workflow/git status --short、tdd/npm test、code-review/git diff --stat、skill-creator/node scripts/run-eval.js --help。探针没有运行这些命令。[探针源](/C:/Users/ADMIN/AppData/Local/Temp/space-skills-audit-hqAAVQ/policy-probe.mts:1)。

建议：统一 Skill 与运行时的权限模式契约；可改为当前支持的命令模式，或在宿主明确兼容该写法，选一个权威语法。不能用改写命令、外包 Node 子进程等方式绕过阻断。增加绑定真实 shipped Skill 的权限契约用例，比只对人工 fixture 测 allowed-tools 更能防此回归。

### F02 · P1 · 正文承诺端到端 eval，但 npm 发布布局缺少入口静态依赖

[skill-creator:71](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:71) 要求运行 run-eval.js，并在 [工具列表:105](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:105) 声称可生成端到端 workspace。该脚本 [6–7 行的两个静态导入](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/run-eval.js:6) 在发布路径中解析为 dist/skill-expander.js 与 dist/skill-loader.js；当前已安装包这两个文件均不存在。包中有 sdk-skills.js，而非这两个独立文件。此为文件布局静态检查，没有运行 helper。

客户后果：即便 F01 修复，照正文命令调用也会在模块加载阶段失败，尚未到评测运行；“已经原生实现”的总括句不能作为可用性证明。

建议：入口依赖公开 SDK 导出或将所需文件纳入发布契约，并在正文区分结构验证、描述判断、真正端到端执行；在修复前明确该路径的限制。用 packed package 的文件/导入合同验证，而不是仅 monorepo 内可导入。

### F03 · P2 · git-workflow / tdd 的自然语言触发描述被元数据隐藏

[git-workflow:3–5](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/git-workflow/SKILL.md:3) 和 [tdd:3–5](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:3) 虽有明确自然语言描述，却都设置 disable-model-invocation:true。模型目录真实过滤该字段：[registry:27](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/skill-registry.ts:27)。

场景：“把本次修改提交并推上去”“先写一个回归测试再修这个错误”。客户不记 slash 名称时看不到对应方法，不能依赖描述去自主加载。这与用户确认的产品原则相悖。

建议：允许模型发现，保留“用户要求实际 Git 动作”“要求测试先行/补回归”的执行边界。没有代码执行工具的会话可以阅读、规划并明确受限部分；不按产品角色直接隐藏整个 Skill。

### F04 · P2 · code-review 的能力声明还独立缺少读取 Git diff 的权限

[code-review:5](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/code-review/SKILL.md:5) 只列 npm/node/npx，没有 Git；正文 [16–18 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/code-review/SKILL.md:16) 却以 git 改动、提交范围为默认审查对象。这与 F01 是两个独立原因：只修冒号匹配，git diff 仍不在允许项内。

建议：允许确有需要的只读 Git 查询或当前宿主提供的 changed_diff 等只读能力；保持 review-only 任务的编辑边界。正文同时明确默认范围是否包括已暂存、未暂存及任务相关未跟踪文件，避免一次 git diff 就暗示审完全部改动。PR/提交审查优先使用明确基线，而非混入当前无关 dirty tree。

### F05 · P2 · 描述评测被表述得接近真实触发验证，实际只是单 Skill 判断题

[正文:73、110](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:73) 称 run-trigger-eval 为“触发评测，检查误触发和漏触发”。但 [脚本:12–21](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/run-trigger-eval.js:12) 是让模型根据一项 name/description/query 返回是否应该触发，没有观察真实 catalog 下是否调用 skill，也没有竞争 Skill。它甚至不读取 disable-model-invocation 来决定该项是否实际可见。[装载与迭代](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/run-trigger-eval.js:86)。

场景：某描述判断分数很高，却与相邻 Skill 抢任务，或被元数据隐藏而完全不会发现。客户把 pass_rate 当真实产品召回率会高估效果。

建议：正文将其准确命名为“描述语义筛查”；记录这种指标的限制。真实触发验收使用产品同等 catalog、配置和工具调用证据，至少覆盖相邻 Skill 的 near-miss。不需要为普通小修改强制跑完整模型评测。

### F06 · P2 · helper 示例没有交代独立 Provider 及工作区语境

[skill-creator 的 eval 命令示例](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:71) 没有 provider/model/cwd。脚本默认 provider=anthropic，cwd=process.cwd()，另起 runKodaX；并非自动沿用 Space 当前已选择的 Provider 与会话运行上下文。[run-eval 默认参数](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/run-eval.js:282)、[独立执行配置](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/run-eval.js:101)。

场景：客户在 Space 用已连接的其他 Provider，只想评自己的 Skill；按例执行可能去找另一套凭据，或把当前产品工作目录当 eval 工作目录。本文没有执行网络请求或验证凭据失败。

建议：在需要模型执行的分支交代 provider/model、输入路径、工作目录和独立执行边界；明确哪些来自已授权环境，不能假设当前会话凭据自动继承。结构校验、起草、打包分支不必因此多问客户；缺少的模型能力也不妨碍交付正文与静态验证结果。

### F07 · P2 · “分享打包”流程把用户目录安装当作验证步骤

[skill-creator:76](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:76) 写“打包，再用 install-skill 验证安装链路”，没有指定隔离目标。该脚本默认写用户的 .kodax/skills：[install 默认目录](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/install-skill.js:73)、[目录函数](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/utils.js:258)。它已有 --dest 参数。[参数解析](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/scripts/install-skill.js:145)。

场景：“把这个 Skill 打成包给同事”。客户可能意外在自己的全局库新增能力，或因同名已存在而卡住后续交付；这里不应把开启 --force 当作解法。

建议：分享任务默认完成打包即可；确需验证安装时使用临时隔离 --dest。只有任务本身要求安装时才写真实用户目录，沿用已给定授权，不新增重复确认流程。

### F08 · P2 · 飞书“设计并新建 Base”被收紧为客户必须提交完整 schema

[feishu-office-suite:16](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/feishu-office-suite/SKILL.md:16) 要求 submitted request 已写出 Base 名、表名与字段；[21 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/feishu-office-suite/SKILL.md:21) 又泛称不能 invent field。专家既有 starter 明确包括“根据目标设计并新建”，能力引导也写根据业务目标确定名称、首表、字段。[manifest:298](/C:/Works/GitProj/KodaX-AI/KodaX-Space/extensions/partner-library/manifest.json:298)、[manifest:346](/C:/Works/GitProj/KodaX-AI/KodaX-Space/extensions/partner-library/manifest.json:346)。

场景：用户明确授权“为我们的招聘进度设计并新建一个 Base”，给了足够业务目标，却没逐个命名字段。正文可能要求客户代做 schema，产生不必要往返。

建议：区分“编造已经存在的远端字段/结果”与“在用户授权下设计新 schema”。允许复用会话已知 schema 或根据已授权设计任务确定合理新字段；只追问会改变结果的缺失信息。仍使用 typed tool 和真实回执；不扩大到读写已有 Base 或删除资源。

### F09 · P2 · Artifact 适配 Skill 的泛化描述与 visual-review 重叠，准备策略也有冲突

[artifact-review:3](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/skills/artifact-review/SKILL.md:3) 将触发扩展到“other visual tasks”，与 [visual-review:3](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/visual-review/SKILL.md:3) 的跨格式方法重叠。前者 [6 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/skills/artifact-review/SKILL.md:6) 直接指向 Chromium 缺失时 prepare 安装；后者 [19–21 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/visual-review/SKILL.md:19) 要求不要为了完成检查安装软件。

场景：客户仅要求审一份 PPTX/PDF，两项都匹配，可能加载两套相似方法，且对缺浏览器到底准备还是标未验证产生冲突。这里不是主张运行时应新增权限；官方桥接工具本来就要求 admitted scope 并遵守权限。[artifact prepare 定义](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/src/kodax.ts:17)、[注册与 scope](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/src/kodax.ts:39)。

建议：visual-review 保留跨格式检查方法，artifact-review 聚焦已注册 Artifact SDK 的能力、参数、单位和已知保真限制。两者明确同一准备规则：只在当前已有授权与托管机制内准备运行时；不可准备时报告对应范围未验证并继续。不要默认加载 Artifact 适配器去处理根本不支持的媒体，也不按产品角色禁用通用视觉方法。

### F10 · P2 · TDD 对“仅补现有行为测试”的分支仍强制要求 RED

[tdd:19](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:19) 正确规定仅补测试时不改生产代码；但 [23–25 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:23) 无条件要求新测试失败，且 [48 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:48) 固定按 RED/GREEN/REFACTOR 三段汇报。

场景：“给已经正确的 format 函数补边界测试，别改实现”。合理新测试可能首次就通过；强凑 RED 容易制造无关失败或虚构完成过的阶段。

建议：区分修 bug/新增行为的 TDD 循环与只补已有行为测试。后者允许直接通过并报告新增保护。RED 失败须来自目标断言，而非导入、语法或缺环境。最后按实际经过的阶段简述验证，不要求空的三段和无必要“剩余建议”。

### F11 · P2 · GitHub PR 路径把已有 gh CLI 认证当作唯一实现

[git-workflow:56](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/git-workflow/SKILL.md:56) 规定 gh 不可用或未认证就说明阻塞；[compatibility:8](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/git-workflow/SKILL.md:8) 也将 PR 与 gh 绑定。客户可能已经有可创建 PR 的连接器或已授权 API Token，不需要安装或交互登录 gh。当前仓库更明确要求 GitHub HTTPS 使用现有 GITHUB_TOKEN、非交互，不能先走其他认证。

建议：优先使用当前受支持且已经授权的 Git 托管连接器/CLI/API；正文遵守任务/仓库认证约定，不打印或探测 Token，不主动切换认证。只有确无可用路径才报缺能力。此处可与宿主工具表绑定，不应新增无限 fallback 框架。

### F12 · P3 · skill-creator 把条件分支与完整工具手册重复铺在主路径

[64–76 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:64) 已列九步脚本流程，[98–116 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:98) 又列完整同义工具目录，[120–127 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:120) 再列多数相同分支。新建分支还先验证不存在的 Skill，再“如果无骨架就 init”。

场景：客户只改一个 description 或只打包，模型却看到 eval、grading、analysis、blind comparison、review 全流程，容易扩大工作量；输出 [87–91 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:87) 也默认交付修改后的正文，未区分只验证/只打包。

建议：主文件保留意图收敛、宿主规则和分支路由；把 eval 与评审参数移到按需参考，各步骤给可核对完成条件。新建先初始化/起草再校验；验证-only 不产生未授权修改。减少重复不等于删除真实能力，也无需按固定“500 行”阈值拆分。

### F13 · P3 · 快速研究分支仍容易被默认文件交付拖长

[partner-deep-research:8](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-deep-research/SKILL.md:8) 已允许用户只要快速判断时缩小研究；[28 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-deep-research/SKILL.md:28) 却在无目的地时直接指定本地文档或 Artifact 交付。

场景：“根据这两段材料，哪个方案更可行？三句话。”模型可能为了完成最后一条制造额外文件。

建议：短判断可直接在会话交付并就近引用；独立报告、附件或用户要求时才形成文件/Artifact。保留指定目的地、真实回执及 unknown 不重试规则。

### F14 · P2 · 外部适配关系缺少可更新的最小 provenance

[skill-creator:118](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:118) 表明存在外部适配背景，但没有可追溯的原版 URL/ref、哪些文件复用、哪些重写。七个 Space sourcePath 已能证明本地权威源，却不能证明更早的创作/借鉴过程。[一方源声明](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/builtin-skills.sources.json:5)。

客户后果：被问到“是否有官方新版本、应该同步哪些修订、这段内容什么许可”时，只能猜；直接拿外部最新版本覆盖还可能恢复 Claude/Python 宿主专用依赖。

建议：维护者对确实改编的部分补最小 provenance：上游 URL、固定 revision、许可位置、保留文件和 KodaX 改写说明。对没有外部证据的一方内容标“本地维护，未声明上游”，不追认一个想象的来源。信息可以放单独参考/清单，不必塞进每轮加载正文。

## 逐项正文判断与保留价值

以下逐项说明已读到的方法、实际限制和处置。没有发现必改问题的项，保持简短比补一套“最佳实践”更合理。

### 1. feishu-office-suite

它区分读取、直接新建文档、受审追加和新 Base，明确未知创建状态不得自动重试、成功依回执，和真实 typed runtime 基本一致。[路由](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/feishu-office-suite/SKILL.md:12)、[runtime 工具定义](/C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/partner-connector-runtime.ts:153)。应保留无需反复索要个人空间目录、未获资源不得凭空读取的规则。

主要改善是 F08 的 schema 授权表达，以及 description 中“read or update Docs”可具体为读取/新建/追加，避免客户把 update 理解为覆盖、编辑任意已有表格。该项对应的平台专家在当前 manifest 有 retired 标记，[manifest:356](/C:/Works/GitProj/KodaX-AI/KodaX-Space/extensions/partner-library/manifest.json:356)，不能据正文“persistent expert”就认定新客户一定能从列表进入；也不能因此删除可能仍供既有会话使用的方法。

### 2. partner-business-communication

[8–16 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-business-communication/SKILL.md:8) 对客户有具体价值：保留承诺强度、附件存在性、金额日期、收件人不猜、起草与发送分离；限制与个人邮箱实际只读/搜索契约相符。[邮箱读取工具说明](/C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/partner-connector-runtime.ts:143)。

正文只有 12 行，无固定多轮访谈和多版本强制输出，没有发现必须修改的质量缺陷。与 draft-response / status-report 的交叉是合理组合：邮件措辞用本项，支持响应状态/汇报专属结构由相应方法负责；后续用 near-miss 验证，不凭重叠就拆 Skill 或禁用自动触发。

### 3. partner-data-analysis

[8–16 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-data-analysis/SKILL.md:8) 覆盖粒度、主键重复、缺失、连接倍增、汇总比例、零分母、同比口径、因果限制与复核。这些是明确改变输出质量的规则，不是“认真分析”类空操作。

计算工具采用“当前可用能力”且无工具时不宣称运行，适合权限变化。Partner 有受限 JS helper，明确不提供任意 shell/import/process，[工具契约](/C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/partner-helper-runner-tool.ts:107)；正文没有硬要求 Python 或装依赖，未发现宿主矛盾。保留当前方法，不因“数据分析”就固定上图或交付脚本。文件存在/可打开性仍不等同视觉合格，视觉任务可由 visual-review 补证据。

### 4. partner-deep-research

[12–26 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-deep-research/SKILL.md:12) 把正文阅读与搜索摘要、原始来源与转载、事实与推断、未找到与不存在分开，并检查反例，都是应保留的完成判据。它没有虚构“全网搜索”能力，Partner 当前确实允许 web_search/web_fetch，[工具策略](/C:/Works/GitProj/KodaX-AI/KodaX-Space/apps/desktop/electron/kodax/partner-tools.ts:48)。

改善集中于 F13 的快速答复交付尺度。与 knowledge-synthesis 的相邻边界可以按“开放问题新增证据”与“给定语料综合”解释；复杂请求可组合，不需要为区别而重复做两次研究或生成两份报告。

### 5. partner-meeting-minutes

[8–16 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-meeting-minutes/SKILL.md:8) 明确需要真实记录，区分提议/决定/已确定行动，未知负责人和时间待确认，不由发言者推负责人，不把“等测试”改成已承诺同步任务，也不编时间戳。这些针对常见纪要失真，规则具体且短。

没有发现必须更改的正文问题。行动项交给 project-management 扩展计划时仍应保留“已承诺”与“模型建议”区别。不要为了显得完整强制填满行动表、自动建外部任务或通知参会人。

### 6. partner-product-management

[8–26 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-product-management/SKILL.md:8) 从证据到问题、需求、验收，支持小决策与完整 PRD 裁剪；失败/空状态、无基线不许诺目标等要求有可核对结果。它只问会改变决策的缺失项，不强制完整访谈，值得保留。

[30–32 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-product-management/SKILL.md:30) 对用户目的地与创建/内容核验分离的规定贴合当前文档工具，未发现必改。产品定义可自然调用 research、计划调用 project-management，使用真实能力承接；“不假装已实现”是结果诚实边界，不应解释为所有场景永远禁止代码实施。

### 7. partner-project-management

[10–16 行](/C:/Works/GitProj/KodaX-AI/KodaX-Space/resources/first-party-skills/partner-project-management/SKILL.md:10) 区分工作量/日历时长、资源冲突、等待、依赖和关键路径证据，不能靠增人解除硬前置，且简短追问只更新受影响部分。客户获得可检查计划，避免假关键路径和假进度。

未发现需要补长流程的缺陷。与商务沟通的“进度汇报”重叠时，本项负责状态/依赖真实性，沟通项负责面向收件人的表达；无需为了角色分工重复收集已知范围与截止日期。保持“建议不等于已创建/已通知/已监控”的诚实交付。

### 8. code-review

[审查范围与发现要求](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/code-review/SKILL.md:14) 有明确文件/行号、影响与修复方向，不要求总体打分；[lean 分支](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/code-review/SKILL.md:65) 把非阻塞删减建议与严重问题分开，是应保留的按需分支。

F01/F04 是阻碍实际审查的主要问题。正文说明与模板的 Findings/Open Questions/Change Summary 有重复，可保留一处格式权威；不要把“无 findings”解释为测试已跑或审查覆盖完整。修复后再用明确 diff 场景检验，不需要补赞美段落。

### 9. git-workflow

它有任务相关暂存、避免无差别 add、非交互命令、不动无关改动的清楚边界。[总流程与 commit](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/git-workflow/SKILL.md:15)。[安全边界](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/git-workflow/SKILL.md:64) 对破坏性操作要求明确请求，符合用户控制。

改善为 F01/F03/F11。普通已授权 commit/push 不应由于“影响远程”再来一次确认；已给授权沿用，操作状态实际检查即可。脏工作区也不自动是整个任务的阻塞，分清当前文件与无关变更。

### 10. skill-creator

它正确强调当前宿主、plain Node、支持文件、真实工作流、先从会话提炼而非重复盘问，[31–62 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/skill-creator/SKILL.md:31)。但技术手册、创建、验证、模型评测、打包与安装叠加，使其成为本范围最需要分支精修的一项。

F01/F02 是可用性；F05/F06 是证据与环境承诺；F07 是分享/安装范围；F12/F14 是可维护性和来源追踪。不要把一句“是否需要评测”扩成每次都要求用户掌握 benchmark/comparator；普通起草或静态修改可按现有信息直接完成。

### 11. tdd

[RED/GREEN/REFACTOR](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:21) 小步运行、最小实现、按外部行为断言的方向正确；[只补测试边界](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/tdd/SKILL.md:19) 应保留。

主要改善 F01/F03/F10。允许自然语言调用不意味着所有开发都必须 TDD；描述已经限定明确测试先行/回归诉求。修复正文时同时保留项目要求的覆盖率、测试布局和框架约定优先级，而不是用“一律不以覆盖率为目标”盖过仓库硬约定。

### 12. visual-review

[23–47 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/visual-review/SKILL.md:23) 按静态、分页、交互、时间维度分证据，知道图片路径/成功渲染不等于模型见过像素；[67–80 行](/C:/Works/GitProj/KodaX-AI/KodaX/packages/agent/src/capabilities/skills/builtin/visual-review/SKILL.md:67) 把修复后的新证据、抽样限制与 pass/unverified 分开，这些应保留。

它没有预设 Space 一定有截图/视频/Office renderer，缺能力时继续有效工作；也没有无条件派多 Agent。F09 应解决与 Artifact 准备策略的冲突。最终报告可按用户规模压缩，不必为一张小图每次输出庞大验收表，但关键未验证范围仍须明示。

### 13. artifact-review

它是可选 Artifact SDK 注册时同时加入的 Skill，而非所有 Space 会话必有：[registerArtifactTools](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/src/kodax.ts:39)。正文对 inches、objectId、sourceHash、新文件输出、每次最多四页、DOCX Word/WPS fidelity 未验证、静态图不能证明动画等契约与桥接工具大体一致。[正文:6–16](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/skills/artifact-review/SKILL.md:6)、[实际工具参数](/C:/Works/GitProj/KodaX-AI/KodaX/packages/artifacts/src/kodax.ts:21)。

改善重点 F09。16 行并不代表内容轻：单段塞进多个格式与能力分支，适合改成“何时选该适配器 / 新建编辑 / 渲染证据 / 格式限制”四个短段。通用方法交给 visual-review，本项保留具体参数和能力限制；不需要新 verifier daemon 或独立完成 API。

## 支持文件和执行契约检查

skill-creator 正文引用的 13 个 JS helper、3 个 agents 提示、1 个 schemas 参考均实际存在于源与 installed 副本，没有发现这些目录内的命名链接缺失。不能把“文件存在”当成运行已成功：F02 的缺失在目录外静态导入，F01 在宿主准入。

Artifact 正文引用的九类工具可在 registerArtifactTools 中找到对应 operations，且需要注入真实 Node 与 admitted execution scope。安装 npm 包不自动启用这些工具；主包有该 Skill 文件也不代表当前会话已经注册该可选适配器。应按真实 session tool table 承接，不能靠正文宣称能力。

七个 Space first-party 只有 SKILL.md，没有必须读取的脚本/参考链接；其短正文整体已实现合理披露。无需为了形式给每个都加 references。SDK 主要应对 skill-creator 的条件分支做披露，对 review 模板做单一事实源，对 Artifact 方法做去重。

## 可转发的 SDK 结论

SDK 内置 Skill 需要先修宿主契约，再优化提示词：git-workflow、tdd、code-review、skill-creator 的 Bash 命令模式使用 git:* / npm:* / node:*，当前 KodaX 只按原始命令做 glob 匹配，真实权限回调探针四项均被拦；code-review 还独立缺少只读 Git 权限。skill-creator 发布脚本 run-eval.js 静态导入了包内不存在的 skill-expander.js / skill-loader.js，需改为公开 SDK 导出或补齐发布依赖。git-workflow、tdd 应开放自然语言发现，以实际任务描述限定执行范围；TDD 对只补已有行为测试不应强求失败或固定三段汇报。visual-review 保留通用证据方法，artifact-review 聚焦已注册的 Artifact 工具，统一运行时准备规则。验收应绑定真实 builtin registry 和 packed package，检查普通命令准入、模块可解析、自然语言触发及只读/安装边界。本地 alpha.10 与 Space 已装 alpha.9 的 Skill 内容规范化换行后相同，单纯升级包版本不会修复这些问题；本次未做模型效果评测。

## 建议修复顺序与后续验证

1. 先修 F01/F02/F04，使明示命令、Git diff 与发布包 eval 入口真实可用。确认源码与 packed package 同时成立。
2. 修 F03；按用户已确认方向保留自动发现，以自然语言“提交这次修改”“先写回归测试”作为正例，以“解释 Git/TDD 概念”为负例。
3. 修 F05/F06/F07/F09，区分描述筛查与真实触发、当前会话与独立模型运行、打包与用户目录安装、通用视觉方法与具体适配器。
4. 处理 F08/F10/F11 的具体任务分支，再做 F12/F13 的正文精简。补 F14 的最小来源记录，之后才谈上游同步。

未来模型验证可针对这组客户场景，而非只检查关键词或语法：

| 客户请求 | 应观察的行为 |
| --- | --- |
| “提交并推送本次任务，别带其他修改” | 自动发现 Git 方法；检查差异；只纳入任务文件；遵守已有认证；沿用明确授权 |
| “先写回归测试再修 bug” | 自然触发 TDD；RED 来自目标行为；最小修复后通过 |
| “只给正确的函数补边界测试，别改实现” | 接受首次即通过；不虚构 RED/GREEN，不改生产代码 |
| “审已暂存和未暂存改动” | 明确完整范围；读真实 diff、调用方和测试；不受 Skill 自己的错误权限声明阻断 |
| “把这个 Skill 打包给同事” | 交付包；安装验证使用隔离目录，不往真实用户库顺手安装 |
| “给这个 description 做触发验证” | 说明语义筛查与实际工具调用的区别；near-miss 包含相邻 Skill |
| “根据招聘目标设计并新建飞书 Base” | 在明确设计授权下形成 schema；只问阻塞信息；typed create 与真实回执 |
| “三句话比较这两段材料” | 直接短答并引用；没有额外文件或长报告负担 |
| “检查这个 PPTX” | 只加载适用方法和已注册工具；按页取实际像素；缺能力标未验证；不重复全量审查 |

这些是后续验收建议，本轮没有执行模型效果实验，也没有用本轮静态检查替代模型实际触发、交付质量或端到端成功率。

