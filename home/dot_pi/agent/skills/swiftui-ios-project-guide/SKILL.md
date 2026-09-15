---
name: swiftui-ios-project-guide
description: Plan, implement, review, or migrate SwiftUI iOS project work using modern Apple-first practices across Swift concurrency, Observation state flow, SwiftData/Core Data decisions, testing/CI, performance, security, accessibility, and Liquid Glass. Use when an agent needs actionable architecture guidance plus high-signal references for any SwiftUI iOS task.
---

# SwiftUI iOS Project Guide

Use this skill as the default playbook for SwiftUI iOS work.

## Core operating rules

- Prefer Apple-first APIs and docs before third-party abstractions.
- Use structured concurrency and explicit actor isolation.
- Keep SwiftUI Views declarative; run side effects in models/use-cases/repositories.
- Keep persistence and networking behind testable boundaries.
- Treat CI, testing, accessibility, privacy, and performance as default requirements.
- Verify every non-trivial recommendation against current Apple docs for the active Xcode/iOS version.

## Execution workflow

1. Classify the request: `feature`, `bugfix`, `migration`, `audit`, or `architecture decision`.
2. Capture baseline constraints:
   - deployment target
   - Xcode + Swift version
   - strict concurrency status
   - state management approach
   - persistence stack
   - entrypoints that can mutate state (app, widget, intent, extension)
   - test/CI maturity
3. Read only the reference files needed for this task (see routing table below).
   - For `audit` requests, always read `references/architecture-review-checklist.md`.
4. Produce a short implementation plan with risks and validation steps.
5. Implement changes incrementally.
6. Validate with tests + runtime checks before finishing.

## Reference routing

- Task-specific execution steps (feature, bugfix, migration, decisions) → `references/task-playbooks.md`
- Concurrency correctness and actor isolation → `references/concurrency.md`
- SwiftUI architecture and state flow → `references/architecture-state.md`
- Architecture audit checklist and prioritization → `references/architecture-review-checklist.md`
- SwiftData/Core Data and migration planning → `references/persistence.md`
- Multi-surface state sync (Widget/AppIntent/extensions) → `references/multi-surface-sync.md`
- Test strategy and CI/release automation → `references/testing-ci.md`
- Performance, accessibility, security/privacy, observability, Liquid Glass → `references/quality-platform.md`
- Finding reliable references quickly → `references/reference-search.md`

## Required output format

Use this structure in responses for non-trivial SwiftUI tasks:

### 1) Context snapshot
- Platform/toolchain constraints
- Existing architecture constraints

### 2) Plan
- 3–7 concrete implementation steps
- Any trade-offs or alternatives

### 3) Validation
- Tests to add/run
- Manual checks (UI/accessibility/perf/privacy as relevant)

### 4) References used
- Official docs/sessions consulted
- Why each reference is relevant

### 5) Risk and follow-ups
- Remaining risks
- Next hardening tasks

## Definition of done

Do not mark work complete until all applicable checks pass:

- Build passes with no new concurrency warnings in touched code.
- Tests for changed logic exist and pass.
- UI changes include accessibility identifiers/labels where needed.
- Persistence/schema changes include migration notes or migration code.
- Performance-sensitive changes avoid new main-thread heavy work.
- Privacy/security impact is assessed for new data collection, SDKs, or secrets handling.

## Anti-patterns to reject

- Starting unstructured `Task {}` work from Views without ownership/cancellation strategy.
- Mutating shared reference state across concurrency domains without isolation.
- Putting networking/persistence logic directly in SwiftUI Views.
- Mutating shared domain state from multiple entrypoints (app, intents, widgets) without reconciliation and idempotency rules.
- Treating UI tests as the only test layer.
- Adding dependencies when Apple/Foundation APIs already satisfy the need.
- Swallowing persistence/network errors (`try?`) in critical data paths without observability.
- Applying Liquid Glass/translucent effects without readability and accessibility checks.
