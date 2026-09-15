---
name: gob
description: Manage long-running or background processes with gob. Use for development servers, watchers, lengthy builds or tests, and commands that must keep running while the agent continues working.
---

# Background Processes with `gob`

Use `gob` when a process must outlive one ordinary shell call. Gob gives the user and agent a shared view of jobs, logs, ports, and lifecycle state.

## Select gob deliberately

Use gob for:

- development servers and file watchers;
- lengthy builds, test suites, installs, or native tooling;
- independent long-running commands started in parallel;
- processes the user may inspect or keep using after the current turn.

Run quick commands directly, including `git status`, focused tests, file operations, and short CLI queries. Use `gob add` instead of `&`, `nohup`, or an unmanaged background process.

## Pass an executable and arguments

Gob receives an executable plus its arguments. It does not implicitly evaluate shell syntax such as environment assignments, pipes, redirects, `&&`, globs, or `$VAR` expansion.

Use `--` to make the command boundary explicit:

```bash
gob add -- npm run dev
gob run -- make build
```

Pass environment variables through `env`:

```bash
gob add -- env APP_VARIANT=development npx expo start --dev-client
```

Invoke a shell only when shell behavior is required:

```bash
gob run -- bash -lc 'npm test && npm run typecheck'
gob add -- bash -lc 'command-a | command-b'
```

A quoted command string can work, but it does not turn environment-assignment syntax into an executable. Prefer explicit argv, `env`, or `bash -lc` as appropriate.

## Choose the lifecycle

### Bounded long-running work

Use `gob run` when the result is required before proceeding:

```bash
gob run --description "Production build" -- npm run build
```

`gob run` waits, suppresses successful output, and dumps output on failure. When live output is useful, start the job and await its opaque ID:

```bash
gob add --description "iOS test suite" -- npm run test:ios
gob await <job-id>
```

`gob await` streams output and returns the job's exit code.

### Persistent processes

Use `gob add` when the process should continue while other work proceeds:

```bash
gob add --description "Astro dev server on port 4321" -- npm run dev
```

Retain the returned job ID. For a server, use one bounded, command-specific readiness check such as an HTTP health request or expected port. Inspect logs if readiness fails rather than repeatedly sleeping and dumping them.

```bash
gob ports <job-id>
gob logs <job-id>
```

### Parallel work

Start independent jobs first, retain each returned ID, then await each explicitly:

```bash
gob add --description "Lint" -- npm run lint
gob add --description "Typecheck" -- npm run typecheck
gob await <lint-job-id>
gob await <typecheck-job-id>
```

## Inspect and control jobs

```bash
gob list                 # jobs in the current directory
gob list --all           # jobs across directories
gob logs <job-id>        # stdout and stderr
gob logs -f <job-id>     # follow both streams
gob stdout <job-id>      # raw stdout for piping
gob stderr <job-id>      # raw stderr for piping
gob ports <job-id>       # listening ports in the process tree
gob restart <job-id>
gob stop <job-id>        # graceful SIGTERM
gob stop --force <job-id>
gob remove <job-id>      # stopped jobs only
```

Jobs are scoped to the working directory by default. Treat job IDs as opaque values; obtain them from command output or `gob list` rather than assuming their length or format.

## Recover from a suspected stall

`gob run` or `gob await` may return early when Gob detects a potentially stuck job; the underlying job keeps running. Treat this as an observation boundary:

1. Inspect `gob logs <job-id>` and any command-specific health signal.
2. If useful work continues, call `gob await <job-id>` again when its result is needed.
3. If the process is truly stuck, stop it deliberately.

Confirm the job's status and exit code before treating it as complete.

## Handoff and cleanup

Before finishing:

- stop and remove temporary jobs owned by the task when they are no longer useful;
- leave user-requested servers or watchers running;
- report every intentionally retained job with its ID, purpose, working directory, and relevant URL or port.

Use `gob help <command>` for details instead of relying on cached command syntax.
