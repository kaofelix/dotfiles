---
name: release-notes
description: Write release notes focused on user-visible changes only. Use when asked for changelog/release notes, especially when the user wants feature-only notes, no implementation details, and no internal quality/test/refactor content.
---

# User-Visible Release Notes

Write release notes as **capability deltas**.

## Core rule

Include only items that answer:

> What can the user do now that they could not do before?

If it does not change user capability, do not include it.

## Hard exclusions

Never include:
- Tests, coverage, CI, refactors, cleanup, architecture
- Internal error handling/telemetry/logging changes
- Dependency/tooling upgrades
- "Works better" statements without a clear user action/effect
- Expected behavior of a feature as a separate bullet (e.g. "restores panel sizes" for a maximize toggle)

## Allowed content

- New user actions/features
- New shortcuts/commands users can invoke
- New UI controls users can use
- User-facing bug fixes only when they remove a user pain point

## Writing style

- Use plain product language, not implementation language
- Prefer: "You can now …" or concise noun phrase headers
- Keep bullets short
- Group by sections only if asked (e.g. Added / Fixed)

## Feature filter checklist

For each candidate bullet, validate all:
1. Is this visible to the user?
2. Does it add or unlock an action/capability?
3. Would a user care in release notes?
4. Is wording free of implementation details?

If any answer is no, drop or rewrite.

## Output modes

### Default
Use:
- Added
- Fixed (only user-facing fixes)

### If user says "features only" / "just new features"
Use only:
- Added

No Fixed section.

## Quick rewrite examples

- Bad: "Refactored panel state management and imperative handles."
  Good: "Added a Diff Focus toggle to expand the diff area."

- Bad: "Improved maximize restore logic for panel layout persistence."
  Good: "Added a keyboard shortcut to toggle Diff Focus (⌘+Enter / Ctrl+Enter)."

- Bad: "Added tests for AppLayout and DiffView behavior."
  Good: (omit)
