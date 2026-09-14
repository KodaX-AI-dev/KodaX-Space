---
name: knowledge-synthesis
description: Combines search results from multiple sources into coherent, deduplicated answers with source attribution. Handles confidence scoring based on freshness and authority, and summarizes large result sets effectively.
---

## Space 适配（2026-09-08）

使用当前会话已有资料，按用户语言和当前问题交付；下面的格式按需裁剪，不为简短追问重复访谈或强制完整模板。示例是写法参考，不是本次任务的事实。

平台占位符仅表示资料类型。只使用当前会话实际提供、已授权且支持相应操作的工具；缺少工具时使用用户材料或说明缺口。不要假设已连接 CRM、日历、全库搜索或工单写入。外部发布、发信、创建任务和流程变更必须符合用户请求与宿主权限，并以真实工具结果为准。不要把草稿或建议说成已执行。

整理已提供或实际读取的资料，输出主题条目、来源索引、已确认结论与冲突/待确认项；必要时提供可编辑 Markdown。来源标题、日期、作者、地址未知时明确缺失，不虚构链接。转载、转发、同一来源摘要只算一条证据链。判断权威性要结合审批/生效状态和适用范围，不能仅按文件类型或最新时间决定；新聊天建议不能替代仍生效的正式政策。保留矛盾双方和依据，未知时不自行裁决。示例中的人物、日期和决策不能带入本次条目。本方法整理资料与引用，不自动建立全盘索引、永久记忆或维护用户知识库。


# Knowledge Synthesis

The last mile of enterprise search. Takes raw results from multiple sources and produces a coherent, trustworthy answer.

## The Goal

Transform this:
```
~~chat result: "Sarah said in #eng: 'let's go with REST, GraphQL is overkill for our use case'"
~~email result: "Subject: API Decision — Sarah's email confirming REST approach with rationale"
~~cloud storage result: "API Design Doc v3 — updated section 2 to reflect REST decision"
~~project tracker result: "Task: Finalize API approach — marked complete by Sarah"
```

Into this:
```
The team decided to go with REST over GraphQL for the API redesign. Sarah made the
call, noting that GraphQL was overkill for the current use case. This was discussed
in #engineering on Tuesday, confirmed via email Wednesday, and the design doc has
been updated to reflect the decision. The related ~~project tracker task is marked complete.

Sources:
- ~~chat: #engineering thread (Jan 14)
- ~~email: "API Decision" from Sarah (Jan 15)
- ~~cloud storage: "API Design Doc v3" (updated Jan 15)
- ~~project tracker: "Finalize API approach" (completed Jan 15)
```

## Deduplication

### Cross-Source Deduplication

The same information often appears in multiple places. Identify and merge duplicates:

**Signals that results are about the same thing:**
- Same or very similar text content
- Same author/sender
- Timestamps within a short window (same day or adjacent days)
- References to the same entity (project name, document, decision)
- One source references another ("as discussed in ~~chat", "per the email", "see the doc")

**How to merge:**
- Combine into a single narrative item
- Cite all sources where it appeared
- Use the most complete version as the primary text
- Add unique details from each source

### Deduplication Priority

When the same information exists in multiple sources, prefer:
```
1. The most complete version (fullest context)
2. The most authoritative source (official doc > chat)
3. The most recent version (latest update wins for evolving info)
```

### What NOT to Deduplicate

Keep as separate items when:
- The same topic is discussed but with different conclusions
- Different people express different viewpoints
- The information evolved meaningfully between sources (v1 vs v2 of a decision)
- Different time periods are represented

## Citation and Source Attribution

Every claim in the synthesized answer must be attributable to a source.

### Attribution Format

Inline for direct references:
```
Sarah confirmed the REST approach in her email on Wednesday.
The design doc was updated to reflect this (~~cloud storage: "API Design Doc v3").
```

Source list at the end for completeness:
```
Sources:
- ~~chat: #engineering discussion (Jan 14) — initial decision thread
- ~~email: "API Decision" from Sarah Chen (Jan 15) — formal confirmation
- ~~cloud storage: "API Design Doc v3" last modified Jan 15 — updated specification
```

### Attribution Rules

- Always name the source type (~~chat, ~~email, ~~cloud storage, etc.)
- Include the specific location (channel, folder, thread)
- Include the date or relative time
- Include the author when relevant
- Include document/thread titles when available
- For ~~chat, note the channel name
- For ~~email, note the subject line and sender
- For ~~cloud storage, note the document title

## Confidence Levels

Not all results are equally trustworthy. Assess confidence based on:

### Freshness

| Recency | Confidence impact |
|---------|------------------|
| Today / yesterday | High confidence for current state |
| This week | Good confidence |
| This month | Moderate — things may have changed |
| Older than a month | Lower confidence — flag as potentially outdated |

For status queries, heavily weight freshness. For policy/factual queries, freshness matters less.

### Authority

| Source type | Authority level |
|-------------|----------------|
| Official wiki / knowledge base | Highest — curated, maintained |
| Shared documents (final versions) | High — intentionally published |
| Email announcements | High — formal communication |
| Meeting notes | Moderate-high — may be incomplete |
| Chat messages (thread conclusions) | Moderate — informal but real-time |
| Chat messages (mid-thread) | Lower — may not reflect final position |
| Draft documents | Low — not finalized |
| Task comments | Contextual — depends on commenter |

### Expressing Confidence

When confidence is high (multiple fresh, authoritative sources agree):
```
The team decided to use REST for the API redesign. [direct statement]
```

When confidence is moderate (single source or somewhat dated):
```
Based on the discussion in #engineering last month, the team was leaning
toward REST for the API redesign. This may have evolved since then.
```

When confidence is low (old data, informal source, or conflicting signals):
```
I found a reference to an API migration discussion from three months ago
in ~~chat, but I couldn't find a formal decision document. The information
may be outdated. You might want to check with the team for current status.
```

### Conflicting Information

When sources disagree:
```
I found conflicting information about the API approach:
- The ~~chat discussion on Jan 10 suggested GraphQL
- But Sarah's email on Jan 15 confirmed REST
- The design doc (updated Jan 15) reflects REST

The most recent sources indicate REST was the final decision,
but the earlier ~~chat discussion explored GraphQL first.
```

Always surface conflicts rather than silently picking one version.

## Summarization Strategies

### For Small Result Sets (1-5 results)

Present each result with context. No summarization needed — give the user everything:
```
[Direct answer synthesized from results]

[Detail from source 1]
[Detail from source 2]

Sources: [full attribution]
```

### For Medium Result Sets (5-15 results)

Group by theme and summarize each group:
```
[Overall answer]

Theme 1: [summary of related results]
Theme 2: [summary of related results]

Key sources: [top 3-5 most relevant sources]
Full results: [count] items found across [sources]
```

### For Large Result Sets (15+ results)

Provide a high-level synthesis with the option to drill down:
```
[Overall answer based on most relevant results]

Summary:
- [Key finding 1] (supported by N sources)
- [Key finding 2] (supported by N sources)
- [Key finding 3] (supported by N sources)

Top sources:
- [Most authoritative/relevant source]
- [Second most relevant]
- [Third most relevant]

Found [total count] results across [source list].
Want me to dig deeper into any specific aspect?
```

### Summarization Rules

- Lead with the answer, not the search process
- Do not list raw results — synthesize them into narrative
- Group related items from different sources together
- Preserve important nuance and caveats
- Include enough detail that the user can decide whether to dig deeper
- Always offer to provide more detail if the result set was large

## Synthesis Workflow

```
[Raw results from all sources]
          ↓
[1. Deduplicate — merge same info from different sources]
          ↓
[2. Cluster — group related results by theme/topic]
          ↓
[3. Rank — order clusters and items by relevance to query]
          ↓
[4. Assess confidence — freshness × authority × agreement]
          ↓
[5. Synthesize — produce narrative answer with attribution]
          ↓
[6. Format — choose appropriate detail level for result count]
          ↓
[Coherent answer with sources]
```

## Anti-Patterns

**Do not:**
- List results source by source ("From ~~chat: ... From ~~email: ... From ~~cloud storage: ...")
- Include irrelevant results just because they matched a keyword
- Bury the answer under methodology explanation
- Present conflicting info without flagging the conflict
- Omit source attribution
- Present uncertain information with the same confidence as well-supported facts
- Summarize so aggressively that useful detail is lost

**Do:**
- Lead with the answer
- Group by topic, not by source
- Flag confidence levels when appropriate
- Surface conflicts explicitly
- Attribute all claims to sources
- Offer to go deeper when result sets are large
