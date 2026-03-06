---
name: fly-sprites
description: Operate Fly.io Sprites via the `sprite` CLI as persistent remote Linux machines. Use when asked to create, list, select, inspect, use, or destroy a Sprite; run commands with `sprite exec`, open an interactive shell with `sprite console`, install packages, clone repos, edit files, serve or expose an app, check or change a Sprite URL, proxy ports, create/list/inspect/restore checkpoints, or troubleshoot common Sprite workflows including wake-up behavior, wrong target selection, auth, networking, and storage.
---

# Fly.io Sprites

Use this skill as the default operator guide for Fly.io Sprites. Assume the CLI is installed and authenticated.

## Mental Model

Treat a Sprite like a small persistent Linux machine:

- **Disk persists**: files, packages, repos, and on-disk state survive sleep.
- **RAM does not persist**: running processes and in-memory state do not survive idle.
- **HTTP can wake the Sprite**.
- **URLs stay private by default** unless the user explicitly wants public access.

## Top Commands

### Select a Sprite

```bash
sprite list
sprite ls
sprite use my-sprite
sprite -o my-org -s my-sprite exec pwd
```

Prefer local `.sprite` context when present. Use explicit `-o` and `-s` when the target is ambiguous.

### Create or destroy

```bash
sprite create my-sprite
sprite destroy my-sprite
```

Only destroy when the user explicitly wants permanent deletion.

### Run commands

Use `sprite exec` for one-off commands and automation:

```bash
sprite exec echo "hello"
sprite exec bash -c "cd /home/sprite && ls -la"
sprite x python3 --version
```

Use `sprite console` for interactive work:

```bash
sprite console
sprite c
```

### Work with files and tools

Good default paths:

- `/home/sprite` for user files and repos
- `/home/sprite/.local` for user-installed tools
- `/var` for app state and databases

```bash
sprite exec bash -c "echo 'hello from sprite' > /home/sprite/greeting.txt"
sprite exec cat /home/sprite/greeting.txt
sprite exec pip install requests
sprite exec npm install -g typescript
sprite exec cargo install ripgrep
sprite exec df -h
```

### Use the URL

```bash
sprite url
sprite url update --auth public
sprite url update --auth sprite
```

Keep URLs private unless the user explicitly wants public access.

### Proxy ports

```bash
sprite proxy 5432
sprite proxy 3001:3000
sprite proxy 3000 8080 5432
```

Use this for databases, dev servers, and other private ports.

### Checkpoint and restore

```bash
sprite checkpoint create
sprite checkpoint create --comment "before upgrade"
sprite checkpoint list
sprite checkpoint info <id>
sprite restore <id>
```

Create a checkpoint before risky upgrades, migrations, or destructive experiments.

## Common Tasks

### Run a command in the machine

```bash
sprite exec bash -c "cd /home/sprite/app && git status"
```

### Open an interactive shell

```bash
sprite console
```

### Serve a quick app

```bash
sprite url
sprite exec python -m http.server 8080
```

Use this for quick demos, not for apps that must reliably come back after sleep.

### Inspect machine state

```bash
sprite exec ps aux
sprite exec df -h
sprite exec free -h
```

### Check selection issues

```bash
sprite list
sprite use my-sprite
```

## Rules and Gotchas

- Filesystem changes persist; process state does not.
- Prefer `sprite exec` for scripted work and `sprite console` for exploration.
- Suggest a checkpoint before risky changes.
- Do not make a URL public unless the user asks.
- Verify exact flags with live help when unsure.

## Verify with Live Help

Start here:

```bash
sprite --help
```

Then inspect the exact command you are about to use:

```bash
sprite exec --help
sprite url --help
sprite checkpoint --help
```

## Advanced References

Read only when needed:

- **Wake-safe services / long-lived HTTP processes**: `references/services-and-wakeup.md`
- **Advanced access, SSHFS mounting, env vars**: `references/networking-and-access.md`

## Version-Sensitive Notes

This skill is based on the docs plus a live `sprite --help` run. If docs mention a command that local help does not show, verify before relying on it.

In particular:

- The docs mention detachable TTY sessions, but the local help used here did not list a `sessions` command.
- The docs mention `sprite-env services ...` for wake-safe services. Verify that `sprite-env` exists before depending on it.

## Output Expectations

When using this skill:

- State which Sprite and org you are targeting.
- Show concrete commands.
- Call out persistence, security, or restore implications when relevant.
- Mention when behavior is documented but should still be verified against local CLI help.
