# Multi-Surface State Sync (App + Widget + AppIntent + Extensions)

Use this guide when multiple entrypoints can mutate the same domain state.

## When to apply

- Widget buttons can start/stop/update sessions.
- AppIntents can run without opening the app.
- App extension/background execution can race with app foreground state.

## Architecture pattern

1. **Shared contract**: define a compact `Codable` snapshot for cross-surface state.
2. **Persistence model**: keep full history/entities in SwiftData/Core Data/repository layer.
3. **Reconciler**: implement a pure function to resolve local + shared divergence.
4. **Idempotent commands**: duplicate start/stop/save operations must be safe.
5. **Refresh policy**: explicitly refresh timelines/surfaces after state transitions.

## Reconciliation policy template

Define explicit outcomes for each case:

- Shared exists, local idle → start local from shared.
- Shared missing, local active → reset local.
- Shared/local both active and equal → no-op.
- Shared/local both active and different → replace local with shared (or opposite; choose once and document).

Keep this policy pure and unit-tested.

## Data and persistence rules

- Persist logical session identity (for dedupe/idempotency checks).
- Avoid writing full ORM models into shared defaults.
- Store only what all surfaces need for immediate rendering/action.
- Reconstruct richer view state from repositories when the app resumes.

## Side-effect rules

- Centralize side effects (notifications, timeline reloads, analytics) behind adapters.
- Trigger side effects from command handlers, not ad-hoc from many Views.
- Ensure stop/undo/resume flows reschedule or cancel notifications consistently.

## Test matrix

At minimum, test:

- Reconciler truth table (all policy branches).
- Duplicate command handling (idempotency).
- Cross-surface lifecycle sequence (intent action → app foreground reconciliation).
- Side-effect consistency (schedule/cancel/reschedule).

## Common anti-patterns

- No authoritative owner for shared state.
- Fetch-all then local filtering for dedupe checks.
- Silent write failures (`try?`) in critical command paths.
- Encoding UI-only ephemeral state in cross-surface contracts.
