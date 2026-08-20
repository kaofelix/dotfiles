---
name: test-driven-development
description: Test-drive meaningful application-owned behavior when adding or changing domain rules, interactions, state transitions, authorization, calculations, persistence, API contracts, or fixing bugs—even when the user does not request TDD. Route behavior-preserving structural work to safe-refactoring. Styling, declarative metadata or configuration, generated code, dependency upgrades, mechanical wiring, and test-only maintenance fall outside this TDD process.
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

Route other work out of this TDD cycle:

- Pure structural change → `safe-refactoring`
- Styling or visual change → implementation outside this TDD process
- Declarative metadata or configuration → schema, framework, type, or lint validation
- Generated code or dependency change → generator, build, and integration checks
- Mechanical wiring or test-only maintenance → targeted existing checks

A GraphQL deprecation declaration, for example, usually needs schema inspection rather than a test that repeats the declaration.

### Semantic Behavior or Visual Presentation

Classify each requested outcome before choosing a process.

A semantic behavior changes what a user or system can do, receive, access, navigate to, persist, or observe through a stable semantic interface. A visual presentation change alters how the same content and capabilities are drawn.

Visual presentation includes typography, color, spacing, dimensions, alignment, grouping, density, borders, shadows, icon geometry, animation timing, and responsive arrangement. Treat design files, established components, and codebase conventions as implementation inputs. Visual parity and deeper visual review are separate follow-up work rather than TDD completion criteria.

A stable semantic test expresses the contract without asserting class names, style values, utility tokens, element dimensions, incidental DOM nesting, or screenshot pixels. Accessibility roles, names, states, and hidden content are semantic behavior even when their implementation affects presentation.

For mixed UI work, separate the behavioral seam from the visual shell:

- Test-drive interactions, state changes, accessibility, navigation, and information access.
- Implement the visual shell directly as a best-effort application of the design and existing conventions.
- Run nearby existing tests to detect regressions without adding a styling contract.

Ordinary copy is presentation. Update an existing interaction test when it identifies a real control by its accessible name. Give exact wording dedicated coverage when the wording is itself a product contract, such as legal or safety text, a required API error, or a domain distinction that drives a user decision.

Once an outcome is classified as visual presentation, exclude it from the RED → GREEN cycle and from TDD completion criteria.

**Complete when:** every requested outcome is classified, and each semantic behavior either qualifies for TDD with a stable test or is routed to another process.

When the user is exploring requirements, inspect the relevant code and clarify the behavior before editing. When the user directly requests implementation or a bug fix, treat the requested behavior as agreed and proceed without asking for redundant confirmation.

Identify one observable behavior in product or domain vocabulary and the failure expected from its absence. For example: a withdrawn amount larger than the balance is rejected, and the expected failure before implementation is that the withdrawal succeeds instead of returning the overdraft error.

The behavior and expected failure must be clear before the test is written, but they do not require a fixed announcement format.

### Present-Tense Contracts

Tests describe the system's current contract, not the history of how the change was developed.

An absence deserves lasting coverage when the absence is itself a meaningful product or domain rule and protects against a plausible regression. Authorization rejection, an overdraft prohibition, and suppression of a dangerous side effect are contracts. A removed field, abandoned UI element, deferred feature, or deleted integration usually is not.

A negative test may temporarily drive removal. Once the removed behavior and its production code are gone, delete that test unless the resulting absence remains an independently meaningful contract.

**Complete when:** TDD qualifies, one observable present-tense behavior is understood, and its expected failure is clear. Otherwise, follow the routed process and briefly explain the choice when the absence of a behavioral test would be surprising.

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

## 5. Reconcile Scope Changes

When a requirement is withdrawn or deferred during a cycle:

1. Restate the retained present-tense behavior.
2. Remove the withdrawn item from the test list.
3. Delete tests whose only subject is the withdrawn behavior rather than translating them into `does not` expectations.
4. Remove the corresponding production code.
5. Run the smallest relevant suite and inspect each failure:
   - Delete a failing test when its contract disappeared with the removed behavior.
   - Update the test or production code when it still protects retained behavior.

**Complete when:** every remaining test describes retained system behavior, and no test mentions the withdrawn feature merely to record its absence.

## 6. Verify the Change

Run nearby tests when the change can affect them. Use a broader test only when the behavior crosses components or the risk lives at a boundary. A bug fix is complete only when its first focused test reproduced the reported behavior before the fix.

Check every retained behavior introduced in the change against the completed RED → GREEN evidence.

**Complete when:** focused and broader relevant checks pass, every retained behavior introduced by the change is protected, and every changed or removed test is accounted for by a changed or removed contract rather than used to conceal a regression.

## Finish TDD-Qualified Work

At completion, mention:
- the behavior added or corrected,
- the focused test and the failure it demonstrated before implementation,
- the production change,
- the relevant verification performed,
- any remaining test or confidence gap.

Adapt the detail to the size and risk of the change. When tests cannot run, make that gap clear; confidence follows the evidence produced. Routed work follows its own completion and reporting process outside this skill.
