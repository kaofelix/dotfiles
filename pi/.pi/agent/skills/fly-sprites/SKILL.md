---
name: fly-sprites
description: Operate Fly.io Sprites with the `sprite` CLI. Use for Sprite lifecycle; remote commands, files, and package installation; exec sessions or wake-safe services; HTTP URLs and port forwarding; checkpoints and restores; or troubleshooting target selection, authentication, lifecycle, networking, and storage.
---

# Fly.io Sprites

Treat a Sprite as a persistent Ubuntu machine that may pause between requests. Assume the CLI is installed and authenticated.

## Operating loop

### 1. Pin the target

Resolve the organization and Sprite before changing anything:

```bash
sprite org list
sprite list -o <org>
sprite info -o <org> -s <sprite>
```

Use explicit `-o <org> -s <sprite>` on operational commands. A local `.sprite` selection is convenient for human use, but explicit targeting prevents work in the wrong machine. If using `sprite use`, keep `.sprite` out of version control.

Completion criterion: exactly one organization and Sprite are identified, and state them before operating.

### 2. Choose the lifecycle

- **One-off command**: `sprite exec`
- **Interactive work**: `sprite console`
- **Detachable dev server or long build**: TTY exec session
- **Process that must return after warm/cold wake**: Sprite Service
- **Work that must prevent pausing while active**: Task hold

Read [`references/services-and-wakeup.md`](references/services-and-wakeup.md) whenever the request involves a server, bot, worker, webhook, scheduled work, wake-up, or keeping a Sprite running.

Completion criterion: the chosen lifecycle matches whether the process may pause and whether it must return after a cold wake.

### 3. Execute and verify

Pass `--` before the remote command so remote flags are not parsed as Sprite CLI flags:

```bash
sprite exec -o <org> -s <sprite> -- pwd
sprite exec -o <org> -s <sprite> --dir /home/sprite/app -- git status
sprite exec -o <org> -s <sprite> -- bash -lc 'command one && command two'
```

Prefer `--dir` and direct argv over a shell; use `bash -lc` only for pipes, redirects, expansion, or multiple commands.

Verify the actual outcome: exit status, process/service state, listening port, HTTP response, or persisted file. Report the target and any persistence, exposure, billing, or restore implications.

Completion criterion: the requested result is observed on the pinned target, not merely configured.

## Machine lifecycle

For non-interactive creation, prevent the CLI from entering a console:

```bash
sprite create -o <org> --skip-console <sprite>
sprite list -o <org>
sprite destroy -o <org> --force <sprite>
```

Destruction permanently deletes files, services, checkpoints, and the URL. Use `--force` only after the user explicitly requests deletion; it is required in non-interactive environments where the confirmation TTY is unavailable.

## Commands and files

Sprites use `/home/sprite` as the home directory and run Ubuntu 25.10. Common languages and development tools are preinstalled, including Node.js, Python, Go, Ruby, Rust, Elixir, Java, Bun, Deno, Git, curl, wget, and vim.

```bash
sprite exec -o <org> -s <sprite> --dir /home/sprite -- git clone <url>
sprite exec -o <org> -s <sprite> -- sudo apt-get update
sprite exec -o <org> -s <sprite> -- sudo apt-get install -y <package>
sprite exec -o <org> -s <sprite> --file ./local.env:/home/sprite/app/.env -- chmod 600 /home/sprite/app/.env
```

Use `--file <local:remote>` for uploads so secret file contents do not pass through command output. Inspect repository setup instructions before improvising around setup failures.

## Interactive and detachable sessions

```bash
sprite console -o <org> -s <sprite>
sprite exec -o <org> -s <sprite> --tty --dir /home/sprite/app -- npm run dev
# Detach with Ctrl+\
sprite sessions list -o <org> -s <sprite>
sprite sessions attach -o <org> -s <sprite> <id>
sprite sessions kill -o <org> -s <sprite> <id>
```

Sessions are for interactive or temporary work, not cold-wake recovery. Use a Service for that.

## HTTP URL and private ports

CLI releases are moving from `sprite url` to `sprite info` / `sprite config`. Prefer the newer commands when present; use `sprite url` on older releases.

```bash
sprite info -o <org> -s <sprite>
sprite config update -o <org> -s <sprite> --url-auth public
sprite config update -o <org> -s <sprite> --url-auth sprite

# Older CLI fallback
sprite url -o <org> -s <sprite>
sprite url update -o <org> -s <sprite> --auth public
```

Keep HTTP authentication at `sprite` unless the user explicitly wants public internet access. For databases and private development ports:

```bash
sprite proxy -o <org> -s <sprite> 5432
sprite proxy -o <org> -s <sprite> 3001:3000
```

`exec` auto-forwards ports opened by its command. If that conflicts with `sprite proxy`, stop the exec or rerun it with `--no-port-forward` if supported by the installed CLI. Read [`references/networking-and-access.md`](references/networking-and-access.md) for SSHFS, CI authentication, and context debugging.

## Checkpoints and restore

```bash
sprite checkpoint create -o <org> -s <sprite> --comment "before upgrade"
sprite checkpoint list -o <org> -s <sprite>
sprite checkpoint info -o <org> -s <sprite> <version>
sprite restore -o <org> -s <sprite> <version>
```

Checkpoint before risky upgrades, migrations, broad configuration changes, or destructive experiments. A checkpoint captures the filesystem, not running processes or in-memory state. Restore replaces the current filesystem and discards later changes.

## Version drift

The CLI and prose docs can differ. If a documented command fails, inspect the installed surface rather than guessing:

```bash
sprite --help
sprite <command> --help
sprite exec -o <org> -s <sprite> -- command --help
```

Installed CLI help wins for syntax; current Sprites docs win for lifecycle semantics.