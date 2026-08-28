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
- **Sequential queue** — run implementation loops for several items with fresh context. Choose its cadence explicitly:
  - **Continuous** — keep advancing through the list and retire each item's locations after durable acceptance. Use this when the user asks to complete the list or keep going.
  - **Checkpointed** — complete one item, retain its locations for inspection or manual follow-up, report, and pause until the user requests the next item. Use this when the user asks to work one task at a time or stop after each item.

Use parallel agents for independent read-only work. Use one writer at a time in a shared working tree; give concurrent writers separate worktrees.

The lead is the orchestrator. Subagents perform their assigned task and report directly to the lead. A subagent may orchestrate children only when its brief explicitly grants that role, states the maximum child count, and defines their topology; otherwise delegation depth is one.

For a broad queue governed by a product specification, create a durable requirement-to-story matrix before implementation. Schedule cross-story checkpoint audits early enough to correct gaps in the story that introduced them rather than deferring discovery to the final audit.

Completion criterion: the workflow, queue cadence and retention policy, task boundary, working directory, write authority, orchestration owner, and any checkpoint gates are explicit.

## Establish the topology

Inspect the current Herdr layout, identify the caller's pane, and count the subagents planned for the workflow before creating anything. Plan the whole topology, then provision each location just before starting its agent; empty reserved tabs create stale state.

- **Exactly one subagent:** split one sibling pane in the caller's tab. Keep that tab to two panes total.
- **Several subagents:** use one task-labeled tab per subagent in the caller's workspace and each tab's root pane. Keep the caller's tab unsplit and each agent tab to one pane. Create each planned tab just in time rather than all at once.

This threshold applies to the whole planned workflow, not only agents currently running. A sequential queue containing several fresh agents therefore uses task-labeled tabs provisioned one item at a time. Preserve UI focus and use the relevant working directory for every created location.

Start each Pi agent with a short, task-specific name. Use another agent kind or native model arguments only when the user requests them. Record the opaque pane ID and live agent name returned by Herdr; address the agent by its live name or hosting pane ID, never by a guessed identifier.

Use `herdr_agent` for coding-agent lifecycle and conversation. Reserve `herdr_pane` for ordinary processes or intentional raw terminal control.

Completion criterion: each live agent occupies its intended readable location in the intended working directory, with no crowded multi-agent tab.

## Brief the subagent

Send one self-contained context packet containing:

1. **Objective** — one bounded outcome.
2. **Evidence** — requirements, issue or design links, commits, relevant files, exact documentation links, and dependency contracts to inspect. Point to only the prior material needed for this task rather than requiring broad rereads.
3. **Authority** — read-only or writable; allowed scope; explicit non-goals; whether commit, push, browser mutation, or other external effects are authorized; and whether Herdr delegation is authorized.
4. **Method** — applicable project instructions and engineering skills; required baseline or TDD sequence when relevant. For throwaway build output, use `mktemp -d` and leave it in place instead of deleting a fixed path recursively.
5. **Verification** — focused tests and proportionate checks expected before reporting. Assign verification ownership so writer, reviewer, and lead do not all rerun the same broad suite without a requirement-driven reason.
6. **Report** — concrete completion evidence: files changed, findings or decisions, commands and results, risks, and blockers.

For investigation prompts, demand a decision artifact: current state, evidence, alternatives, recommendation, implementation surface, and unresolved risks.

For review prompts, identify the exact review target and dimensions. Ask for actionable findings ordered by severity with file-and-line evidence, and require an explicit no-findings result when applicable.

For implementation prompts, assign one coherent change, preserve unrelated work, and require the agent to leave the change uncommitted and any workflow status In Progress while reporting readiness for lead-controlled review. State that the writer reports to the lead and does not create reviewers or Herdr topology unless the brief explicitly grants orchestration authority.

Completion criterion: the prompt lets a fresh agent determine both what to do and how to prove it is done without relying on hidden lead-agent context, while preserving the lead's ownership of review and finalization.

## Collect the result

Use agent lifecycle and native session data rather than pane text as a message bus.

- Submit independent work without waiting when useful lead-agent work remains.
- Otherwise wait for `idle`, `done`, or `blocked`. For autonomous long work, omit an arbitrary timeout when an indefinite wait is acceptable.
- Treat a timeout or “no observed state change” as an observation boundary, not task failure. Resolve the target once with `get`; continue waiting when it is working, and inspect output only when evidence indicates a blocker or diagnostic need.
- Treat `blocked` as a request for inspection or input. Read the visible or detection source so approval overlays and questions are available without alternate-screen scrolling.
- Treat `unknown` as uncertain.
- For a settled Pi agent, use `herdr_agent` `last_message` to retrieve its final response directly from the reported Pi session.
- Use `herdr_agent` `read` for live terminal inspection, approval UIs, or agents without readable Pi sessions.

Before every follow-up, confirm the live target still exists and still owns the task. This target check is mandatory when several agents or tabs are present.

Completion criterion: a settled agent has produced a recoverable native-session report, or a blocker has been identified with enough evidence for the lead to act.

## Review loop

For writable work, the lead owns the review path:

1. When the writer reports readiness, check repository status and the exact diff.
2. Map every delegated requirement and explicit non-goal to code and test evidence.
3. Provision the planned reviewer tab just in time, start a read-only reviewer there, and identify the exact review target and dimensions. The writer does not create or supervise its reviewer.
4. Collect the reviewer report, then adjudicate every finding against a user requirement, acceptance criterion, or regression introduced by the diff. Reject or defer speculative platform support, infrastructure, and unrelated cleanup rather than forwarding it as mandatory work.
5. Run or inspect proportionate verification; distinguish pre-existing failures from regressions. Use focused checks during correction and one fresh broad acceptance gate when required, rather than repeating the same full suite in every role.
6. Check scope, generated files, unrelated changes, prohibited external actions, and documentation claims.
7. Either accept the implementation or send one focused feedback prompt to the same live writer. Re-prompt the same reviewer after corrections by default; use a fresh reviewer when independence or a changed review surface justifies it.

Feedback should state the accepted finding, requirement evidence, desired constraint, permitted scope, explicit non-goals, and verification needed. Keep the writer on the same bounded task until the review passes.

Only after lead acceptance may the writer mark workflow status Done, finalize completion evidence, commit, or push. When the user authorized those effects, name the exact files or change scope, required checks, commit intent, and expected commit/push evidence.

Completion criterion: every requirement is evidenced, every reviewer finding is adjudicated, verification is satisfactory, scope is clean, and any authorized finalization is confirmed by real repository or remote state.

## Sequential queues

Process queues serially:

1. Finish the current item's implementation and lead-controlled review loop.
2. Capture its accepted result, requirement-matrix updates, and any commit evidence in durable state.
3. Apply the selected cadence:
   - **Continuous:** close every writer, reviewer, and investigation location owned by the accepted item, confirm no stale item agent remains, then provision the next task-labeled tab.
   - **Checkpointed:** retain the accepted item's locations, record their live names and pane IDs for inspection, report their state, and pause. When the user requests the next item, confirm whether retained locations should remain or be closed before provisioning a fresh writer tab.
4. Start each next item with a fresh writer briefed from durable repository state and an explicit context packet; retained conversations are optional inspection history, not required context.
5. At planned checkpoints, run a cross-story audit against the durable requirement matrix before continuing.

A recorded inspection location is retained, not stale. Never address a retained agent as the owner of a new item; use a fresh task-labeled tab and agent. Do not carry essential context only in a retained or retired conversation. Put accepted decisions in code, commits, issue text, the requirement matrix, or the next prompt.

Completion criterion: every requested queue item has independently passed the review loop, every checkpoint is evidenced, and all live locations are either current-task locations or explicitly recorded inspection locations.

## Recovery

- **Target missing:** list live agents and panes. Recover the correct live target or start a fresh agent briefed from repository state.
- **Agent started but prompt did not engage:** inspect its state and transcript, then resend the prompt once to the verified target.
- **Native last message unavailable:** inspect the terminal with an increased read window. If the complete response remains unavailable, ask the agent to write it to a temporary Markdown file and return only the path, then read that file.
- **Agent blocked on an approval or question:** inspect the visible or detection source, distinguish a safe planned action from scope expansion, and provide only the specific input justified by the brief. Surface human-only authorization, credential, product, or design decisions to the user.
- **Subagent attempts unplanned delegation:** keep the current agent on its assigned task and return orchestration to the lead. Provision any justified reviewer or investigator through the lead-owned topology.
- **Shared-worktree collision:** stop additional writers, identify ownership from diffs and transcripts, and serialize the remaining work. Preserve unrelated changes.

## Finish

Report the delegated outcome, adjudicated review findings, verification evidence, remaining risks, and the state of any pane or agent left running. For a one-off workflow, leave its pane available for user inspection unless cleanup was requested. For a continuous queue, complete the per-item cleanup gate and leave only current-task locations live. For a checkpointed queue, leave the accepted item's recorded locations available for inspection and manual follow-up while paused. Close only locations created by this workflow.
