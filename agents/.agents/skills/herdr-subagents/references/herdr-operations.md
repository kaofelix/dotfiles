# Herdr operations

Load this reference when delegation needs topology decisions, several agents, lifecycle recovery, blocked-agent handling, or cleanup.

## Topology

Inspect the current layout and identify the caller's pane before creating anything. Plan the roles, but provision each location just in time so empty reserved tabs do not become stale state.

Use this repository owner's preferred layout:

- **Exactly one planned subagent:** split one sibling pane in the caller's tab and keep the tab to two panes.
- **Several planned subagents:** use one task-labelled tab per subagent, with one agent in each tab's root pane. Keep the caller's tab unsplit.

Count the whole planned workflow, not only simultaneously running agents. A queue that will use several fresh agents therefore uses task-labelled tabs created one item at a time. Preserve UI focus and set the intended working directory for every location.

Start agents with short task-specific names. Record the opaque pane ID and live agent name; address the live target by that name or pane ID rather than guessing identifiers. Use another agent kind or native model arguments only when requested.

Use `herdr_agent` for coding-agent lifecycle and conversation. Use `herdr_pane` for ordinary commands or intentional raw terminal control.

## Collection

Submit independent work without waiting when useful lead work remains. Otherwise wait for `idle`, `done`, or `blocked`; omit arbitrary timeouts when an indefinite wait is acceptable.

For a settled Pi agent, retrieve `last_message` from its native session. Use terminal reads for live inspection, approval overlays, questions, or agents without a readable native session.

After a timeout, resolve the target once. Continue waiting if it is working; inspect output only when there is evidence of a blocker or diagnostic need. Before every follow-up in a multi-agent workflow, confirm the target still owns the task.

## Recovery

- **Target missing:** list live agents and panes, recover the correct target, or start a fresh agent from durable repository state.
- **Prompt did not engage:** inspect state and transcript, then resend once to the verified target.
- **Native last message unavailable:** increase the terminal read window. If the response remains incomplete, ask the agent to write the full report to a temporary Markdown file and return its path.
- **Blocked on approval or a question:** inspect the visible or detection source. Provide only input already justified by the brief; surface credentials, irreversible effects, scope expansion, and product or design decisions to the user.
- **Unplanned child delegation:** keep the agent on its assigned task and return orchestration to the lead.
- **Shared-worktree collision:** stop additional writers, identify ownership from diffs and transcripts, preserve unrelated changes, and serialize the remaining work.

## Retention and cleanup

A location intentionally retained for inspection is not stale. Record its agent name, pane ID, purpose, and state. Do not reuse a retained agent as the owner of a new task.

Leave one-off locations available for inspection unless cleanup was requested. Close only locations created by the workflow. Queue-specific retention rules live in [sequential queues](sequential-queues.md).
