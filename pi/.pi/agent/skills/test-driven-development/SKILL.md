---
name: test-driven-development
description: Use when adding behavior, changing behavior, fixing bugs, or refactoring code whose behavior must be preserved. Drive the work with one failing automated test at a time, make it pass with the smallest useful change, then refactor to remove duplication and clarify the design.
---

# Test-Driven Development

## Purpose

Produce clean code that works.

In this skill, "works" means the behavior is demonstrated by automated tests.

"Clean" means:
- duplication has been removed,
- intent is clear,
- the design is no more general than the current tested behavior requires,
- behavior can change safely because tests protect it.

TDD is not "write tests eventually." TDD is a programming rhythm:

1. Write one automated test that fails.
2. Make it pass quickly.
3. Refactor while all tests pass.
4. Repeat.

## Core Rules

1. Do not write new production behavior unless an automated test is failing because that behavior is missing.
2. Eliminate duplication once the test passes.

These two rules are the skill. Everything else is guidance for applying them.

## When to Use

Use this skill for:
- new behavior,
- changed behavior,
- bug fixes,
- edge cases,
- refactoring where behavior must stay the same,
- risky changes that need executable proof.

Usually skip this skill for:
- documentation-only changes,
- formatting-only changes,
- comments,
- generated code that should not be hand-edited,
- configuration changes with no observable behavior.

If a configuration or generated-code change has observable behavior, test the behavior.

## The Rhythm

```text
RED      Write one small test. Run it. See it fail for the expected reason.
GREEN    Write the smallest production change that makes the test pass.
REFACTOR Improve the design without changing behavior. Keep tests passing.
REPEAT   Choose the next small behavior.
```

Do not batch the phases.

Wrong:

```text
Write many tests → write lots of implementation → clean up later
```

Right:

```text
one test → one small implementation → one cleanup opportunity → next test
```

## Before the First Test

Identify the next observable behavior.

Write a short behavior list if useful, but do not implement the whole list at once.

A good behavior item says what the system should do from the outside, not how it should do it internally.

Good:

```text
A withdrawn amount larger than the balance is rejected.
```

Bad:

```text
Add a private validation method and call it from the withdrawal function.
```

Prefer the vocabulary already used by the codebase, product, tests, and domain.

## RED: Write One Failing Test

Write one test for one behavior.

The test should:
- exercise the system through a public or stable interface,
- describe observable behavior,
- have a name that reads like a specification,
- use real code where practical,
- avoid depending on private implementation details,
- fail before the production change.

Run the smallest relevant test command.

Confirm:
- the test fails,
- the failure is expected,
- the failure is caused by missing or incorrect behavior,
- the failure is not caused by a typo, syntax error, bad setup, or broken test harness.

If the test passes immediately, it did not create a red state. Revise the test or choose the next missing behavior.

If the test fails for the wrong reason, fix the test until it fails for the right reason.

## GREEN: Make the Test Pass

Write the smallest production change that makes the failing test pass.

Prefer:
- direct code,
- obvious implementation,
- simple conditionals,
- small changes,
- local changes,
- boring code.

Allowed temporarily:
- duplication,
- hard-coded values that are clearly triangulated by the current test,
- inelegant structure,
- narrow implementation.

Avoid:
- speculative abstractions,
- future options,
- broad rewrites,
- unrelated cleanup,
- extra behavior not required by the test,
- changing the test merely to fit the implementation.

Run the targeted test again.

Then run nearby relevant tests if the change may affect them.

If the test fails, fix production code, not the expectation, unless the test itself is wrong.

## REFACTOR: Make It Clean

Refactor only when tests are green.

Improve the design without changing behavior.

Look for:
- duplicated logic,
- duplicated knowledge,
- unclear names,
- misplaced responsibility,
- unnecessary branches,
- over-specific test data embedded in production code,
- code that now reveals a missing concept,
- tests that are hard to read because setup obscures intent.

After each meaningful refactor, run the relevant tests.

Do not add behavior during refactoring.

If a new behavior becomes necessary, stop refactoring, write a new failing test, and return to RED.

## What "Eliminate Duplication" Means

Duplication is not only repeated lines.

Remove repeated knowledge:
- the same rule encoded in multiple places,
- test data copied into production logic,
- conditionals that express the same decision repeatedly,
- names that hide a common concept,
- parallel structures that must change together.

Do not remove useful clarity from tests merely to make them shorter.

Tests may repeat small amounts of setup when that makes each example easier to understand.

Production code should usually be stricter about duplication than test code.

## Test Through Behavior

Prefer tests that would still pass after a valid refactor.

Test:
- inputs and outputs,
- state changes visible through public interfaces,
- messages or events that are part of the contract,
- errors that callers can observe,
- persisted effects through the same interface a real caller would use.

Avoid testing:
- private methods,
- internal call order,
- incidental helper structure,
- mock interactions that are not part of the observable contract,
- implementation names that should be free to change.

Use test doubles only when the real dependency is slow, nondeterministic, unavailable, destructive, or outside the process boundary.

Prefer this order:
1. real object,
2. fake implementation,
3. stub,
4. mock or spy.

Mocks are a last resort, not the default design style.

## Choosing Test Size

Choose the smallest test that gives useful confidence.

Use a smaller test when:
- behavior is pure logic,
- setup is simple,
- no external boundary matters.

Use a broader test when:
- behavior exists only across components,
- integration is the risk,
- a previous bug happened at a boundary,
- the public interface is larger than a single function or class.

Do not force everything into unit tests.

Do not use an end-to-end test when a smaller behavioral test would prove the same thing.

## Bug Fixes

For a bug, the first test must reproduce the bug.

Workflow:

```text
1. Write a test that demonstrates the bug.
2. Run it and confirm it fails for the reported reason.
3. Make the smallest fix.
4. Run the test and confirm it passes.
5. Run related tests to guard against regressions.
6. Refactor only after green.
```

A bug fix without a failing reproduction test is not complete unless automated testing is genuinely unavailable.

## Refactoring Existing Code

When changing legacy code with poor or missing tests:

1. Add a characterization test around current observable behavior.
2. Confirm it passes.
3. Add a failing test for the desired new or corrected behavior.
4. Make the smallest change.
5. Refactor behind the protection of tests.

A characterization test records what the system currently does. It does not claim the behavior is ideal.

## When Exploration Is Needed

Exploration is allowed, but exploratory code is not production code.

If you spike a solution to learn:
- mark it as disposable,
- do not preserve it as implementation,
- use what you learned to write the first failing test,
- then implement from the test.

Do not retrofit tests around exploratory code and call it TDD.

## Granularity

Move in small steps.

If progress feels hard:
- make the next test smaller,
- assert one observable fact,
- reduce setup,
- choose a simpler public interface,
- fake the implementation briefly,
- triangulate with a second test when the fake becomes too specific.

If tests are hard to write, listen to that feedback. The design may be hard to use.

## Agent Operating Rules

When using this skill, the agent must:

1. State the next behavior being tested.
2. Add or update exactly one focused test before production code.
3. Run the relevant test and observe RED.
4. Explain the failure briefly.
5. Change production code minimally.
6. Run the test and observe GREEN.
7. Refactor only after GREEN.
8. Run tests after refactoring.
9. Repeat for the next behavior.

Do not:
- write production behavior first,
- write a batch of tests before any implementation,
- skip the failing-test observation,
- add speculative functionality,
- refactor while RED,
- disable, delete, or weaken tests to get green,
- claim success without running tests when test execution is available.

## Completion Checklist

Before finishing, verify:

- [ ] Each new behavior has an automated test.
- [ ] Each bug fix has a failing reproduction test.
- [ ] New tests failed before the implementation.
- [ ] Failures were for the expected reason.
- [ ] Production changes are the smallest useful changes.
- [ ] Refactoring happened only while tests were green.
- [ ] Duplication was considered and removed where helpful.
- [ ] Tests describe behavior through public or stable interfaces.
- [ ] Relevant tests pass.
- [ ] No tests were skipped, weakened, or deleted to force success.

## Reporting Format

When reporting completion, use:

```text
Behavior:
- ...

Red:
- Test added/changed: ...
- Observed failure: ...

Green:
- Minimal implementation: ...

Refactor:
- Cleanup performed: ...
- Duplication removed: ...

Verification:
- Tests run: ...
- Result: ...

Notes:
- Risks, gaps, or follow-up tests: ...
```

If tests could not be run, say so directly and explain why. Do not imply confidence that was not earned.
