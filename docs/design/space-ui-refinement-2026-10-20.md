# F147 follow-up — Typography, settings navigation, and component refinement

## Source and findings

The user supplied three 1920px-wide screenshots: Codex, ZCode, and Space `0.1.47-alpha.3`. These are visual references, not a request to copy their branding or product model. The existing warm graphite/paper direction remains the selected design.

1. **Project navigation:** Space gives primary project/session labels the same small treatment as metadata. Source inspection confirms 12px labels and some 9–11px secondary copy. Use 14px primary labels, 12px metadata, and stable 36px session rows. Preserve all project/session actions and parallel-run indicators.
2. **Settings:** the project sidebar remains beside a second settings sidebar. Settings must replace the project navigation visually. Keep the project/files navigation mounted, hidden, and inert; restore its mode, width, scroll and the current workspace on exit. Settings has one navigation column, matching the saved sidebar width on desktop and existing responsive navigation on narrow windows. Six categories, editing state, keyboard navigation and direct settings entry points remain intact.
3. **Conversation components:** the supplied Space screenshot shows large yellow message-wide status bands competing with the actual conversation. Replace the visual treatment with compact, left-aligned semantic notices. Preserve every original message, diagnostic detail, action, retry countdown, copy action and timestamp. User messages use a quieter surface; assistant text remains a document flow with the existing user-selectable transcript sizes.
4. **Controls:** refine common menu panels, tool-call headers, composer controls, settings fields, selection cards and inspector headings. Establish clear primary, secondary and status hierarchy through spacing, readable type, borders and restrained state color. Keep existing handlers, capability gates, attachments and keyboard behavior.

The screenshots establish visible density and hierarchy problems; they do not establish OS/DPI equivalence, cross-device performance, screen-reader compliance, or the behavior of settings without an actual runtime check. Validate the settings transition and final desktop/narrow layouts in the isolated Electron acceptance environment.

## Protected surfaces and constraints

- Keep `ContextWindowIndicator`, its liquid gauge, session token indicator, calculation, breakdown and SDK statistics contracts unchanged. No broad root/rem scaling or generic composer-button rule may alter these controls.
- Keep the existing two mascot variants, positioning, mode preference and motion guards.
- Keep all functionality unless the user explicitly agrees to a removal. The previously approved Workflow navigation downgrade remains in effect.
- No new SDK, IPC, persistence, dependencies, theme modes or user configuration. This is a source-only follow-up to the already released alpha.3, without changing its version or release claims.
- Long transcripts, notices, tool records and menus use solid/material colors without background blur. Glass remains local to stationary chrome/composer; minimal quality and reduced motion remain authoritative. No new per-message animation loops or layout measurements in the production render path.

## Implementation slices and public acceptance seams

1. Update the existing integrated-workspace acceptance test to fail on the old double navigation; implement replacement navigation and restoration for Coder, Partner, files mode, focus and narrow windows. Background projects continue running.
2. Apply scoped UI typography and component styles. Preserve transcript font-size controls and the protected context UI. No implementation-shaped tests for visual-only changes; inspect actual screenshots instead.
3. Exercise existing settings, menus, transcript/notice/tool, composer and project regressions; capture Chinese light/dark workspaces, settings and representative controls at matching viewports.
4. Run appropriate unit tests, typecheck, lint and production build. Review the final diff independently against repository standards and this scope before committing.

## Standards

Independent read-only review against `AGENTS.md`, `CONTRIBUTING.md` and the code-review skill's 12-smell baseline found one documentation issue: the in-app manual still described the old visible project sidebar during settings. The conflicting paragraph has been removed and the settings navigation, restoration and background-run behavior consolidated. The reviewer rechecked the corrective delta and found no remaining written-standard violations or actionable smells.

## Spec

Independent read-only review found two boundary issues: resizing while settings was open could unmount the hidden files navigation, and a percentage width cap could shrink a saved wide sidebar. Settings now retains the navigation mounting decision made at entry, and desktop settings uses the saved navigation width. The existing files regression now covers a 400px sidebar at a 1000px viewport, a narrow-window round trip and search restoration. The reviewer rechecked these fixes and found no remaining requirement gaps or scope creep.

Review totals: Standards 1 initial finding (P3), 0 unresolved; Spec 2 initial findings (P2), 0 unresolved. These are static reviews; runtime verification is recorded in the linked F147 test guide.
