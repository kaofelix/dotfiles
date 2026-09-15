# Persistence: SwiftData and Core Data Decisions

## Default stance

- Use SwiftData for new SwiftUI-first apps unless requirements force another choice.
- Keep persistence access in repositories or model actors, not in Views.
- Treat schema migration as production code with tests.

## SwiftData usage rules

- Configure `ModelContainer` at app/root level.
- Use environment `ModelContext` for simple view-level operations.
- Use `@ModelActor` for background writes, imports, and heavy persistence operations.
- Keep complex queries/derived projections in repository/model-actor layer.
- Prefer targeted fetch descriptors over fetch-all-and-filter patterns.

## Shared-state persistence for multi-surface apps

- Separate **shared state snapshots** (small `Codable` contracts) from full persistence models.
- Use App Group storage only for the minimum cross-surface contract needed.
- Keep writes idempotent with a logical uniqueness key when duplicate triggers are possible.
- Reconcile shared snapshot state with persisted history on app foreground/activation.

## Migration strategy

1. Inventory current model and production data constraints.
2. Define versioned schemas.
3. Add incremental migration stages (prefer small, reversible changes).
4. Test migrations on realistic data snapshots.
5. Roll out with observability and fallback plan.

## SwiftData vs alternatives

- Stay on **Core Data** when mature legacy behavior is deeply relied on.
- Use **GRDB/SQLite-first** when explicit SQL control/performance is required.
- Keep mixed mode temporarily during migration if risk is high.

## Red flags

- Running large imports on the main actor.
- Non-versioned schema changes shipped without migration testing.
- Direct persistence object mutation scattered across many Views.
- Silent persistence failure paths (`try?`) in critical write/delete operations.
- Cross-surface shared storage carrying too much non-contract UI state.
