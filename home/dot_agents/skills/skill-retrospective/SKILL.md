---
name: skill-retrospective
description: Improve or evaluate an agent skill from real Pi execution traces. Use when reviewing how a skill performed across sessions, diagnosing trigger mistakes, workflow noncompliance, user corrections, tool friction, stale guidance, unused reference, or opportunities to make the skill more effective and economical before revising it.
---

# Skill Retrospective

Treat skill improvement as a **trace-driven retrospective**, not a prose review. Preserve what worked, attribute failures carefully, and change the smallest instruction or affordance that addresses repeated evidence.

Load and follow both `pi-sessions-duckdb` and `writing-for-agents`. Read the target skill in full. When its capability depends on a changing external tool or API, consult current authoritative documentation as a separate evidence source.

## 1. Frame the retrospective

Establish:

- the target skill and its current location;
- whether the user wants analysis, discussion, revision, or all three;
- the concern already observed, if any;
- the version whose behavior should be evaluated.

A path match alone does not identify a version. Choose one or more distinctive lines from the loaded skill body as a fingerprint and match them against the `read` tool result. If the current version has no observed use, say so; evaluate a prior version only when it is clearly identified and label the evidence accordingly.

**Complete when:** the target, requested outcome, and evidence-backed version boundary are explicit.

See [session selection](references/session-selection.md) for version-aware corpus queries.

## 2. Build a bounded corpus

Use the `pi-sessions-duckdb` funnel:

1. Aggregate sessions that loaded the fingerprinted version.
2. Exclude the current retrospective session.
3. Count the corpus before opening payloads.
4. If the corpus is small, inspect all sessions. If large, select a stratified sample containing:
   - explicit user corrections or dissatisfaction;
   - tool errors, retries, or unusually repetitive activity;
   - apparently successful uses;
   - varied projects and task shapes.
5. Search separately for likely missed invocations only when trigger recall is part of the question.

Prefer exact loaded-content evidence over session dates. A resumed old session may load a newer skill, and a stable path may contain many historical versions.

**Complete when:** every included session is tied to the intended version, and the corpus size, exclusions, and sampling rule are recorded.

## 3. Reconstruct usage episodes

Evaluate **episodes**, not whole sessions. One session may contain several tasks, skill loads, scope changes, or revisions.

For each selected session:

1. Profile roles and content types.
2. Read the complete compact user/assistant transcript.
3. Identify the task episode around the skill load.
4. Broaden to tool executions, thinking, or full skill text only when needed to verify implementation order, failures, retries, or the instruction actually loaded.
5. Record:
   - user intent and task type;
   - what the skill appeared to influence;
   - outcome and verification;
   - explicit user feedback;
   - relevant tool evidence.

Treat final assistant summaries as claims until traces or artifacts support them. Give explicit user corrections the highest weight, but also retain successful counterexamples so the retrospective does not become failure-only.

**Complete when:** every selected transcript has been read completely and each relevant episode has a compact evidence record.

## 4. Evaluate the skill through distinct lenses

Choose only lenses relevant to the skill:

- **Selection:** correct invocation, false positive, missed invocation, or correct routing away.
- **Execution:** whether the instructed sequence and completion criteria changed behavior as intended.
- **Outcome:** correctness, safety, usefulness, and verification quality.
- **Ergonomics:** repeated shell ceremony, quoting problems, oversized outputs, retries, missing wrappers, or awkward recovery.
- **Information hierarchy:** duplicated meaning, missing branches, stale facts, unused reference sediment, or details with the wrong prominence.
- **Interaction:** tone, pacing, permission boundaries, or reporting format—but only when the skill intends to govern interaction.

Define observable criteria for the target skill before scoring. For long workflows, score individual episodes rather than reducing a session to one pass/fail result.

Classify causal confidence:

- **Direct:** the skill explicitly produced or strongly encouraged the behavior.
- **Missing guard or affordance:** the skill left a recurring decision or operation unsupported.
- **External:** the tool, environment, task, or model caused the issue; skill guidance may only offer recovery.
- **Unclear:** evidence is insufficient; gather more or leave unchanged.

**Complete when:** each finding has a lens, evidence, recurrence or scope, impact, and causal-confidence classification.

## 5. Synthesize changes

Separate findings into:

- **Keep:** guidance proven useful in successful episodes.
- **Add or strengthen:** missing routing, completion criteria, recovery, examples, or automation.
- **Change prominence:** useful but over- or under-emphasized material.
- **Prune:** duplication, no-ops, stale facts, and unused sediment.
- **Do not encode:** one-off failures or external causes that would overfit the skill.

Prefer the smallest high-leverage intervention:

1. sharpen the description for selection failures;
2. sharpen a step or completion criterion for execution failures;
3. add routing for realistic near-misses;
4. add a script or view when repeated operational ceremony is the problem;
5. disclose branch-specific reference rather than bloating the main workflow;
6. split a skill only when invocation or sequence boundaries justify the added load.

If the user requested discussion, present evidence and proposed changes before editing. Incorporate their corrections as design evidence rather than treating the first analysis as final.

**Complete when:** every recommendation maps to observed evidence and predicts a concrete behavior change without erasing proven strengths.

## 6. Revise and validate

When revision is authorized:

1. Re-read the full current skill after the discussion.
2. Preserve a single source of truth for each rule.
3. Co-locate the fix with the step or branch it governs.
4. Add scripts only for repeated, deterministic operations.
5. Validate frontmatter, links, referenced files, script syntax, and executable behavior as applicable.
6. Inspect the diff for unrelated changes and documentation sediment.

Do not create synthetic eval suites unless requested. End with:

- corpus and version boundaries;
- strongest evidence-backed findings;
- files changed and validation performed;
- what future sessions should reveal if the revision works;
- remaining uncertainty.

**Complete when:** the revision is validated and its expected observable effect is stated, so a later retrospective can test it.
