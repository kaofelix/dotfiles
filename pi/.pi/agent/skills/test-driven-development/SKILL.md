---
name: test-driven-development
description: Test-drive meaningful application-owned behavior when adding or changing domain rules, interactions, state transitions, authorization, calculations, persistence, API contracts, or fixing bugs—even when the user does not request TDD. Route behavior-preserving structural work to safe-refactoring. Styling, declarative metadata or configuration, generated code, dependency upgrades, mechanical wiring, and test-only maintenance use targeted verification instead.
---

# Test-Driven Development

Drive one meaningful behavior at a time through:

```text
DISCUSS OR IDENTIFY BEHAVIOR → RED → GREEN → REFACTOR → REPEAT
```

## 1. Qualify the Behavior

Use TDD when all are true:

1. The change affects a meaningful product, domain, interaction, or API contract.
2. Application code owns or controls the behavior.
3. A stable test can express the contract without restating implementation or configuration.
4. The test protects against a plausible regression instead of retesting a framework.

Route other work to its appropriate verification:

- Pure structural change → `safe-refactoring`
- Styling or visual change → visual verification
- Declarative metadata or configuration → schema, framework, type, or lint validation
- Generated code or dependency change → generator, build, and integration checks
- Mechanical wiring or test-only maintenance → targeted existing checks

A GraphQL deprecation declaration, for example, usually needs schema inspection rather than a test that repeats the declaration. A spacing or utility-class change usually needs visual evidence rather than a style assertion.

When the user is exploring requirements, inspect the relevant code and clarify the behavior before editing. When the user directly requests implementation or a bug fix, treat the requested behavior as agreed and proceed without asking for redundant confirmation.

Identify one observable behavior in product or domain vocabulary and the failure expected from its absence. For example: a withdrawn amount larger than the balance is rejected, and the expected failure before implementation is that the withdrawal succeeds instead of returning the overdraft error.

The behavior and expected failure must be clear before the test is written, but they do not require a fixed announcement format.

**Complete when:** TDD qualifies, one observable behavior is understood, and its expected failure is clear. Otherwise, use the routed verification and briefly explain the choice when the absence of a behavioral test would be surprising.

## 2. Observe RED

Add or update exactly one focused test through a public or stable interface. Prefer assertions over inputs, outputs, visible state, contract-level events, observable errors, or persisted effects.

Use real objects where practical. Reach for a fake, stub, mock, or spy only as the dependency becomes slower, nondeterministic, unavailable, destructive, or external to the process.

Run the smallest relevant test command. Valid RED means:

- the intended behavior was exercised,
- the focused test failed,
- the observed failure matches the expected failure,
- missing or incorrect application behavior caused it.

A syntax error, missing dependency, incorrect command, broken fixture, or test-harness failure is an environment problem. Repair it and rerun. A new test that passes immediately needs a genuinely missing behavior or a revised assertion before production changes begin.

**Complete when:** one focused test has failed for the stated behavioral reason.

## 3. Reach GREEN

Make the smallest direct production change that satisfies the focused test. Keep the change local to the behavior and defer broader design work.

Run the focused test again. Correct production code while the behavioral expectation remains valid.

**Complete when:** the same focused test passes because the missing behavior now exists.

## 4. Refactor While Green

Remove duplicated logic or knowledge, clarify names, and improve responsibilities without adding behavior. Verify after each meaningful cleanup.

When another required behavior appears, begin a new RED cycle for it. Several tests written before any implementation form a batch; preserve the one-behavior rhythm instead.

**Complete when:** relevant tests remain green and the cycle introduced no untested behavior.

## 5. Verify the Change

Run nearby tests when the change can affect them. Use a broader test only when the behavior crosses components or the risk lives at a boundary. A bug fix is complete only when its first focused test reproduced the reported behavior before the fix.

Check every behavior introduced in the change against the completed RED → GREEN evidence.

**Complete when:** focused and broader relevant checks pass, every new behavior is protected, and no test was weakened or removed to force success.

## Finish

At completion, mention:
- the behavior added or corrected,
- the focused test and the failure it demonstrated before implementation,
- the production change,
- the relevant verification performed,
- any remaining test or confidence gap.

Adapt the detail to the size and risk of the change. When tests cannot run, make that gap clear; confidence follows the evidence produced.
