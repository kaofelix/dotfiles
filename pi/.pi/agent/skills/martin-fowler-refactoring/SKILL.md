---
name: martin-fowler-refactoring
description: Guide for systematic code refactoring using Martin Fowler's catalog of code smells and refactorings. Use when refactoring existing code, improving code structure, identifying code smells, or proposing and implementing specific refactorings.
---

# Martin Fowler Refactoring Guide

## Workflow

1. **Analyze** - Examine the code for code smells from the table below
2. **List** - Document code sections exhibiting specific smells
3. **Propose** - Suggest concrete refactorings with before/after examples
4. **Implement** - Execute the refactorings after human approval

## Code Smells to Refactorings

| Code Smell | Primary Refactorings |
|------------|---------------------|
| **Mysterious Name** | Rename Function, Rename Variable, Rename Field, Change Function Declaration |
| **Duplicated Code** | Extract Function, Slide Statements, Pull Up Method |
| **Long Function** | Extract Function, Replace Temp with Query, Decompose Conditional, Replace Conditional with Polymorphism, Replace Loop with Pipeline |
| **Long Parameter List** | Replace Parameter with Query, Preserve Whole Object, Introduce Parameter Object, Remove Flag Argument, Combine Functions into Class |
| **Global Data** | Encapsulate Variable |
| **Mutable Data** | Encapsulate Variable, Split Variable, Slide Statements, Separate Query from Modifier, Remove Setting Method, Replace Derived Variable with Query |
| **Divergent Change** | Split Phase, Move Function, Extract Class |
| **Shotgun Surgery** | Move Function, Move Field, Combine Functions into Class, Combine Functions into Transform, Inline Function |
| **Feature Envy** | Move Function, Extract Function |
| **Data Clumps** | Introduce Parameter Object, Preserve Whole Object, Extract Class |
| **Primitive Obsession** | Replace Primitive with Object, Replace Type Code with Subclasses, Replace Conditional with Polymorphism, Extract Class, Introduce Parameter Object |
| **Repeated Switches** | Replace Conditional with Polymorphism |
| **Loops** | Replace Loop with Pipeline |
| **Lazy Element** | Inline Function, Inline Class, Collapse Hierarchy |
| **Speculative Generality** | Collapse Hierarchy, Inline Function, Inline Class, Change Function Declaration, Remove Dead Code |
| **Temporary Field** | Extract Class, Move Function, Introduce Special Case |
| **Message Chains** | Hide Delegate, Extract Function, Move Function |
| **Middle Man** | Remove Middle Man, Inline Function, Replace Superclass with Delegate, Replace Subclass with Delegate |
| **Insider Trading** | Move Function, Move Field, Hide Delegate, Replace Subclass with Delegate, Replace Superclass with Delegate |
| **Large Class** | Extract Class, Extract Superclass, Replace Type Code with Subclasses, Replace Conditional with Polymorphism |
| **Alternative Classes with Different Interfaces** | Change Function Declaration, Move Function, Extract Superclass |
| **Data Class** | Encapsulate Record, Remove Setting Method, Move Function, Extract Function, Split Phase |
| **Refused Bequest** | Push Down Method, Push Down Field, Replace Subclass with Delegate, Replace Superclass with Delegate |
| **Comments** | Extract Function, Change Function Declaration, Introduce Assertion |

## Refactoring Categories

- **Composing Functions**: Extract Function, Inline Function, Extract Variable, Inline Variable, Change Function Declaration, Encapsulate Variable, Rename Variable, Introduce Parameter Object, Combine Functions into Class, Combine Functions into Transform, Split Phase, Preserve Whole Object

- **Encapsulation**: Encapsulate Record, Encapsulate Collection, Replace Primitive with Object, Replace Temp with Query, Extract Class, Inline Class, Hide Delegate, Remove Middle Man, Replace Subclass with Delegate, Replace Superclass with Delegate

- **Moving Features**: Move Function, Move Field, Move Statements into Function, Move Statements to Callers, Replace Inline Code with Function Call, Slide Statements, Split Loop, Replace Loop with Pipeline, Remove Dead Code

- **Organizing Data**: Split Variable, Rename Field, Replace Derived Variable with Query, Change Reference to Value, Change Value to Reference

- **Simplifying Conditionals**: Decompose Conditional, Consolidate Conditional Expression, Consolidate Duplicate Conditional Fragments, Remove Control Flag, Replace Nested Conditional with Guard Clauses, Replace Conditional with Polymorphism, Introduce Special Case, Introduce Assertion

- **Refactoring APIs**: Separate Query from Modifier, Parameterize Function, Remove Flag Argument, Replace Parameter with Query, Replace Query with Parameter, Remove Setting Method, Replace Constructor with Factory Function, Replace Function with Command, Replace Command with Function

- **Dealing with Inheritance**: Pull Up Method, Pull Up Field, Pull Up Constructor Body, Push Down Method, Push Down Field, Extract Subclass, Extract Superclass, Collapse Hierarchy, Replace Type Code with Subclasses, Remove Subclass, Replace Superclass with Delegate, Replace Subclass with Delegate
