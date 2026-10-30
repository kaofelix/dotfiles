---
name: hc-subagents
description: "Delegate to child agents through hc (herdr-core). Use when the user explicitly asks to delegate, spawn subagents, or open a side pane or background child through Herdr/hc for an investigation, review, bounded implementation, human handoff, or task queue."
---

# hc Subagents

Delegate through hc only when the user explicitly asks. Run `hc --skill` for the command manual; this skill is the delegation policy. Preserve the role assigned by the current task:

- **Lead:** coordinate only the delegation explicitly authorized for this task.
- **Writer:** perform the assigned change and verification directly, then report to the lead.
- **Reviewer:** inspect the assigned target read-only and return findings to the lead.

Loading this skill does not change the assigned role or grant orchestration authority. A parent's permission to delegate is not inherited by its children. Further delegation requires explicit authorization in the agent's own assignment; if the role is unclear, clarify it before starting agents. The lead defines the boundary, preserves unrelated work, and treats child reports as claims to verify rather than proof of completion.

## Use the simplest fitting pattern

- **Investigation** — one or more read-only agents gather evidence and return a decision artifact.
- **Review** — a read-only agent evaluates a defined diff, commit, working tree, or design and returns actionable findings.
- **Bounded implementation** — one writer makes a coherent change, then the lead inspects and verifies it. Load [the implementation-loop reference](references/implementation-loop.md) when the task needs feedback rounds, an independent reviewer, or commit/push gates.
- **Human handoff** — start and brief an agent for the user to work with directly (a visible side pane, see the operations reference). Record its name and address, and wait for explicit handback before reviewing, committing, closing, or assigning new work.
- **Sequential queue** — process several bounded items with fresh task context. Load [the queue reference](references/sequential-queues.md) for continuous versus checkpointed cadence, retention, and broad-spec checkpoints.

Use parallel agents for independent read-only work. Keep one writer at a time in a shared working tree; concurrent writers need separate worktrees (`git worktree add`) and explicit ownership.

Children report to the lead by default. Writers and reviewers start no further agents unless their own brief grants orchestration authority and bounds the count and topology.

Complete when the pattern, owner, task boundary, working directory, write authority, and any external effects are explicit.

## Start and brief

Check `hc templates` first and use a fitting role. Always start agents with `hc run --bg --name <task> --cwd <dir> ... "<task>"`, interactive (never one-shot print modes), with the task in the same command. Tell each child to report with `hc send $HC_TERMINAL_ID` when done or stuck.

Give the child the complete user intent and the context it cannot safely discover:

- the bounded outcome or exact review target;
- read-only or writable authority, prohibited external effects, and non-goals;
- external requirements, links, or prior decisions that are not durable in the repository;
- any approach, acceptance gate, or report artifact the user explicitly required.

Trust the child to inspect the project, select skills, plan, and verify proportionately. Do not invent methodology, file lists, or report structure to make the brief look complete. Put role, report target, authority, and delegation permission before the task context. Do not repeat the parent's request to use Herdr in a writer or reviewer brief; that is lead context, not child authority.

Do not make a fresh agent reconstruct essential context from another agent's conversation. Put accepted decisions in code, commits, issue text, documents, or the next prompt.

Complete when the agent can begin without guessing intent, authority, or unavailable context.

## Operate with minimal orchestration

Start each child just before use. Prefer `hc wait` and messages over scraping the screen; read the screen for live UI, approvals, questions, or recovery. Before a follow-up, verify the target is still live and owns the task. `blocked` needs inspection or input; a wait timeout is a check-in, not a failure.

Load [hc operations](references/hc-operations.md) for topology (background child vs visible side pane vs remote machine), several agents, recovery, blocked agents, or cleanup.

Complete when the result is recoverable from the agent's report or final screen, or the blocker is specific enough to act on.

## Verify proportionately

For read-only work, check the report against the requested evidence before relying on it.

For writable work, the lead always inspects repository status, the exact diff, requirement coverage, verification evidence, unrelated changes, and prohibited effects. An additional review agent is optional: use one when the user asks for independence or when risk, breadth, or uncertainty justifies it. Lead review is enough for a small, mechanical, well-covered change.

Adjudicate findings before forwarding them. A finding becomes required work only when it maps to the request, an acceptance criterion, or a regression introduced by the change. Defer speculative platform support, infrastructure, and unrelated cleanup.

Only finalize, commit, push, or mark work complete when authorized and supported by real repository or remote evidence.

## Finish

Report the delegated outcome, verification, adjudicated findings, remaining risks, and every terminal left running. Keep terminals promised for user inspection or follow-up. Kill and `hc rm` only terminals this workflow started, and only when the pattern or user request calls for cleanup.
