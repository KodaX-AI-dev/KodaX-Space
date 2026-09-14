---
name: process-doc
description: Document a business process — flowcharts, RACI, and SOPs. Use when formalizing a process that lives in someone's head, building a RACI to clarify who owns what, writing an SOP for a handoff or audit, or capturing the exceptions and edge cases of how work actually gets done.
argument-hint: "<process name or description>"
---

## Space 适配（2026-09-08）

使用当前会话已有资料，按用户语言和当前问题交付；下面的格式按需裁剪，不为简短追问重复访谈或强制完整模板。示例是写法参考，不是本次任务的事实。

平台占位符仅表示资料类型。只使用当前会话实际提供、已授权且支持相应操作的工具；缺少工具时使用用户材料或说明缺口。不要假设已连接 CRM、日历、全库搜索或工单写入。外部发布、发信、创建任务和流程变更必须符合用户请求与宿主权限，并以真实工具结果为准。不要把草稿或建议说成已执行。

先区分当前实际流程与建议改进。逐步记录输入、触发、角色、判断条件、输出、交接和异常返回点；条件边界（如“超过”与“达到”）必须保留。用一条正常路径和一条例外路径检查是否能走通。RACI、时间目标、审批人、版本和复审周期缺失时标记待确认，不根据通用模板编造企业制度。只有明确给出的角色才可写入现行责任表；建议角色单列。优化后的流程是待确认提案。审批不通过只能阻止采购，不能擅自规定永久关闭申请。补齐资料后的重新提交入口和已完成审批是否保留若未给出，标记待确认；检查流程走通时显式保留这些待决节点，不用常识替企业制定规则。


# /process-doc

平台资料使用方式见本文件的 Space 适配。

Document a business process as a complete standard operating procedure (SOP).

## Usage

```
/process-doc <任务描述>
```

## How It Works

Walk me through the process — describe it, paste existing docs, or just tell me the name and I'll ask the right questions. I'll produce a complete SOP.

## Output

```markdown
## Process Document: [Process Name]
**Owner:** [Person/Team] | **Last Updated:** [Date] | **Review Cadence:** [Quarterly/Annually]

### Purpose
[Why this process exists and what it accomplishes]

### Scope
[What's included and excluded]

### RACI Matrix
| Step | Responsible | Accountable | Consulted | Informed |
|------|------------|-------------|-----------|----------|
| [Step] | [Who does it] | [Who owns it] | [Who to ask] | [Who to tell] |

### Process Flow
[ASCII flowchart or step-by-step description]

### Detailed Steps

#### Step 1: [Name]
- **Who**: [Role]
- **When**: [Trigger or timing]
- **How**: [Detailed instructions]
- **Output**: [What this step produces]

#### Step 2: [Name]
[Same format]

### Exceptions and Edge Cases
| Scenario | What to Do |
|----------|-----------|
| [Exception] | [How to handle it] |

### Metrics
| Metric | Target | How to Measure |
|--------|--------|----------------|
| [Metric] | [Target] | [Method] |

### Related Documents
- [Link to related process or policy]
```

## 使用外部资料与交付

需要外部资料时，先判断当前会话是否提供相应读取或搜索能力；按用户指定范围操作，不能因为已连接某服务就扫描全部资料。用户要求写入在线文档时，只使用实际支持创建/追加的连接器；否则给出缺口和可供用户处理的文稿，不声称已经发布或创建任务。

## Tips

1. **Start messy** — You don't need a perfect description. Tell me how it works today and I'll structure it.
2. **Include the exceptions** — "Usually we do X, but sometimes Y" is the most valuable part to document.
3. **Name the people** — Even if roles change, knowing who does what today helps get the process right.
