---
name: status-report
description: Generate a status report with KPIs, risks, and action items. Use when writing a weekly or monthly update for leadership, summarizing project health with green/yellow/red status, surfacing risks and decisions that need stakeholder attention, or turning a pile of project tracker activity into a readable narrative.
argument-hint: "[weekly | monthly | quarterly] [project or team]"
---

## Space 适配（2026-09-08）

使用当前会话已有资料，按用户语言和当前问题交付；下面的格式按需裁剪，不为简短追问重复访谈或强制完整模板。示例是写法参考，不是本次任务的事实。

平台占位符仅表示资料类型。只使用当前会话实际提供、已授权且支持相应操作的工具；缺少工具时使用用户材料或说明缺口。不要假设已连接 CRM、日历、全库搜索或工单写入。外部发布、发信、创建任务和流程变更必须符合用户请求与宿主权限，并以真实工具结果为准。不要把草稿或建议说成已执行。

先确定报告周期与口径；开发完成、验收通过、上线是不同状态。完成数含未验收项时分别展示，不偷换完成率的分子。没有上期数据时不判断趋势，没有目标时不填达标状态；预算消耗比例不等于项目完成比例。任务数比例不是加权进度；没有任务工作量/成本权重、计划成本和剩余成本估算，不得因80%花费与40%验收项数的差值判断成本效率低或预算不匹配，也不能断言剩余预算需要覆盖哪些范围。只能给出各自口径，并提出核对剩余成本的建议。关键数字给分子、分母和来源，风险依据、建议措施与已执行动作分列。整体红黄绿状态只有在依据明确时使用并说明判断；缺少口径时标记待确认。负责人、未来日期、行动和承诺不得由模板补造。建议与用户已承诺计划分开。不要添加本次资料没有的指标或成果。


# /status-report

平台资料使用方式见本文件的 Space 适配。

Generate a polished status report for leadership or stakeholders. Use the supplied risk criteria; if absent, explain your assessment rather than inventing a company risk matrix.

## Usage

```
/status-report <任务描述>
```

## Output

```markdown
## Status Report: [Project/Team] — [Period]
**Author:** [Name] | **Date:** [Date]

### Executive Summary
[3-4 sentence overview — what's on track, what needs attention, key wins]

### Overall Status: 🟢 On Track / 🟡 At Risk / 🔴 Off Track

### Key Metrics
| Metric | Target | Actual | Trend | Status |
|--------|--------|--------|-------|--------|
| [KPI] | [Target] | [Actual] | [up/down/flat] | 🟢/🟡/🔴 |

### Accomplishments This Period
- [Win 1]
- [Win 2]

### In Progress
| Item | Owner | Status | ETA | Notes |
|------|-------|--------|-----|-------|
| [Item] | [Person] | [Status] | [Date] | [Context] |

### Risks and Issues
| Risk/Issue | Impact | Mitigation | Owner |
|------------|--------|------------|-------|
| [Risk] | [Impact] | [What we're doing] | [Who] |

### Decisions Needed
| Decision | Context | Deadline | Recommended Action |
|----------|---------|----------|--------------------|
| [Decision] | [Why it matters] | [When] | [What I recommend] |

### Next Period Priorities
1. [Priority 1]
2. [Priority 2]
3. [Priority 3]
```

## 使用外部资料与交付

需要外部资料时，先判断当前会话是否提供相应读取或搜索能力；按用户指定范围操作，不能因为已连接某服务就扫描全部资料。用户要求写入在线文档时，只使用实际支持创建/追加的连接器；否则给出缺口和可供用户处理的文稿，不声称已经发布或创建任务。

## Tips

1. **Lead with the headline** — Busy leaders read the first 3 lines. Make them count.
2. **Be honest about risks** — Surfacing issues early builds trust. Surprises erode it.
3. **Make decisions easy** — For each decision needed, provide context and a recommendation.
