# KodaX Space · UI direction previews

Date: 2026-10-16. Output: three independent HTML direction studies, presented in one switchable browser preview. These are visual/interactive drafts, not production implementation.

## Product facts and assets

- Product: KodaX Space, a local-first, provider-neutral desktop agent workbench. It has Coder and Partner surfaces. Source authority: root README, docs/PRD.md, renderer shell.
- Existing UI: three inset rounded card panels, Geist/JetBrains Mono/Lucide, amber UI accent. Recommended new direction: continuous main workspace, quieter navigation, contextual inspector.
- Official repo icon: resources/icon.png, inspected 2026-10-16. It is a green K on dark square. Use it unchanged; do not redraw/recolor it. The green icon and amber UI accent are intentional existing product materials.
- Actual bundled Geist Variable, JetBrains Mono Variable and actual installed Lucide SVGs are supplied through injection placeholders. No network or CDN needed in final HTML.
- No runtime UI screenshot was acquired. This is a proposed redesign derived from current source and research, not a pixel clone of a screenshot.
- These HTML files contain explicit sample content for visual comparison; no actual tool calls, credentials, files, model responses or testing are represented as live data.

## Shared sample content (must remain recognizable in all three)

Workspace: KodaX-Space; branch codex/workspace-refresh.
Navigation sessions: 界面与交互重构 (selected), 排查流式输出延迟, 整理发布说明, 更新安装文档.
Task: 重新设计工作区布局，让内容成为主角。
User message: 保留多项目和任务切换。中间用完整画布，工具过程收起来，需要时再展开。
Agent response: 我会把导航、对话和成果分清层次，先调整工作区结构，再统一组件细节。
Phase group: 已梳理工作区结构 · 读取 8 个文件 · 找到 3 处重复容器. Details can be expanded.
Result: 改动已经准备好; continuous canvas; quiet navigation; contextual review.
Files: Shell.tsx +24 −38, styles.css +42 −65, RightSidebarFrame.tsx +8 −19.
Review values: 3 个文件, +74 −122. These values are sample data, not real current git modifications.
Task stages: 梳理结构 (done), 调整布局 (done), 校准组件 (current), 检查明暗主题 (pending).
Composer placeholder: 继续调整，或输入新的想法…
Model display: 默认模型 (avoid competitor/provider brand logos in these drafts).

## Shared requirements

- Main workspace reaches pane edges: no centered rounded app card, no giant marketing hero, no gradients as filler. Brand/foreground should be deliberate.
- Realistic full workspace at 1440×900 (also fit 1280×800). Account for parent preview toolbar (~64px) when embedded.
- Body ≥14px; UI labels ≥12px; readable contrast. CJK system fallback explicit. Clear visual focus point, sufficient information density without tiny text.
- At least theme toggle, inspector/details toggle, tool step expand/collapse, Coder/Partner content switch, composer send demonstration or review toggle should work. No real network or external execution.
- Keep outputs within this directory. Own only your assigned HTML. Do not modify production code, other variants, or shared data.
- Reduced-motion support, keyboard focus, semantic labels, overflow protection. No console.log, no any, no silent error swallowing.
- Inline comments at top explain assumptions, form, sample data, and interaction scope. Do not add watermarks.
- Every preview supports URL query `?embed=1`; embedded mode must not show its own design-explainer toolbar. Let the parent show navigation. Standalone can show a small 32px hint bar, but it must be hideable.

## Asset injection contract

Use `__FONT_FACES__` once inside your CSS. Root replaces this with local-font @font-face declarations.
Use `<img src="__SPACE_LOGO__" alt="KodaX Space" ...>` for repo logo.
Before code using icons, include `const ICONS = __LUCIDE_ICONS__;` in your inline JS. Root replaces with JSON name→SVG markup.
Available names: PanelLeft, PanelRight, Search, Plus, ChevronDown, ChevronRight, ArrowUp, ArrowLeft, ArrowRight, ArrowUpRight, Check, X, MoreHorizontal, Folder, FolderOpen, File, FileCode, GitBranch, GitPullRequest, Circle, CircleCheck, CircleDot, Clock3, Settings2, Settings, Sun, Moon, Command, Sparkles, Paperclip, Terminal, Code2, Files, List, LayoutPanelLeft, Maximize2, Minimize2, ExternalLink, Copy, Play, Square, Eye, MessageSquare, Layers, Zap, GripVertical, Lightbulb, ArrowDown, Undo2, Send, CheckCheck, PanelLeftClose, PanelRightClose.
These are actual Lucide SVGs, not handcrafted imitations. Insert them into desired elements, do not rewrite paths.

## Form intent

- Narrative role: active task workbench, not overview dashboard.
- Viewing distance: laptop/desktop working distance, content readable at native scale.
- Temperature: calm, exact, warm; comparison direction may be more expressive, within workbench needs.
- Capacity: one active task, a compact execution trace, visible composer, three sample files, a task outline.
- Content-specific motif: human instruction → compressed execution → inspectable result. Use spatial continuity to make that progression legible.

The user requested a quick webpage to see the recommended design. Deliver the tangible previews now; wait for preference before a production integration.
