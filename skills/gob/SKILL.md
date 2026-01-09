---
name: gob
description: Process manager for long-running background processes. Use when starting development servers, watching files, or running commands that need to continue in the background while agent continues working.
---

# gob

CLI process manager for long-running background processes. Provides a shared view of background jobs between you and the AI agent, with real-time log streaming.

## Core Commands

### Running Commands

- `gob run <cmd>` - Run command, wait for completion, stream output
  - Equivalent to `gob add` + `gob await`
  - Best for: builds, tests, any command where you need the result

- `gob add <cmd>` - Start background job, returns job ID immediately
  - Job continues running in background
  - Supports flags directly: `gob add npm run --flag`
  - Supports quoted strings: `gob add "make test"`

- `gob await <job_id>` - Wait for job to finish, stream output, return exit code
  - Use this to collect results from jobs started with `gob add`

### Sequential Execution

For commands that must complete before proceeding:

```bash
gob run make build
```

Or use add + await for more control:

```bash
gob add make build
gob await <job_id>
```

Use for: builds, installs, any command where you need the result.

### Parallel Execution

For independent commands, start all jobs first:

```bash
gob add npm run lint
gob add npm run typecheck
gob add npm test
```

Then collect results using either:

- `gob await <job_id>` - Wait for a specific job by ID
- `gob await-any` - Wait for whichever job finishes first (`--timeout` option)
- `gob await-all` - Wait for all jobs to complete (`--timeout` option)

Example with await-any:

```bash
gob await-any # Returns when first job finishes
gob await-any # Returns when second job finishes
gob await-any # Returns when third job finishes
```

Use for: linting + typechecking, running tests across packages, independent build steps.

### Job Monitoring

**Status:**
- `gob list` - List jobs with IDs and status

**Output:**
- `gob await <job_id>` - Wait for completion, stream output (preferred)
- `gob stdout <job_id>` - View stdout (`-f` for real-time following)
- `gob stderr <job_id>` - View stderr (`-f` for real-time following)

**Control:**
- `gob stop <job_id>` - Graceful stop (SIGTERM)
- `gob stop -f <job_id>` - Force kill (SIGKILL)
- `gob restart <job_id>` - Stop + start
- `gob remove <job_id>` - Remove stopped job

### When to Use gob

Use `gob` for:
- Development servers (e.g., `npm run dev`, `python manage.py runserver`)
- File watchers (e.g., `npm run watch`, `webpack --watch`)
- Build processes that run in the background
- Any long-running task that shouldn't block the agent
- Commands that need to output logs while you continue working

Do NOT use `&` to background processes - always use `gob add` instead.

### Examples

Good:
```bash
gob run make test              # Run and wait for completion
gob add npm run dev            # Start background server
gob await abc                  # Wait for specific job by ID
gob add timeout 30 make build  # Run with timeout
```

Bad:
```bash
make test                      # Missing gob prefix
npm run dev &                  # Never use & - use gob add instead
```

## Common Patterns

### Start a dev server and continue working
```bash
gob add npm run dev
# Job ID returned, agent continues...
```

### Start multiple background services
```bash
gob add npm run dev
gob add npm run api
gob add npm run worker
```

### Run tests in parallel across packages
```bash
gob add npm test -- --workspace=packages/a
gob add npm test -- --workspace=packages/b
gob add npm test -- --workspace=packages/c
gob await-all                  # Wait for all to complete
```

### Build and check results
```bash
gob run make build             # Waits for completion
```

### Inspect logs from running job
```bash
gob list                       # Get job ID
gob stdout abc                 # View output
gob stdout abc -f              # Follow in real-time
gob stderr abc -f              # Follow stderr in real-time
```

## Job IDs

Jobs are identified by short 3-character IDs (e.g., `abc`, `x7f`, `V3x`). Use `gob list` to see all jobs and their IDs.

Jobs are scoped to directories - you only see jobs in the current working directory.
