---
name: workflow-to-skill
description: Discover or extract reusable agent workflows from Pi sessions. Use for broad pattern mining across session history or scoped analysis of a named practice, then decide whether the evidence should become a skill, prompt template, script, tool, reference, or project instruction.
---

# Workflow to Skill

Practice **workflow archaeology**: recover how work actually happens across sessions, separate durable practice from incidental behavior, and package only what deserves reuse.

Load and follow both `pi-sessions-duckdb` and `writing-for-agents`. Use session evidence to discover the workflow and writing principles to package it. Keep **observed practice**, **user-desired behavior**, and **agent inference** distinguishable throughout.

## 1. Choose the discovery branch

### Broad pattern mining

Use when the user asks what recurring workflows exist without naming one.

1. Establish a bounded scope from the request: projects, time range, task family, or a representative cross-project sample.
2. Inventory the scope before loading conversation payloads.
3. Search independently for recurring:
   - user intents and prompt shapes;
   - interaction and approval boundaries;
   - tool or artifact sequences;
   - user corrections and repeated frustrations;
   - workarounds and recovery actions.
4. Cluster episodes by shared intent and decision structure, not merely by common tools.
5. Rank candidate workflows by recurrence, cross-context usefulness, coherence, evidence quality, friction addressed, and packaging potential.
6. Present a bounded shortlist and let the user choose before drafting a package.

Broad discovery may conclude that no pattern is mature enough to package.

**Complete when:** the searched scope and sampling method are explicit, candidates have evidence-backed rankings, and one candidate is selected or the investigation stops without forcing a result.

### Scoped workflow extraction

Use when the user names a practice, such as turning discussion into a planning workflow.

1. Restate the candidate practice in the user's terms.
2. Derive semantic search signals: likely intents, corrections, artifacts, tool sequences, and decision points. Do not rely on one literal phrase.
3. Find confirming, contrasting, and failed episodes across more than one context when available.
4. Decide whether the practice is:
   - repeated and extractable;
   - several distinct workflows hiding under one label;
   - primarily desired behavior with limited historical evidence;
   - better represented by another kind of artifact.

Proceed with an aspirational design when the user wants one, but label which parts come from intent rather than repeated traces.

**Complete when:** the candidate's working boundary, search signals, corpus, and evidence status are explicit.

See [session discovery](references/session-discovery.md) for bounded corpus recipes.

## 2. Reconstruct workflow episodes

Treat the episode—not the session—as the unit of evidence. One session may contain several workflows or revisions.

For every selected session:

1. Profile roles and content types.
2. Read the complete compact user/assistant transcript.
3. Locate the relevant episode and its surrounding context.
4. Inspect tool executions, full skill bodies, or artifacts only when needed to verify actions and outcomes.
5. Record an episode card:
   - **Trigger:** what started the process;
   - **Intent:** the result the user wanted;
   - **Inputs:** requirements, files, designs, or prior artifacts;
   - **Sequence:** actions and their order;
   - **Decisions:** where judgment or approval changed direction;
   - **Authority:** read, edit, commit, push, or external-action boundaries;
   - **Evidence:** tests, reports, diffs, screenshots, or other checks;
   - **Completion:** how the episode stopped;
   - **Friction:** retries, drift, workarounds, or user corrections.

Include successful and unsuccessful episodes. Final assistant summaries are leads, not proof; verify important claims against traces or artifacts.

**Complete when:** every selected transcript has been read completely and each relevant episode has a checkable evidence card.

## 3. Extract the durable workflow

Compare the episode cards and classify each element as:

- **Invariant core:** repeated across successful instances and necessary to the outcome.
- **Branch:** legitimate variation triggered by a recognizable condition.
- **Heuristic:** judgment the agent should apply rather than a rigid rule.
- **Mechanic:** deterministic repeated work suitable for a script or tool.
- **Safeguard:** evidence-backed response to recurring failure or risk.
- **Incidental detail:** project, model, tool version, or one-session behavior.
- **Open choice:** unresolved design requiring user input.

Frequency is evidence, not authority. A repeated workaround may reveal a missing capability; a single user correction may expose an important boundary; a common generic coding action may not constitute a meaningful workflow.

Describe the smallest end-to-end workflow that preserves the intent, decisions, evidence, and completion boundary. Avoid encoding the entire historical sequence when a shorter process explains its success.

**Complete when:** every proposed workflow element is traced to evidence or explicitly labeled as desired design, and incidental behavior has been excluded.

## 4. Choose the package

Do not assume the result must be a skill.

- **Model-invoked skill:** the agent should recognize the workflow from natural intent or another skill must reach it.
- **User-invoked skill:** the workflow is a deliberate mode, expensive operation, or consequential process the user should start explicitly.
- **Prompt template:** a parameterized, mostly one-shot request whose procedure does not need autonomous discovery.
- **Script:** repeated mechanics are deterministic and can be made executable.
- **Tool or extension:** the recurring workaround compensates for a missing structured capability.
- **Project instruction:** the behavior is an always-relevant local convention.
- **Reference:** several workflows need the same facts but not the same invocation.

A mixed package is valid—for example, a skill using a script, or a workflow skill accompanied by one-shot prompt templates. Minimize both always-loaded context and artifacts the user must remember.

**Complete when:** the chosen package follows from invocation needs, reasoning requirements, determinism, scope, and maintenance cost.

## 5. Design the reusable contract

For a skill, define before drafting:

- leading name and concept;
- model- or user-invocation;
- trigger branches and realistic near-misses;
- required inputs and prerequisites;
- ordered steps and completion criteria;
- decision, authority, and safety boundaries;
- composition with existing skills;
- scripts and progressively disclosed reference;
- intentionally flexible behavior.

Formalize the execution discipline, not incidental conversational tone. Preserve human judgment where the historical process depended on it.

For another package type, define the equivalent invocation, inputs, output contract, and ownership boundary.

If the user requested discussion, present this contract before writing files.

**Complete when:** the proposed package can explain successful episodes, address recurring friction, and avoid claiming unrelated near-misses.

## 6. Replay against history

Perform a lightweight counterfactual audit against the corpus:

- Would the invocation have matched the intended episodes?
- Would near-misses have been routed correctly?
- Would the steps preserve successful variations?
- Would completion criteria prevent observed drift or premature stopping?
- Would safeguards address recurring failures without overfitting?
- Would the package remove repeated ceremony or merely document it?

Revise the contract when historical episodes expose a contradiction. Do not create a synthetic evaluation suite unless requested.

**Complete when:** representative successes, failures, and near-misses are accounted for, with remaining uncertainty stated.

## 7. Create and validate

When creation is authorized:

1. Write the smallest viable package in its canonical repository location.
2. Keep each rule in one authoritative place.
3. Add scripts only for repeated deterministic mechanics.
4. Disclose branch-specific details behind references.
5. Validate frontmatter, links, scripts, examples, and executable behavior as applicable.
6. Inspect the diff for unrelated changes and historical sediment.

End by reporting:

- corpus and scope;
- extracted versus aspirational elements;
- why this package type was selected;
- files created and validation performed;
- signals to watch in initial real usage.

After the workflow has been used in real sessions, evaluate it with `skill-retrospective` rather than continuing to optimize from the creation corpus alone.

**Complete when:** the package is valid, its evidence lineage is clear, and future observation criteria are explicit.
