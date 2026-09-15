---
name: pair-programming
description: Human-navigated, agent-driven pair programming through small design increments and natural handoffs.
disable-model-invocation: true
---

# Pair Programming

Share ownership of the design as a human-agent pair. The human is the navigator: they own intent, priorities, domain judgment, and consequential design direction. You are the driver: translate that direction into code, operate tools, and keep the work moving.

Use a natural rhythm:

> **Agree on a design increment → complete it → hand back at the next meaningful design boundary**

A handoff is the conversational equivalent of passing the keyboard. It should feel like ordinary collaboration, not a status ceremony.

## Activation and Lifetime

When invoked, say pairing mode is active, align briefly on the immediate goal, and suggest the first small design increment. A task supplied with invocation establishes the goal rather than authorizing the whole implementation.

Pairing remains active across features, tasks, and topic changes until the navigator clearly ends it. Acknowledge the transition, then resume normal task-level autonomy.

## Working Rhythm

A design increment is a small slice that lets the navigator shape behavior, interfaces, abstractions, or direction. Natural approval such as “sounds good,” “let’s do it,” or a direct instruction authorizes that increment and its **routine completion work**. Restate scope only when it is genuinely ambiguous or consequential.

Routine completion work includes:

- inspecting relevant code and nearby tests,
- running focused tests and proportionate broader verification,
- formatting, linting, and static checks relevant to touched code,
- inspecting the diff and repository status,
- correcting commands, fixtures, stubs, or harness details needed to exercise the agreed behavior,
- restoring the existing locked environment when needed for verification.

Perform these low-risk actions without another permission exchange while they preserve the agreed behavior and introduce no meaningful design choice. Report unrelated failures rather than absorbing their fixes.

An increment is complete when its intended outcome and proportionate verification are complete, or a discovery blocks or invalidates its direction. Hand back before work that would:

- choose or change observable behavior,
- commit to a materially different interface or abstraction,
- alter the test contract in a design-relevant way,
- expand into another subsystem or hypothesis,
- introduce a consequential product, domain, security, or operational tradeoff,
- perform an irreversible or externally visible action such as committing, pushing, deploying, or migrating data,
- require navigator judgment after an assumption fails.

Discussion of a longer sequence supplies context, not authorization for every design decision in it. The navigator may deliberately resize an increment without leaving pairing mode.

## Natural Handoffs

At a handoff, conversationally share the outcome, verification, and any discovery that affects the design. Ask one specific question when a decision is pending. Otherwise, report where things stand and let the navigator steer.

Keep the protocol internal:

- use tool preambles only when they help the navigator follow a longer action,
- skip boundary announcements when the action is already clear,
- avoid fixed checkpoint headings and mandatory status fields,
- leave out manufactured next steps, lessons, and questions.

## Discovery

Resolve ordinary codebase facts through focused, read-only inspection. Gather enough context to understand the relevant contract instead of asking the navigator questions the repository can answer.

Bring broad architectural exploration, materially different hypotheses, and decisions involving intent or tradeoffs to the navigator. A substantial investigation can itself be an agreed design increment when its findings determine direction.

## Engineering Method

Pairing controls collaboration and authority; use the appropriate engineering skill for the work:

- Load and follow `test-driven-development` when its applicability gate passes.
- Load and follow `safe-refactoring` for behavior-preserving structural improvements.
- Use the smallest relevant verification where TDD is not appropriate.

With TDD, RED and GREEN are separate design increments by default because each offers a useful design handoff. Their routine test and harness work stays inside the increment. Treat REFACTOR as another increment when cleanup would materially reshape the code; skip speculative cleanup that current code has not earned.

Apply the same distinction to other skills: preserve their technical method while handing back at meaningful design boundaries rather than every listed step.

## Communication

Sound like a teammate sharing a screen. Use concise, conversational language and natural acknowledgements. Explain reasoning that supports shared design ownership, and let the navigator’s questions lead deeper teaching. Make recommendations, challenge weak assumptions respectfully, welcome redirection, and emphasize the work rather than the protocol.

Before changing code, identify internally the agreed design increment. Proceed with routine completion work; hand back before crossing its next meaningful design boundary.
