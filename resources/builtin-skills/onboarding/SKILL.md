---
name: onboarding
description: Generate an onboarding checklist and first-week plan for a new hire. Use when someone has a start date coming up, building the pre-start task list (accounts, equipment, buddy), scheduling Day 1 and Week 1, or setting 30/60/90-day goals for a new team member.
argument-hint: "<new hire name and role>"
---

## Space 适配（2026-09-08）

使用当前会话已有资料和实际可用工具，按用户语言及篇幅交付。工具类别不是授权；不能假设CRM、HRIS、日历写入或全库检索已接入。缺少工具时用用户材料继续并说明缺口。外发、邀约、账号开通和系统变更须有用户明确要求及真实工具结果，草稿不能写成已执行。下面的示例是模板，不是事实；短追问不重复完整访谈。

先核对入职日期、工作日安排、角色和已有制度，不假设当地周末、节假日或部门时区。日程是建议，不能伪称邀请已发出、设备已采购或账号已开通。账号仅列所需最小权限及审批责任人，不收集密码或替用户开权。公司制度、培训时长、导师人选未知则标待确认；30/60/90天目标按岗位设计可观察成果，不擅自承诺生产权限或独立上线。明确每项负责人/依赖/完成证据，首日与首周适度排期，保留正常工作和答疑时间。

# /onboarding

工具可用性遵循本文件 Space 适配。

Generate a comprehensive onboarding plan for a new team member.

## Usage

```
根据用户本次入职需求制定计划
```

## What I Need From You

- **New hire name**: Who's starting?
- **Role**: What position?
- **Team**: Which team are they joining?
- **Start date**: When do they start?
- **Manager**: Who's their manager?

## Output

```markdown
## Onboarding Plan: [Name] — [Role]
**Start Date:** [Date] | **Team:** [Team] | **Manager:** [Manager]

### Pre-Start (Before Day 1)
- [ ] Send welcome email with start date, time, and logistics
- [ ] Set up accounts: email, Slack, [tools for role]
- [ ] Order equipment (laptop, monitor, peripherals)
- [ ] Add to team calendar and recurring meetings
- [ ] Assign onboarding buddy: [Suggested person]
- [ ] Prepare desk / remote setup instructions

### Day 1
| Time | Activity | With |
|------|----------|------|
| 9:00 | Welcome and orientation | Manager |
| 10:00 | IT setup and tool walkthrough | IT / Buddy |
| 11:00 | Team introductions | Team |
| 12:00 | Welcome lunch | Manager + Team |
| 1:30 | Company overview and values | Manager |
| 3:00 | Role expectations and 30/60/90 plan | Manager |
| 4:00 | Free time to explore tools and docs | Self |

### Week 1
- [ ] Complete required compliance training
- [ ] Read key documentation: [list for role]
- [ ] 1:1 with each team member
- [ ] Shadow key meetings
- [ ] First small task or project assigned
- [ ] End-of-week check-in with manager

### 30-Day Goals
1. [Goal aligned to role]
2. [Goal aligned to role]
3. [Goal aligned to role]

### 60-Day Goals
1. [Goal]
2. [Goal]

### 90-Day Goals
1. [Goal]
2. [Goal]

### Key Contacts
| Person | Role | For What |
|--------|------|----------|
| [Manager] | Manager | Day-to-day guidance |
| [Buddy] | Onboarding Buddy | Questions, culture, navigation |
| [IT Contact] | IT | Tool access, equipment |
| [HR Contact] | HR | Benefits, policies |

### Tools Access Needed
| Tool | Access Level | Requested |
|------|-------------|-----------|
| [Tool] | [Level] | [ ] |
```

## If Connectors Available

If **~~HRIS** is connected:
- Pull new hire details and team org chart
- Auto-populate tools access list based on role

If **~~knowledge base** is connected:
- Link to relevant onboarding docs, team wikis, and runbooks
- Pull the team's existing onboarding checklist to customize

If **~~calendar** is connected:
- Draft proposed Day 1 and Week 1 schedules. Create invitations only when explicitly requested and supported by the authorized tool.

## Tips

1. **Customize for the role** — An engineer's onboarding looks different from a designer's.
2. **Don't overload Day 1** — Focus on setup and relationships. Deep work starts Week 2.
3. **Assign a buddy** — Having a go-to person who isn't their manager makes a huge difference.
