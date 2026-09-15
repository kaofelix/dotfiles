# Task Playbooks

## Feature implementation

1. Define user outcome and constraints (iOS target, offline, accessibility, privacy).
2. Model feature state and intents before writing UI.
3. Add/update dependencies via protocols/clients.
4. Implement side effects outside Views.
5. Add tests (unit first, integration where data boundaries change).
6. Validate UI behavior, accessibility, and performance.

## Bugfix

1. Reproduce reliably.
2. Add a failing test (or reproducible diagnostic harness).
3. Identify isolation boundary (UI state, domain logic, persistence, network).
4. Apply minimal fix at the correct layer.
5. Verify with regression tests and targeted manual checks.

## Migration/refactor

1. Keep behavior parity as explicit acceptance criteria.
2. Migrate incrementally by feature/module.
3. Add adapters/shims for temporary interoperability.
4. Remove legacy code only after replacement is proven by tests.
5. Track risk with rollout notes and fallback strategy.

## Architecture decision

1. Compare at least two viable options.
2. Evaluate complexity, testability, team familiarity, and migration cost.
3. Choose a default path and document why alternatives were rejected.
4. Define measurable success criteria (build time, crash rate, test flake, etc.).

## Multi-surface shared-state feature (Widget/AppIntent/extension)

1. Build an entrypoint matrix: App UI, Widget, AppIntent, background, extension.
2. Define the minimal shared state contract and its owner.
3. Define reconciliation policy (local vs shared precedence and conflict handling).
4. Define idempotency keys/rules for duplicate command execution.
5. Add contract tests, idempotency tests, and one end-to-end smoke flow per entrypoint.
