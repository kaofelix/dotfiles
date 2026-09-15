---
description: Coordinate one or more side-pane pi sessions via herdr
argument-hint: "<tasks-or-slices>"
---
Use herdr to coordinate side-pane pi sessions for this work: $@

This is an orchestration prompt, not an implementation prompt for the current pane.

## Coordination pattern

1. Record the coordinator pane id: this is the pane you are currently running in since you are the coordinator. You can get this from the env var `$HERDR_PANE_ID` Pass this id into every worker prompt as `COORDINATOR_PANE`.
4. Create a right-side worker pane next to the coordinator: `herdr pane split $COORDINATOR_PANE --direction right --no-focus`
5. Write a temp prompt file
6. Start a fresh pi session in the worker pane with an initial prompt:
   - `herdr pane run "$WORKER_PANE" "cd $(pwd) && pi @prompt-file"`

## Worker prompt

- pass in the context for the task to be worked on. if it's a dex task, give the id
- ask for a final report:
  - files changed,
  - approach/decisions,
  - tests/build commands run and results,
  - blockers/follow-ups,
- tell the worker to call-home:
  - after writing the final report in the worker pane, the worker must notify the coordinator by sending a concise message to `COORDINATOR_PANE` with herdr, for example:
    - `herdr pane run "$COORDINATOR_PANE" "Worker <worker-pane-id/name> is done. Summary: <one-line result>. Please read pane <worker-pane-id> for the full report."`

## Review on Result

When the worker calls home with the final report, do a review of the worker's work. If there's any improvements to be made, send it to the worker with: `herdr pane run "$PANE" "$PROMPT"` with the call home instructions.

Repeat the review process until no improvements, then finally close the worker pane and give a final concise report to the user in this coordinator session.

## Important

Don't use `herdr wait`, simply stop and rely on the worker or user to ping your when work is done
