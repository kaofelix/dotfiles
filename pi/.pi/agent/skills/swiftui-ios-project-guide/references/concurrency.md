# Concurrency Baseline (Swift 6 Era)

## Defaults

- Prefer `async/await`, `async let`, and task groups.
- Use `@MainActor` for UI-facing state.
- Isolate mutable shared state in actors.
- Pass value types/IDs across actor boundaries when possible.
- Adopt strict concurrency incrementally by module if needed.

## Implementation checklist

1. Mark UI models/types with explicit actor isolation (`@MainActor` when required).
2. Replace callback pyramids with async APIs.
3. Remove ad-hoc queue hopping unless interop requires it.
4. Add cooperative cancellation handling in long-running async work.
5. Fix `Sendable` warnings instead of suppressing them.

## Safe task ownership rules

- Start tasks from a clear owner (view model, use case, app lifecycle object).
- Keep task references when cancellation matters.
- Cancel prior in-flight tasks when newer user intent supersedes them.
- Avoid detached tasks unless isolation boundary is fully understood.

## Migration sequence

1. Modernize leaf modules first (network/data clients).
2. Move shared mutable state behind actors.
3. Annotate UI edges with `@MainActor`.
4. Enable stricter concurrency checks module-by-module.
5. Add regression tests around race-prone paths.

## Red flags

- Mixed main/background mutation of the same object.
- Fire-and-forget tasks with no cancellation strategy.
- Relying on `DispatchQueue.main.async` instead of actor isolation.
