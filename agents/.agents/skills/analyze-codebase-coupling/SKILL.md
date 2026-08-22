---
name: analyze-codebase-coupling
description: Analyze a software repository for Structured Design module coupling (content, common, external, control, stamp, and data) and Vlad Khononov's Integration Strength levels (intrusive, functional, model, and contract). Use when Codex must inspect a codebase, architecture, services, modules, APIs, schemas, or integration boundaries; classify coupling with file-and-line evidence; assess confidence and impact; or recommend ways to balance coupling.
---

# Analyze Codebase Coupling

## Purpose

Identify and explain coupling at concrete module or integration boundaries. Apply both taxonomies independently:

1. Structured Design module coupling: what knowledge or data crosses a module boundary.
2. Khononov's Integration Strength: what kind of knowledge binds integrating components.

Treat coupling as necessary for collaboration, not automatically as a defect. Recommend changes only when the coupling's strength, volatility, ownership, or operational impact creates a meaningful cost.

## Required inputs

Obtain or infer:

- Repository root or explicit analysis scope.
- Relevant languages, build files, generated-code locations, and test layout.
- Architectural boundaries such as modules, packages, libraries, services, deployables, databases, queues, and external systems.
- Optional user priorities: changeability, team autonomy, testability, reliability, security, or performance.

If scope is not stated, analyze the repository root and clearly state exclusions. Never claim whole-system coverage when only a subset was inspected.

## Core rules

- Make every classification evidence-based. Cite exact repository-relative file paths and 1-based line numbers or tight line ranges.
- Do not classify solely from names, directory structure, imports, or dependency manifests. Use those as leads and inspect behavior at both ends of the boundary.
- Trace producers and consumers, callers and callees, or writers and readers before assigning a type.
- Separate observed facts from inferences. State assumptions explicitly.
- Absence of evidence is not evidence of absence. Report uninspected, generated, dynamic, runtime-configured, or inaccessible paths as coverage limits.
- A boundary may have multiple coupling types. Record each supported classification instead of forcing one label.
- Apply the two taxonomies separately. Do not claim a one-to-one mapping between them.
- Distinguish source-code coupling from runtime, deployment, data, temporal, and organizational concerns.
- Avoid equating stronger coupling with higher severity. Severity depends on change frequency, blast radius, ownership, criticality, and mitigation.

## Strength ordering

Use these source-derived orderings from strongest to weakest:

- Structured Design: **content > common > external > control > stamp > data**.
- Integration Strength: **intrusive > functional > model > contract**.

Use the ordering to describe relative knowledge crossing a boundary, not as an automatic quality score. Do not add “message coupling” or other taxonomies unless the user asks for them; if mentioned, keep them clearly separate.

## Analysis workflow

### 1. Establish scope and boundaries

1. Inventory source roots, packages, build units, deployables, schemas, API specifications, migrations, configuration, tests, and generated files.
2. Identify candidate boundaries based on encapsulation and independent change or deployment, not directories alone.
3. Record ignored paths and why they are excluded.
4. Note whether boundaries are intra-process, inter-process, persistent-data, event-driven, or external-system integrations.

### 2. Map dependencies

Search for and inspect:

- Imports, calls, inheritance, reflection, friend/internal access, monkey patching, and generated bindings.
- Global variables, singletons, caches, registries, environment/configuration state, shared files, and shared database tables.
- Function arguments, flags, enums, commands, callbacks, DTOs, entities, schemas, events, and serialization formats.
- Duplicated or coordinated business rules, calculations, validation, state transitions, and terminology.
- Public APIs, versioned schemas, adapters, anti-corruption layers, and translation code.

Follow representative dependency chains far enough to show what the consumer actually knows and uses. Use tests and documentation as corroboration, not substitutes for implementation evidence when implementation is available.

### 3. Form candidate findings

For every candidate, define:

- Boundary: source component → target component or shared resource.
- Mechanism: call, shared state, schema, event, database, file, protocol, or duplicated behavior.
- Knowledge crossing the boundary.
- Structured Design classification, if supported.
- Integration Strength classification, if supported.
- Consequence of changing either side.

### 4. Challenge each finding

Look for counterevidence:

- Is the accessed member intentionally public?
- Is shared state immutable, isolated, or single-writer?
- Does the receiver actually use most of the passed structure?
- Is a flag domain data rather than an instruction selecting internal behavior?
- Is duplicated logic coincidental or truly the same business invariant?
- Is a “shared model” actually an integration-specific contract?
- Is an adapter translating an external contract into a local model?
- Is the suspicious file generated, vendored, test-only, or dead code?

Downgrade confidence or omit the finding when counterevidence is unresolved.

### 5. Assess impact and recommend

Evaluate likelihood and impact using change frequency, number of consumers, cross-team ownership, deployability, critical path, data integrity, security, and failure blast radius. Prefer the smallest recommendation that improves the relevant quality attribute without destroying useful cohesion or adding unnecessary indirection.

## Detection guide: Structured Design

### Content coupling — strongest

Definition: one module bypasses another's public integration surface and depends on private implementation details.

Evidence signals:

- Direct access to private/internal fields, storage, memory, files, or tables owned by another module.
- Reflection, unsafe access, friend declarations, monkey patches, deep imports, or test hooks used in production paths.
- A consumer relies on undocumented internal ordering, representation, naming, or lifecycle.

Require evidence of both the intended boundary and its bypass. A public getter, supported extension point, or generated binding is not automatically content coupling.

Recommendations: expose a stable operation, move behavior to the owner, introduce an adapter, or redraw a boundary that is consistently porous.

### Common coupling

Definition: multiple modules read or modify the same globally shared data structure or mutable state.

Evidence signals:

- Multiple writers/readers of globals, singletons, registries, shared caches, files, or database tables.
- Hidden coordination through process-wide state or mutable configuration.
- Correctness depends on update order or implicit shared-state invariants.

Require at least two participating modules and identify readers/writers. Immutable constants, dependency-injected objects, or a database accessed solely through its owning service are not sufficient.

Recommendations: establish ownership, encapsulate mutations, make data immutable, pass explicit dependencies, publish events, or separate schemas where autonomy warrants it.

### External coupling

Definition: modules communicate through globally shared integration data limited to what the integration needs.

Evidence signals:

- Shared integration records, files, buffers, protocol fields, message payloads, or external schemas used specifically for communication.
- Both sides depend on an externally imposed representation but do not share broader mutable domain state.

Do not confuse this source-derived definition with every dependency on a third-party system. Show the shared integration data and how each side uses it.

Recommendations: version the format, validate at boundaries, define ownership and compatibility policy, isolate it behind adapters, and test consumers against the contract.

### Control coupling

Definition: one module passes flags, commands, options, or mode values that tell another how to execute internally.

Evidence signals:

- Boolean or enum parameters select algorithms, branches, side effects, ordering, or workflow stages.
- Callers know a callee's internal modes and orchestrate its implementation steps.

Require evidence that the value controls *how* work is performed. A value expressing domain intent, such as an order status, is not automatically control coupling.

Recommendations: replace ambiguous flags with intention-revealing operations or strategies, move orchestration to the responsible module, or model distinct commands explicitly.

### Stamp coupling

Definition: a module receives a structure that exposes implementation details and contains more information than it needs.

Evidence signals:

- Passing a domain entity, ORM object, request context, broad configuration, or large DTO when only a few fields are read.
- Consumers become sensitive to the shape or lifecycle of an owner's internal model.

Show the passed structure and the exact fields consumed. Passing a cohesive value object whose semantics matter as a whole is not necessarily stamp coupling.

Recommendations: pass a narrow value or integration DTO, define a consumer-specific projection, or expose a behavior instead of data.

### Data coupling — weakest

Definition: modules exchange only the minimum integration data required, without sharing business logic.

Evidence signals:

- Small, explicit parameters or narrow immutable values.
- The consumer needs all transmitted fields and does not know the producer's internal representation or rules.

Confirm minimality and semantic clarity. Excessive primitive parameters can produce primitive obsession even when they qualify as data coupling.

Recommendations: usually retain; add a cohesive value object if it clarifies invariants without leaking a broader model.

## Detection guide: Integration Strength

### Intrusive coupling — strongest

Definition: an integration depends on implementation details not intended for integration.

Evidence signals: private storage access, internal APIs, undocumented message fields, internal object representations, shared implementation libraries, or coordinated release requirements caused by internals.

Require proof that the detail is not an intended contract. Recommend a supported contract, adapter, ownership boundary, or consolidation when the components cannot vary independently in practice.

### Functional coupling

Definition: components implement closely related functionality or business logic, so a change to a rule requires coordinated changes.

Evidence signals:

- The same calculation, validation, policy, workflow, or state transition appears across components.
- One component's output semantics require another to reproduce or anticipate the same rule.
- Tests or releases must change together when a business rule changes.

Textual similarity alone is insufficient. Establish shared business meaning and a real change dependency. Similar utility code or coincidentally similar validation may be independent.

Recommendations: assign rule ownership, colocate strongly cohesive behavior, call the owner, publish authoritative outcomes, or consciously duplicate stable logic with conformance tests when runtime independence matters.

### Model coupling

Definition: components share a model of the business domain.

Evidence signals:

- Shared domain entities, value objects, schemas, terminology, identifiers, or lifecycle assumptions.
- Consumers depend on fields and relationships beyond the immediate integration need.
- A shared model package or canonical enterprise schema shapes multiple internal designs.

A shared name is not enough; show shared semantics or structure. Do not label a deliberately narrow integration DTO as model coupling.

Recommendations: narrow the shared model, translate through an anti-corruption layer, split bounded contexts, or retain it when shared semantics and coordinated evolution are intentional.

### Contract coupling — weakest

Definition: components communicate through an integration-specific model or contract.

Evidence signals:

- Versioned API DTOs, event schemas, commands, protocol definitions, or narrow interfaces designed for the boundary.
- Internal models are translated to and from the contract.
- Compatibility can be managed without exposing domain implementation details.

A type named `DTO` or `Contract` is not sufficient. Verify that it is boundary-specific and does not simply mirror a broad internal model.

Recommendations: usually retain; clarify ownership, versioning, compatibility, validation, deprecation, and consumer-driven or schema contract tests.

## Confidence levels

Assign one confidence level per classification:

- **High**: direct evidence shows both sides of the boundary, the knowledge exchanged, and the change dependency; plausible alternatives were checked.
- **Medium**: strong direct evidence exists on one side plus corroborating schema, tests, or call sites, but runtime behavior or ownership remains partly inferred.
- **Low**: classification relies on naming, static references, incomplete code, generated behavior, or an unverified architectural assumption.

Do not present low-confidence items as definitive findings. Put speculative leads in a separate “Needs verification” section.

## Severity

Rate practical risk independently from coupling strength:

- **Critical**: likely catastrophic integrity, security, availability, or organization-wide change impact with weak safeguards.
- **High**: frequent coordinated changes, large blast radius, cross-team/deployment lockstep, or substantial defect risk.
- **Medium**: meaningful maintenance or test cost with bounded impact or workable mitigations.
- **Low**: localized cost, stable dependency, intentional tradeoff, or strong safeguards.
- **Informational**: acceptable or beneficial coupling worth documenting; no change presently justified.

Explain the rating. Never derive severity from taxonomy order alone.

## Evidence requirements

For every reported finding:

1. Cite at least one exact file and line for the coupling mechanism.
2. Cite the other side of the boundary or shared resource when available.
3. Quote or paraphrase only the minimum code needed to explain the evidence.
4. Identify whether evidence is production, test, generated, configuration, schema, or documentation.
5. State what remains unverified, especially for reflection, dependency injection, plugins, runtime configuration, database behavior, or remote consumers.

Use repository-relative `path/to/file.ext:line` references in the report. Prefer tight ranges such as `:42-49`; avoid file-only citations. If reliable line numbers cannot be obtained, mark the item “lead only” and do not count it as confirmed.

## Output format

Produce this structure:

```markdown
# Coupling Analysis

## Scope and coverage
- Repository/revision:
- Included:
- Excluded or inaccessible:
- Boundary assumptions:

## Executive summary
- Confirmed findings by taxonomy and severity
- Dominant risks and intentional tradeoffs
- Coverage caveat: absence of evidence is not evidence of absence

## Findings
### [F-01] Short finding title
- Boundary: `Component A` → `Component B`
- Structured Design: `type` or `not classified` — confidence
- Integration Strength: `type` or `not classified` — confidence
- Severity: level
- Evidence:
  - `path/file.ext:line-line` — observed fact
  - `path/other.ext:line-line` — observed fact
- Reasoning: why the evidence satisfies each classification
- Impact: concrete change, runtime, testing, or ownership cost
- Counterevidence / false-positive checks:
- Recommendation: smallest practical improvement or “retain”
- Verification: tests, owners, runtime traces, or consumers to check

## Needs verification
| Lead | Possible type | Confidence | Missing evidence | How to verify |

## Positive patterns
- Well-balanced data or contract coupling with evidence

## Prioritized recommendations
1. Action — affected findings — expected benefit — tradeoff

## Coverage limits
- Uninspected paths, dynamic behavior, remote systems, and analysis limitations
```

Order findings by severity, then confidence. Include positive examples of data or contract coupling so the report does not imply that all coupling is harmful. If no findings meet the evidence threshold, say so and list coverage and verification steps; never conclude that the codebase has no coupling.

## Recommendation principles

- Preserve useful cohesion; do not split collaborating behavior merely to lower a label.
- Target volatility and costly coordination first.
- Prefer clear ownership and explicit contracts over indirection for its own sake.
- Avoid replacing synchronous calls with messaging unless the operational tradeoffs are justified.
- Avoid broad shared libraries that merely move functional or model coupling into a dependency.
- Pair boundary changes with characterization, contract, migration, and compatibility tests.
- When retaining strong coupling, document why it is intentional and what conditions should trigger reevaluation.
