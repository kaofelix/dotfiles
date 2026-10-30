# hc operations

Load this reference when delegation needs several agents, lifecycle recovery, blocked-agent handling, remote machines, or cleanup. `hc --skill` is the authoritative command manual; this covers the delegation policy on top of it.

## Topology

Children are terminals whose `parent` is the caller. They appear nested under the caller in the Herdr app's Agents list and end when the caller ends. Plan the roles, but start each child just in time so idle terminals do not become stale state.

- **Default — background child:** `hc run --bg --name <task> --cwd <dir> <template|agent> "<task>"`. It shows in the app's Agents tree; the user can peek at it without it taking layout space.
- **Visible side pane:** when the user wants to watch or work beside the agent, give the terminal the caller's Herdr labels so the app opens it as a column in the caller's tab:

```sh
hc get $HC_TERMINAL_ID          # read the herdr.space / herdr.tab labels
hc run --bg --no-parent --name <task> \
  --label herdr.space=<space-id> --label herdr.tab=<tab-id> <agent> "<task>"
```

  Use the ids as printed, without the `machine/` prefix. A `--no-parent` pane is not cleaned up when the caller ends: remove it yourself. If the caller has no `herdr.space` label, it is not running inside the app; use a background child.
- **Another machine:** add `--on <machine> --cwd <abs path>`; use the returned `machine/tN` address everywhere afterward.

Count the whole planned workflow, not just simultaneous agents. Give each agent a short task-specific name and a distinct scope. Address live targets by name or address from `hc ls`; do not guess IDs.

## Collection

Put the task in the `run` command. Keep doing useful lead work, then `hc wait --children all` (or `any`). Do not poll or sleep. Reports arrive as `<hc from=...>` messages; treat them as claims to verify. Ask for long results in a file and a path message.

For a finished agent, `hc read <t> --lines N` shows its final screen. If the result is incomplete, ask the agent to write it to a Markdown file and send the path.

## Recovery

- **Target missing:** `hc ls`; recover the correct target or start a fresh agent from durable repository state.
- **`first_message.sent` false or prompt did not engage:** `hc read <t>` first; resolve a trust dialog with `hc keys <t> down enter`; resend once to the verified target.
- **`blocked`:** read the screen. Provide only input already justified by the brief; surface credentials, irreversible effects, scope expansion, and product or design decisions to the user. Never `send --force` past a permission decision.
- **`error` or exited without reporting:** read why, then send or restart from durable state.
- **Unplanned child delegation:** `hc interrupt <t>` and restate the assignment.
- **Shared-worktree collision:** stop additional writers, identify ownership from diffs, preserve unrelated changes, and serialize.

## Retention and cleanup

A terminal retained on purpose for inspection is not stale: `hc keep` it, and record its name, address, purpose, and state. Do not reuse a retained agent for a new task.

Clean up only what this workflow started: `hc kill <t>`, then `hc rm <t>`. `hc ls` includes the user's other live work. Never `hc server stop`.
