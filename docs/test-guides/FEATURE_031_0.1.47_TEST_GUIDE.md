# F031/F035 — Composer token regression guide

Source enhancement, 2026-11-06; not a published release. The approved [design](../research/composer-completion-comparison-2026-11-06.md#7-追加视觉与交互的完整推荐方案) covers command, skill and file completion plus visual treatment.

## 2026-11-07 light inline references

- The approved [visual research](../research/composer-atomic-tag-components-2026-11-07.md) is implemented through composer CSS only: blue file, violet skill, amber command inks; no persistent border/background, matching prose text size and line height, font-scaled icons and soft hover/selection.
- RED: the actual editor appearance test initially observed only one category color. GREEN checks three distinct inks, normal text contrast >=4.5 against both theme canvases, transparent default surfaces, typography, icon color, stable hover geometry, narrow ellipsis and retained canonical title/value. This is canvas contrast, not a claim for every possible composited material background.
- `ComposerEditor.test.ts` continues to exercise whole-token deletion, undo/copy/paste/restore and readonly guards. `composer-tokens.spec.ts` remains the real Electron completion/send regression.
- Current screenshots/verification records are kept locally in `artifacts/composer-light-references/`. The isolated editor fixture is not a complete Space screenshot; actual Electron evidence is recorded separately after build.
- This small CSS refinement uses targeted editor/Electron regression and static/build checks; it does not claim a rerun of the full repository suite or replace the known unrelated work-mode failures recorded in the [settings verification](../research/settings-navigation-implementation-2026-11-07.md).

## Automated acceptance

- `ComposerEditor.test.ts`: actual Chromium input, canonical copy/internal paste, atomic Backspace, undo, external clear/restore, newline, read-only deletion and Ctrl+Backspace word navigation.
- `projectFileReference.test.ts`: unchanged simple `@path`, escaped spaces/brackets/Chinese names and Windows drive/UNC native path round trips.
- `composer-tokens.spec.ts`: actual isolated Electron completion → token → delete/undo → IPC send → rejected-send restoration. The Main handler captures exactly `Inspect @src/composer-demo.ts`; it returns a deterministic rejection without calling a model. Token labels, categories and local detail metadata are not appended to the prompt.
- Existing compact/send/retry, attachments, Partner draft insertion and session deletion tests use the same composer public boundary after migrating textarea-only selectors.

## Human checks

1. Open a project, type `/`, choose a command/skill using Tab or Enter. Inspect grouped names, descriptions, type icons and stable amber selection. Enter accepts without sending. Escape dismisses only the current surface. Shift+Enter inserts a newline; Ctrl/Cmd+Enter retains queue semantics.
2. Type `@` and select files with ordinary, long, Chinese, spaced and bracketed names. Inspect the filename label and full reference detail; keep two same-name files from different directories distinguishable through their full details.
3. Continue typing after a token. Move left/right, delete from both sides, select across a token, cut/copy/paste, undo/redo. No partial path should remain. Delete one of two identical inserted references without deleting the other. Auto-added spacing must not swallow authored text.
4. Click a token or use Alt+Down near it. Inspect full identity, copy reference, remove, close and keyboard return. Copy failure must show feedback. Busy/read-only input must not mutate.
5. Confirm Chinese IME candidates using Enter/space and arrows. Composing must not send or select completion. Try multi-line input and boundary history navigation.
6. Reject a send, switch session/project while a send is pending, and retry. Confirm correct draft ownership, complete reference identity and no overwrite of newly authored input. Historical plain text remains usable without guessing identities.
7. Inspect light/dark themes, available input widths around 320/480/720px and 100/125/150% scale. Check wrapping, focus, full-path details, menu reachability and no horizontal overflow. Context gauge and mascot behavior remain independent. Minimal quality/reduced motion must remain usable.

## Performance and token contract

Completion uses the existing local IPC catalogs/search, with file-search debounce and stale-request cancellation. It does not invoke a provider. Lexical owns text/selection; React receives the existing canonical string. Full JSON snapshots are captured only for external draft replacement, capped at 20 entries and isolated by project, rather than on every keystroke. No token/category/path-detail JSON, new instruction or expanded skill body is added to `session.send`.

Measure typing with representative long drafts and many references in the actual app. A renderer build and passing tests establish functional evidence, not a universal latency or visual-quality guarantee on all hardware.

## Validation record

The initial complete Desktop run reported 4,158 passed / 3 failed / 13 skipped. The three failures were old Partner textarea selectors; after migration all six affected Partner tests passed. The subsequent complete renderer run passed 380/380. Final focused editor/path/Partner/slash tests passed 24/24. The actual Windows Electron suite passed 9/9 (command/skill/file selection, delete/undo, exact IPC prompt/rejected-send restore, compact clear/spinner, session deletion, file/image attachments, send/reply and retry). The final token pair was rebuilt and passed again after whitespace reuse and filename disambiguation changes. Typecheck, root lint, build:smoke and diff whitespace checks passed. Both independent review axes cleared their findings. Do not reinterpret the initial full run as an unqualified all-green run.

Optional browser V8 byte coverage: `COMPOSER_COVERAGE=1 node --import tsx --test apps/desktop/renderer/src/shell/ComposerEditor.test.ts`. The generated `artifacts/composer/browser-coverage.json` records 86.69% across the four executable editor modules (84.74 / 86.84 / 89.04 / 88.00%). This is generated-JavaScript byte coverage mapped by module boundaries, not repository-wide statement/branch coverage. Light, dark, narrow-window and grouped-menu screenshots are captured by `composer-tokens.spec.ts` and were visually inspected.


### Standards review

Final unresolved findings: 0. The independent review identified an oversized Bridge function, missing manual updates, unused direct dependencies and a read-only capture deletion bypass. These were corrected through focused hooks/handlers, both manuals, dependency cleanup and editable guards with browser tests.

### Spec review

Final unresolved findings: 0. The independent review identified Enter event ordering, canonical selection/copy coordinates, special-path formatting, modified Backspace routing and duplicate separators. All were corrected and covered by browser or actual IPC assertions. Same-basename labels now gain distinguishing directories while canonical values remain unchanged. Automatic separators have their own local node identity so authored spaces are preserved.

## 2026-11-07 verification result

- Actual ComposerEditor Chromium tests: 2/2 passed, covering existing atomic editing and the added appearance/contrast checks. Electron completion/send tests: 2/2 passed after disabling screenshot animations to capture stable theme states.
- Typecheck, root lint and build:smoke passed. The build retains existing chunk-size/Browserslist notices. No new production JavaScript, dependency, timer, model call or prompt expansion was introduced.
- Three final isolated-editor images and three stable actual-Electron images (light/dark/narrow) were opened and inspected. Evidence is retained locally in `artifacts/composer-light-references/`; the latter comes from `test-results/composer-tokens-file-compl-7b421-the-existing-path-reference/`.

## Standards

2026-11-07 visual refinement, independent review against the immutable per-task patch and AGENTS.md/Fowler baseline: 0 unresolved findings. Preserving inline-block, ellipsis and pseudo-element icons avoids changing Lexical text DOM; category inks are scoped theme variables. Browser tests were independently rerun 2/2.

## Spec

2026-11-07 visual refinement, independent review against the approved reference research and category-color request: 0 unresolved findings. Borderless references, matching prose typography, colored icons, soft hover/native selection, unchanged identities and editing behavior satisfy the scope. Actual desktop checks followed the static review; the added E2E change only disables capture animations.
