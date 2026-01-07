# Ralph-Pi: Ralph-Style Loops with the pi Agent

> "That's the beauty of Ralph - the technique is deterministically bad in an undeterministic world."

Ralph-Pi implements the [Ralph technique](https://ghuntley.com/ralph/) as an infinite agent loop using the pi agent.

## What is Ralph?

Ralph is a technique for continuous AI-driven development. In its purest form, it's a simple Bash loop:

```bash
while :; do cat PROMPT.md | npx --yes @sourcegraph/amp ; done
```

The agent reads a prompt file, performs work, and the loop continues. You "tune Ralph" by updating the prompt file with signs and directions that guide the agent's behavior in subsequent iterations.

## Installation

The script is installed via your dotfiles stow setup. After running `make stow`, it will be available at:

```bash
~/.local/bin/ralph-pi
```

## Quick Start

1. Create a `PROMPT.md` file in your project directory:

```markdown
# Build a Todo App

## Instructions
1. Create the project structure
2. Implement the core features
3. Add tests
4. Update this file as you progress
```

2. Run Ralph-Pi:

```bash
ralph-pi PROMPT.md
```

3. Watch the agent work! Stop anytime with `Ctrl+C`.

## Usage

```bash
ralph-pi [prompt_file]              # Loop with PROMPT.md (default)
ralph-pi PROMPT.md                   # Explicit file
ralph-pi -p PROMPT.md                # Single iteration (non-interactive)
ralph-pi --model claude-sonnet-4     # Use specific model
ralph-pi --thinking high             # Set thinking level
ralph-pi -d 2.0                      # 2 second delay between iterations
ralph-pi -m 10                       # Maximum 10 iterations
ralph-pi --pi-args="--continue"      # Pass args to pi (continue session)
```

### Options

| Option | Description |
|--------|-------------|
| `prompt_file` | Path to prompt file (default: PROMPT.md) |
| `-p, --print` | Non-interactive mode: run once and exit |
| `--pi-args` | Additional arguments to pass to pi |
| `-d, --delay` | Delay between iterations in seconds (default: 1.0) |
| `-m, --max-iterations` | Maximum number of iterations (default: unlimited) |
| `-o, --output-dir` | Directory for iteration logs (default: ~/.pi/ralph-logs) |
| `--model` | Model to use (e.g., 'claude-sonnet-4') |
| `--thinking` | Thinking level: off, minimal, low, medium, high, xhigh |

## PROMPT.md Format

The prompt file is the brain of your Ralph loop. It should contain:

1. **Task Description** - What needs to be done
2. **Instructions** - How to approach the work
3. **Context** - Background information
4. **Progress Log** - Track completion (optional)

### Example

```markdown
# Task: Create a REST API

## Instructions
- Read the project structure first
- Identify what already exists
- Build features incrementally
- Update this file after each task

## Context
This is a new project. Use Express.js with TypeScript.

## Progress
- [x] Initialize project
- [x] Set up TypeScript
- [ ] Create routes
- [ ] Add database layer
- [ ] Write tests
```

## Tuning Ralph

The key to success with Ralph is "tuning" - adjusting the prompt file based on what you observe:

1. **Watch** what the agent does
2. **Identify** patterns or issues
3. **Add signs** to PROMPT.md (directions that guide behavior)
4. **Refine** instructions based on results

### Example of Tuning

**Before** (agent makes mistakes):
```markdown
Build the API.
```

**After** (adding signs):
```markdown
Build the API.

IMPORTANT: Always run tests before committing changes.
- Check types with `npm run type-check`
- Run lint with `npm run lint`
- Test with `npm test`
```

## Logs

Each iteration is logged to `~/.pi/ralph-logs/iteration_XXXX.jsonl`. You can review what happened:

```bash
ls ~/.pi/ralph-logs/
cat ~/.pi/ralph-logs/iteration_0001.jsonl | jq
```

## How It Works

Ralph-Pi communicates with the pi agent via RPC mode:

1. Starts `pi --mode rpc --no-session`
2. Reads your PROMPT.md file
3. Sends it as a prompt to pi
4. Streams the agent's response in real-time
5. Waits for the turn to complete
6. Logs the iteration
7. Repeats (until stopped)

## Tips

- **Start simple** - Begin with a clear, focused task
- **Iterate on the prompt** - Fine-tune instructions based on behavior
- **Be patient** - Ralph may stumble; that's part of the process
- **Use progress tracking** - Help the agent understand state
- **Check logs** - Review what happened each iteration

## Philosophy

Building software with Ralph requires faith and a belief in eventual consistency. Ralph will test you. Each time Ralph does something "bad," tune Ralph by adding signs to the prompt.

Eventually, all Ralph thinks about is the signs - that's when you get a new Ralph that doesn't feel defective at all.

## Resources

- [Ralph technique by Geoffrey Huntley](https://ghuntley.com/ralph/)
- [pi-coding-agent documentation](https://github.com/badlogic/pi-mono)
- [deliberate intentional practice](https://ghuntley.com/play)
- [LLMs are mirrors of operator skill](https://ghuntley.com/mirrors)
