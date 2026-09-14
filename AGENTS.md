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
