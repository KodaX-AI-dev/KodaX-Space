# PF009 专家复用调研

日期：2026-09-07。目标是扩充可用专家，同时优先复用成熟 Skill。以下选择是针对 Space 当前能力的产品判断，不是竞争产品的完整目录。

## 直接核查的来源

- [WorkBuddy 官方专家格式](https://open.workbuddy.cn/docs/expert)：专家包包含角色定义及可选 Skill，平台提供下载示例；包格式本身不表示每个市场条目可再分发。
- 本机 WorkBuddy `sales-coach/skills/marketing-skills/SKILL.md` 明确声明其方法来自 `coreyhaines31/marketingskills`；内含 copywriting、copy-editing、social-content、email-sequence 等模块。没有复制 WorkBuddy 的整套销售专家或专有工具。
- [原作者 marketingskills](https://github.com/coreyhaines31/marketingskills)：核对 LICENSE 为 MIT，版权 Corey Haines。采用提交 `5b2c0007766c6a1cf1d53fd8fc73e979e0821022`。从该项目引入 copywriting 和 customer-research；后者是追溯原作者后选中的方法，不能说它来自本机已装包。
- 豆包工作本机目录可见正式材料写作、长文档写作、VOC与舆情调研、多平台改写分发等方向。本次未取得这些条目的可复用源码及许可，也未验证导出功能，因此没有宣称直接移植。
- [GOV.UK 访谈方法](https://www.gov.uk/service-manual/user-research/using-in-depth-interviews)支持用中性提问和实际经历获取证据；[Atlassian 项目计划](https://www.atlassian.com/work-management/project-management/project-planning/project-plan/)支持把范围、交付、时间、资源与风险放在同一个计划里。仅参考方法原则，自有方法未复制其手册。

## 本轮选择

| 专家 | 类别 | 方法来源 | 可验收结果 |
| --- | --- | --- | --- |
| 项目管理 | 岗位 | 自有 partner-project-management | 里程碑、依赖、责任、验收与风险；指出不可行日期 |
| 用户研究 | 岗位 | 原作者 customer-research + Space 补丁 | 可追溯洞察、原话、分群差异、反例与研究缺口 |
| 营销文案 | 岗位 | WorkBuddy 引用的原作者 copywriting + Space 补丁 | 首页/落地页结构、文案与行动提示；收益主张有证据 |
| 数据分析及可视化 | 任务 | 自有 partner-data-analysis | 指标口径、可复核计算、数据限制及必要图表 |
| 会议纪要与行动项 | 任务 | 自有 partner-meeting-minutes | 决定、提议、未决问题和有依据的行动项 |
| 邮件编辑 | 任务 | 自有 partner-business-communication | 邮件/公告/汇报草稿，保留事实和承诺边界 |

加上已有产品管理、深度研究，共 8 个可见专家（4 岗位、4 任务）。原 writing-mentor、data-analysis、email-editing 以 revision 3 完善后重新可选，新增三个 ID 为 revision 1。其余退役定义不删除，历史快照不改写。

## 复用适配

上游原文件和相对支持文档随包保留，测试材料 evals 不进入运行包，LICENSE 保留。补丁明确：用用户语言、复用会话背景、关联 Skill 可选、外部操作由真实工具和授权决定；经验样本阈值不等于统计可靠性，移除了以固定样本数为有效性门槛的要求。copywriting 主文中无来源的固定改善百分比移除，参考案例与数字只用于方法示例，不能变成用户产品数据。

现有 frontend-slides、huashu-design 已是复用方法，本次未再复制。设计/PPT 方向可在其交付链独立验收后开放；法律、投资、自动招聘决策暂不因市场有同名条目而批量引入。会议专家使用已有文本，不宣称支持参会录音或任意平台转写；个人邮箱当前只读/搜索，邮件编辑不宣称发送。

## 验证状态

本地实现、运行与桌面验证已完成，详见 [验收记录](PF009-expert-expansion-validation.md)。控制模型测试仅证明真实 SDK 收到了对应方法、交付标准和历史上下文，不能证明真实模型业务结果质量；真实账号操作不在本轮验证范围。
