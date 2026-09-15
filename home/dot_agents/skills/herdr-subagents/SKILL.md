---
name: herdr-subagents
description: "Herdr subagent delegation. Use when the user explicitly asks to delegate through Herdr for an investigation, review, bounded implementation, human handoff, or task queue."
---

# Herdr Subagents

Delegate through Herdr only when the user explicitly asks. Act as the lead unless ownership is deliberately handed to the user or another orchestrator: define the boundary, preserve unrelated work, and treat subagent reports as claims to verify rather than proof of completion.

## Use the simplest fitting pattern

- **Investigation** — one or more read-only agents gather evidence and return a decision artifact.
- **Review** — a read-only agent evaluates a defined diff, commit, working tree, or design and returns actionable findings.
- **Bounded implementation** — one writer makes a coherent change, then the lead inspects and verifies it. Load [the implementation-loop reference](references/implementation-loop.md) when the task needs feedback rounds, an independent reviewer, or commit/push gates.
- **Human handoff** — start and brief an agent for the user to work with directly. Record the agent and location, then wait for explicit handback before reviewing, committing, closing, or assigning new work.
- **Sequential queue** — process several bounded items with fresh task context. Load [the queue reference](references/sequential-queues.md) for continuous versus checkpointed cadence, retention, and broad-spec checkpoints.

Use parallel agents for independent read-only work. Keep one writer at a time in a shared working tree; concurrent writers need separate worktrees and explicit ownership.

Subagents report to the lead by default. Delegation depth is one unless the brief explicitly grants orchestration authority and bounds the child count and topology.

Complete when the pattern, owner, task boundary, working directory, write authority, and any external effects are explicit.

## Brief only what cannot be inferred

Give the subagent the complete user intent and the context it cannot safely discover for itself:

- the bounded outcome or exact review target;
- read-only or writable authority, prohibited external effects, and important non-goals;
- external requirements, links, or prior decisions that are not durable in the repository;
- any approach, acceptance gate, or report artifact explicitly required by the user.

Trust the subagent to inspect the project, follow its instructions, select applicable skills, find relevant files, plan the work, and verify proportionately. Do not invent methodology, file lists, checks, or report structure merely to make the brief look complete.

For an investigation, ask for a decision artifact only when the result must support a choice. For a review, identify the exact target and dimensions when they are not obvious. For an implementation, assign one coherent change and preserve unrelated work.

Do not make a fresh agent reconstruct essential context from another agent's conversation. Put accepted decisions in code, commits, issue text, documents, or the next prompt.

Complete when the agent can begin without guessing user intent, authority, or unavailable context.

## Operate with minimal orchestration

Provision only the location needed for the chosen pattern and create it just before use. Prefer lifecycle and native-session communication over terminal scraping. Use `last_message` for a settled Pi agent; inspect the terminal for live UI, approvals, questions, or recovery.

Before sending a follow-up, verify that the live target still exists and owns the task. Treat `blocked` as requiring inspection or input, `unknown` as uncertain, and a wait timeout as an observation boundary rather than task failure.

Load [Herdr operations](references/herdr-operations.md) when topology choice, several agents, lifecycle recovery, blocked agents, or cleanup needs detailed handling.

Complete when the result is recoverable from the agent's native session or the blocker is specific enough to act on.

## Verify proportionately

For read-only work, check the report against the requested evidence before relying on it.

For writable work, the lead always inspects repository status, the exact diff, requirement coverage, verification evidence, unrelated changes, and prohibited effects. An additional review agent is optional: use one when the user requests independence or when risk, breadth, uncertainty, or change impact justifies the extra pass. Lead review is sufficient for a small, mechanical, well-covered change.

Adjudicate findings before forwarding them. A finding becomes required work only when it maps to the request, an acceptance criterion, or a regression introduced by the change. Defer speculative platform support, infrastructure, and unrelated cleanup.

Only finalize, commit, push, close workflow state, or mark work complete when authorized and supported by real repository or remote evidence.

## Finish

Report the delegated outcome, verification, adjudicated findings, remaining risks, and every agent or location left available. Preserve locations promised for user inspection or direct follow-up. Close only locations created by this workflow, and only when the selected pattern or user request calls for cleanup.
