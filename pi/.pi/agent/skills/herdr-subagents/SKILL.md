---
name: herdr-subagents
description: "Herdr subagent orchestration. Use when the user asks to delegate through Herdr for a read-only investigation or review, an implementation-and-review loop, or a sequential task queue."
---

# Herdr Subagents

Orchestrate Herdr as the lead agent. The user authorizes delegation by explicitly asking to use Herdr; retain responsibility for scope, review, and completion rather than treating the subagent's report as proof.

## Choose the workflow

Classify the delegated task before creating a pane:

- **Investigation** — the subagent inspects and reports without changing project files.
- **Review** — the subagent evaluates a defined diff, commit, or working tree and returns actionable findings without editing.
- **Implementation loop** — one writer makes a bounded change; you inspect it and return focused feedback until it is acceptable.
- **Sequential queue** — run an implementation loop for one item, retire its agent, then start the next item with fresh context.

Use parallel agents for independent read-only work. Use one writer at a time in a shared working tree; give concurrent writers separate worktrees.

Completion criterion: the workflow, task boundary, working directory, and write authority are explicit.

## Establish the topology

1. Inspect the current Herdr layout and identify the caller's pane.
2. Split a sibling pane in the current tab and relevant working directory, preserving UI focus.
3. Start a Pi agent with a short, task-specific name. Use another agent kind or native model arguments only when the user requests them.
4. Record the opaque pane ID and live agent name returned by Herdr. Address the agent by its live name or hosting pane ID, never by a guessed identifier.

Use `herdr_agent` for coding-agent lifecycle and conversation. Reserve `herdr_pane` for ordinary processes or intentional raw terminal control.

Completion criterion: one live agent occupies the intended pane in the intended working directory.

## Brief the subagent

Send one self-contained prompt containing:

1. **Objective** — one bounded outcome.
2. **Evidence** — requirements, issue or design links, commits, files, and surrounding patterns to inspect.
3. **Authority** — read-only or writable; allowed scope; whether commit, push, browser mutation, or other external effects are authorized.
4. **Method** — applicable project instructions and engineering skills; required baseline or TDD sequence when relevant.
5. **Verification** — focused tests and proportionate checks expected before reporting.
6. **Report** — concrete completion evidence: files changed, findings or decisions, commands and results, risks, and blockers.

For investigation prompts, demand a decision artifact: current state, evidence, alternatives, recommendation, implementation surface, and unresolved risks.

For review prompts, identify the exact review target and dimensions. Ask for actionable findings ordered by severity with file-and-line evidence, and require an explicit no-findings result when applicable.

For implementation prompts, assign one coherent change, preserve unrelated work, reserve commits for a later approval gate, and require the agent to report when the uncommitted implementation is ready for review.

Completion criterion: the prompt lets a fresh agent determine both what to do and how to prove it is done without relying on hidden lead-agent context.

## Observe without polling the terminal

Use agent lifecycle operations rather than pane text as a message bus.

- Submit independent work without waiting when useful lead-agent work remains.
- Otherwise wait for `idle`, `done`, or `blocked`.
- Treat a timeout or “no observed state change” as an observation boundary, not task failure. Inspect the live agent and continue waiting or redirect it based on evidence.
- Treat `blocked` as a request for inspection or input.
- Treat `unknown` as uncertain.

Before every follow-up, confirm the live target still exists and still owns the task. This target check is mandatory when several agents or panes are present.

Completion criterion: a settled agent has produced a recoverable report, or a blocker has been identified with enough evidence for the lead to act.

## Review loop

For writable work, independently inspect the repository after each agent result:

1. Check repository status and the exact diff.
2. Map every delegated requirement to code and test evidence.
3. Run or inspect proportionate verification; distinguish pre-existing failures from regressions.
4. Check scope, generated files, unrelated changes, and prohibited external actions.
5. Either accept the implementation or send one focused feedback prompt to the same live agent.

Feedback should state the observed gap, evidence, desired constraint, permitted scope, and verification needed. Keep the agent on the same bounded task until the review passes.

Authorize a commit or push only when the user has requested it and the diff has passed review. Name the exact files or change scope, required checks, commit intent, and expected commit/push evidence.

Completion criterion: every requirement is evidenced, verification is satisfactory, scope is clean, and any authorized commit or push is confirmed by real repository or remote state.

## Sequential queues

Process queues serially:

1. Finish the current item's implementation loop.
2. Capture its accepted result and any commit evidence.
3. Close only the pane created for that item when cleanup or replacement is part of the request.
4. Create a fresh pane and agent for the next item.
5. Brief the new agent from durable repository state and explicit prompt context.

Do not carry essential context only in the retired agent's conversation. Put accepted decisions in code, commits, issue text, or the next prompt.

Completion criterion: every requested queue item has independently passed the review loop; progress on one item is not evidence for another.

## Recovery

- **Target missing:** list live agents and panes. Recover the correct live target or start a fresh agent briefed from repository state.
- **Agent started but prompt did not engage:** inspect its state and transcript, then resend the prompt once to the verified target.
- **Output incomplete in the terminal:** increase the agent read window. If the complete response remains unavailable, ask the agent to write it to a temporary Markdown file and return only the path, then read that file.
- **Agent blocked on a human boundary:** surface the exact authorization, credential, product, or design decision needed; resume the same agent after the user resolves it.
- **Shared-worktree collision:** stop additional writers, identify ownership from diffs and transcripts, and serialize the remaining work. Preserve unrelated changes.

## Finish

Report the delegated outcome, your independent review, verification evidence, remaining risks, and the state of any pane or agent left running. Leave a one-off pane available for user inspection unless cleanup was requested; close only panes created by this workflow.
