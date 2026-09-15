# Bounded implementation loop

Load this reference when writable delegation needs feedback rounds, independent review, or controlled finalization.

## Writer brief

Assign one coherent change. Apply the briefing principle from the main skill and add only the boundaries needed for this loop:

- owns only the named scope;
- preserves unrelated and pre-existing work;
- leaves the change uncommitted unless finalization is explicitly delegated later;
- reports readiness, changed files, focused verification, risks, and blockers;
- does not create reviewers or alter Herdr topology unless granted orchestration authority.

When workflow status exists, keep it in progress until lead acceptance. Assign verification ownership so writer, reviewer, and lead do not repeat the same broad suite without a requirement-driven reason.

## Lead review

When the writer reports readiness:

1. Inspect repository status and the exact diff.
2. Map each requirement and non-goal to code and test evidence.
3. Run or inspect proportionate verification and distinguish pre-existing failures from regressions.
4. Check generated files, unrelated changes, prohibited effects, and documentation claims.
5. Accept the result or send one focused correction prompt to the same writer.

Feedback should identify the accepted gap, requirement evidence, desired constraint, permitted scope, non-goals, and verification needed.

## Independent review

A separate reviewer is a proportionality choice, not a universal gate. Add one when:

- the user asks for an independent review;
- the change affects security, payments, data integrity, public contracts, migrations, or other high-risk behavior;
- the diff is broad or cross-cutting;
- the lead remains uncertain;
- the implementation used unfamiliar APIs or consequential architectural judgment.

For small mechanical changes with focused coverage, lead review is normally enough.

When used, provision the reviewer only after the writer is ready. Give it read-only authority, the exact target, requirements, non-goals, and review dimensions. The writer does not supervise its reviewer.

Adjudicate every finding. Require correction only when it maps to a requirement, acceptance criterion, or regression introduced by the diff. Reuse the reviewer after corrections when continuity is useful; choose a fresh reviewer only when independence or a materially changed review surface warrants it.

## Finalization

Use focused checks during correction and one fresh broad acceptance gate when the risk or project workflow requires it. Do not make every role rerun the full suite.

After acceptance, perform only authorized effects. For commit or push delegation, name the exact scope, required checks, commit intent, and expected repository or remote evidence.

Complete when requirements are evidenced, findings are adjudicated, verification is satisfactory, scope is clean, and authorized finalization is confirmed by real state.
