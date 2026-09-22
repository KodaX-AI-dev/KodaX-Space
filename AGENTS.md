# Development Rules

Spend time on thinking. DO NOT send optional commentary.

---

**⚠️ CORE PHILOSOPHY: Minimalist & Intelligent**

> **Add code cautiously** — Before adding: Is it necessary? Is it minimal? Is it LLM-friendly?
> **Avoid over-engineering** — Never design for hypothetical needs. Abstract only after 3+ real cases.
> **Leverage LLM intelligence** — Design for LLM comprehension. Use LLM for generation, review, and testing.

---

## First Message

If the user did not give a concrete task, read `README.md`, then check `docs/` for context:

- `docs/PRD.md` — product requirements
- `docs/ADR/README.md` — architecture decisions
- `docs/FEATURE_LIST.md` — Space feature planning
- `docs/partner/README.md` — Partner product-line documentation
- `docs/partner/FEATURE_LIST.md` — Partner-only `PF###` planning

## Partner Branch Policy (2026-09-17)

For this Partner development line, all code, fixes, tests, and documentation use the single
branch `feature/partner-maintenance-20260917` in `KodaX-AI-dev/KodaX-Space`.
Continue updating that branch; do not split routine uploads across the three historical
beta.3 branches or automatically create a new branch for each change.

- Do not modify, commit on, push to, merge into, reset, or delete `main`.
- Do not create PRs targeting `main`, enable auto-merge, or merge such PRs on the user's behalf.
- Fetch `origin/main` only as an upstream source. Bring needed upstream changes into the
  Partner branch; never send Partner changes back into `main` under this policy.
- When uploading, verify the current branch and explicitly target
  `HEAD:refs/heads/feature/partner-maintenance-20260917`. Do not force-push or use
  `--all`, `--mirror`, or `--tags`.
- Branch delivery does not authorize release tags, an organization GitHub Release, or
  update-channel changes. The one-time beta.3/main authorization is historical and expired.
- Follow the existing document layout: Partner-specific material in `docs/partner/`,
  shared Space contracts in the existing global docs. Do not restore the old local source tree.

Changing this branch policy requires a new explicit user instruction. See
[Partner development workflow](docs/partner/DEVELOPMENT.md) for the upload and upstream-sync steps.

## Code Addition Discipline

**Before adding code, ask**:

1. Is it **necessary**? Can existing code solve it?
2. Is it the **minimal** solution? Can I do the same with less?
3. Is it **LLM-friendly**? Can an LLM understand and extend it?

**Rules**:

- ✅ Composition over inheritance
- ✅ Small focused functions (< 50 lines, single responsibility)
- ✅ Clear, self-documenting names
- ✅ Data-driven over complex control flow
- ✅ Explicit over implicit; structured types as context
- ❌ NEVER add "flexibility" for hypothetical futures (YAGNI)
- ❌ NEVER abstract until 3+ concrete use cases
- ❌ NEVER add config options unless required
- ❌ NEVER deep inheritance / nested factories / sprawling state machines

## LLM-First Design

- ✅ Predictable patterns, type hints, structured data — LLM uses them as context
- ✅ Use LLM for generation, review, refactoring, test-case generation, docs
- ✅ Let LLM handle boilerplate; humans focus on business logic

**Project docs (`docs/`)**

| File                      | Purpose                                | Required    |
| ------------------------- | -------------------------------------- | ----------- |
| `PRD.md`                  | Product Requirements                   | ✅          |
| `ADR/README.md`           | Architecture Decision Records          | ✅          |
| `HLD.md`                  | High-Level Design                      | ✅          |
| `DD.md`                   | Detailed Design                        | ✅          |
| `FEATURE_LIST.md`         | Space-wide `F###` feature tracking     | ✅          |
| `partner/README.md`       | Partner product-line documentation hub | ✅          |
| `partner/FEATURE_LIST.md` | Partner-only `PF###` feature tracking  | ✅          |
| `KNOWN_ISSUES.md`         | Known issues / workarounds             | ⚠️ Optional |
| `features/v{VERSION}.md`  | Per-version feature design             | ✅          |
| `test-guides/*.md`        | Human test guides                      | ✅          |

**Root docs**

| File              | Purpose                             | Required    |
| ----------------- | ----------------------------------- | ----------- |
| `README.md`       | Project overview / quick start      | ✅          |
| `README_CN.md`    | Chinese README                      | ✅          |
| `AGENTS.md`       | Agent development rules (this file) | ✅          |
| `CLAUDE.md`       | Claude Code project rules           | ⚠️ Optional |
| `CHANGELOG.md`    | Release notes                       | ✅          |
| `CONTRIBUTING.md` | Contribution guidelines             | ⚠️ Optional |

**Test guide naming**: `FEATURE_{ID}_{VERSION}_TEST_GUIDE.md` / `ISSUE_{ID}_{VERSION}_REGRESSION_GUIDE.md`

**Partner feature routing**: use `partner-feature-manager` for Partner requests and write only to
`docs/partner/FEATURE_LIST.md`, `docs/partner/features/`, `docs/partner/FEATURES_ARCHIVED.md`, and
`docs/partner/INTEGRATION.md`. Use the global `feature-manager` for Space `F###` requests. A Partner
feature is not integrated merely because its local development status is complete.

## Test Requirements

- **Partner local preference (2026-09-22)**: Do not automatically launch browsers, browser-based tests, or desktop windows on this user's computer, including headless system Chrome that can disrupt their work. Use checks that do not launch browsers. Only resume UI launches after a new explicit user request; an earlier one-time frontend launch is not standing authorization. Leave full UI regression to CI or a user-arranged session and record any interrupted checks accurately.
- **Coverage**: ≥ 80%
- **Layout**: unit tests next to source (`packages/*/src/**/*.test.ts`); E2E in `tests/`. No `__tests__/` directories.
- **TDD**: write test first (RED) → fail → minimal impl (GREEN) → pass → refactor.

**Code**

- ❌ NEVER use `any`
- ❌ NEVER circular dependencies
- ❌ NEVER hardcode config (use env vars)
- ❌ NEVER commit `console.log` (use logger)
- ❌ NEVER silently swallow errors

**Architecture**

- ❌ NEVER add abstractions without 3+ use cases
- ❌ NEVER add configuration for hypothetical needs
- ❌ NEVER break layer independence

## References

- [Product Requirements](docs/PRD.md)
- [Architecture Decisions](docs/ADR/README.md)
- [Space Feature List](docs/FEATURE_LIST.md)
- [Partner Documentation](docs/partner/README.md)
- [Partner Feature List](docs/partner/FEATURE_LIST.md)
