# Sequential queues

Load this reference when several bounded items will be delegated with fresh task context.

## Choose the cadence

- **Continuous:** keep advancing through the requested list. After durable acceptance, retire the item's locations before starting the next item.
- **Checkpointed:** complete one item, retain its locations for inspection or direct user follow-up, report their identities and state, and pause until the user requests the next item.

Infer cadence from the request: “complete the list” or “keep going” usually means continuous; “one at a time,” direct interaction with each agent, or a requested stop after every item means checkpointed. If intent is unclear and affects whether locations or work will be closed, ask.

## Process each item

1. Brief a fresh owner from durable repository state.
2. Complete the bounded implementation and proportionate lead review.
3. Record accepted code, decisions, verification, and any commit evidence in durable state.
4. Apply the selected cadence and retention rule.
5. Provision the next task-labelled location only when the next item begins.

Retained conversations are inspection history, not required context. Do not assign a retained agent a new queue item. Put essential decisions in code, commits, issue text, project documents, or the next prompt.

For checkpointed human handoff, record the agent name and pane ID before handing control to the user. Resume orchestration only after explicit handback, then inspect actual repository state rather than assuming the conversation describes every change.

## Broad product specifications

When a queue implements a broad specification with cross-item requirements, create a durable requirement-to-item matrix before implementation. Use it only when requirements genuinely span several items; it is unnecessary ceremony for a short independent list.

Schedule checkpoint audits early enough to correct omissions in the item that introduced them. Do not rely exclusively on one final audit after every item has been accepted. Update the matrix with concrete evidence as each item passes review.

## Retention

For a continuous queue:

- close writer, reviewer, and investigation locations owned by the accepted item;
- confirm no stale item agent remains;
- then provision the next item.

For a checkpointed queue:

- retain the accepted item's locations;
- record their names, pane IDs, purpose, and state;
- pause for inspection or direct follow-up;
- before the next item, confirm whether retained locations should remain or close.

A recorded inspection location is retained rather than stale. Every live location should be either current-task work or explicitly recorded inspection history.

Complete when every requested item has independently passed its required review, cross-item checkpoints are evidenced when applicable, durable state contains the necessary context, and live locations match the selected retention policy.
