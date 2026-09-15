# Architecture and State (SwiftUI)

For systematic audits, pair this file with `architecture-review-checklist.md`.

## Preferred baseline

- Use feature-oriented modules.
- Use SwiftUI + Observation (`@Observable`) as default state flow.
- Keep Views thin: render state + send intents.
- Keep side effects in model/use-case/repository layers.

## Choose an architecture

- Start with **MVVM + repositories** for most apps.
- Add **use-case/domain layer** when business rules become complex.
- Use **reducer/composable architecture** when state/effects are high-complexity and need stronger determinism.
- Keep VIPER/Clean ceremony only where existing codebase constraints require it.

## State design rules

- Model screen state explicitly instead of exposing persistence objects directly.
- Keep state transitions deterministic and testable.
- Inject dependencies for time, UUID, networking, and persistence.
- Keep view models small and feature-scoped.
- Represent user-facing status with semantic enums/tokens (not scattered booleans/colors).

## Multi-entrypoint state ownership

Use this when app state can change from multiple surfaces (app UI, AppIntent, widget, extension):

- Define an explicit authoritative state contract for shared session-level data.
- Add a pure reconciliation function to resolve local vs shared divergence.
- Make commands idempotent (same logical action can run twice safely).
- Keep cross-surface state compact and serializable; keep rich UI state local to each surface.

## Practical module boundaries

- `Feature/*`: SwiftUI screens, feature state, feature actions.
- `Domain/*`: use-cases, business rules, pure logic.
- `Data/*`: repositories, API clients, persistence clients.
- `Core/*`: logging, telemetry, shared utilities, design system primitives.

## Red flags

- Massive view models mixing UI state, networking, and persistence.
- Feature modules importing many unrelated modules.
- Global singletons used directly from Views.
- Top-level Views orchestrating many side effects/tasks directly.
- Multiple entrypoints mutating the same domain state with no reconciliation policy.
