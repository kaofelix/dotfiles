# Testing and CI/CD

## Test pyramid defaults

- Unit tests: domain logic, reducers/state transitions, use-cases.
- Integration tests: repositories, persistence, decoding/encoding, API contracts.
- UI tests: critical user journeys and regression protection.
- Snapshot tests: broad visual regressions where stable baselines are feasible.

## Test design rules

- Inject clock, randomness, and IDs for determinism.
- Keep unit tests fast and isolated from I/O.
- Use async test APIs consistently (avoid mixing async and expectation styles unnecessarily).
- Add accessibility identifiers to support stable UI tests.
- Add pure contract tests for reconciliation logic and conflict resolution.
- Add idempotency tests for commands reachable from multiple entrypoints.
- Test side-effect adapters (notifications/network/storage) behind protocols with mocks.

## CI lanes

- **PR lane**: build + lint/format + unit/integration subset.
- **Nightly lane**: full test plans, UI tests, snapshots, performance checks.
- **Release lane**: archive, sign, distribute (TestFlight/App Store), tag, changelog.

## CI implementation baseline

- Run tests from CLI for reproducibility.
- Use test plans to define lane-specific suites/configurations.
- Fail fast on linting and test regressions.
- Publish artifacts: test reports, coverage trends, performance baselines.
- For widget/intent apps, add smoke tests for cross-surface start/stop/update flows.

## Red flags

- UI-heavy suites with no deterministic test data strategy.
- Long PR pipelines because everything runs on every commit.
- Shipping changes with no integration coverage for data boundaries.
- Shared-state features with no reconciliation/idempotency tests.
