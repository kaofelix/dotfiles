# Architecture Review Checklist (SwiftUI iOS)

Use this checklist for `audit` requests or pre-refactor assessments.

## Review output format

For each finding include:

- **Severity**: `critical` | `high` | `medium` | `low`
- **Evidence**: file path + short code reference
- **Why it matters**: risk (correctness, maintainability, performance, UX)
- **Fix direction**: concrete next step

## 1) State ownership and boundaries

- Is state ownership explicit per feature?
- Are Views mostly rendering + intent dispatching?
- Are side effects moved out of Views into model/use-case/repository layers?
- Are shared mutable states isolated (actors or clear main-actor ownership)?
- Is user-facing status represented by semantic enums/tokens?

## 2) Multi-entrypoint safety (if widget/intents/extensions exist)

- Is there a clear shared state contract (small `Codable` snapshot)?
- Is reconciliation logic explicit and pure?
- Are start/stop/save commands idempotent?
- Are duplicate trigger scenarios tested?
- Are side effects (notifications/timeline refresh) consistent across entrypoints?

## 3) Persistence architecture

- Is persistence access behind repositories/model actors?
- Are heavy writes/imports off the main actor?
- Are fetches targeted (not fetch-all-and-filter in hot paths)?
- Are schema changes versioned and migration-tested?
- Are critical write/delete failures surfaced (not silently swallowed)?

## 4) Test architecture

- Are business rules covered by fast deterministic unit tests?
- Are repository/data-boundary integration tests present?
- Are reconciliation and idempotency contract tests present when applicable?
- Are UI tests focused on core journeys rather than all behavior?
- Are flaky dependencies isolated behind protocol adapters/mocks?

## 5) Quality and platform discipline

- Are accessibility labels/identifiers present for custom controls and test targets?
- Are performance-sensitive paths profiled or clearly bounded?
- Is privacy/security impact assessed for new data/SDK flows?
- Are logs/telemetry structured and privacy-safe?

## Common broad anti-pattern markers

- Top-level container views orchestrating many unrelated side effects.
- Domain writes guarded by `try?` without visibility or retry strategy.
- Cross-surface state mutated from many entrypoints without reconciliation rules.
- Persistence object mutations spread across multiple Views.
- Data-layer inefficiency hidden by small current dataset size.

## Quick prioritization heuristic

Prioritize in this order:

1. Correctness and data-loss risks
2. Cross-entrypoint race/duplication risks
3. Performance regressions on main actor
4. Maintainability and module-boundary erosion
5. UX consistency and polish issues
