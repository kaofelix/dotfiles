---
name: fly-sprites
description: Operate Fly.io Sprites via the `sprite` CLI as persistent remote Linux machines. Use when asked to create, list, select, inspect, use, or destroy a Sprite; run commands with `sprite exec`, open an interactive shell with `sprite console`, install packages, clone repos, edit files, serve or expose an app, check or change a Sprite URL, proxy ports, create/list/inspect/restore checkpoints, or troubleshoot common Sprite workflows including wake-up behavior, wrong target selection, auth, networking, and storage.
---

# Fly.io Sprites

Use this skill as the default operator guide for Fly.io Sprites. Assume the CLI is installed and authenticated.

Sprites are like on demand Linux VPSs running Ubuntu that can be created and destroyed when needed.

Home folder: `/home/sprite`

Some basic software comes pre installed:
- Languages: Node.js, Python, Go, Ruby, Rust, Elixir, Java, Bun, Deno
- Utilities: Git, curl, wget, vim, and common dev tools


## Commands

### Create or destroy

```bash
sprite create my-sprite
sprite destroy my-sprite
```

Only destroy when the user explicitly wants permanent deletion.

### Select a Sprite

```bash
sprite list
sprite use my-sprite
sprite -o my-org -s my-sprite exec pwd
```

Prefer local `.sprite` context when present. Use explicit `-o` and `-s` when the target is ambiguous.

### Run commands

Use `sprite exec` for one-off commands and automation:

```bash
sprite exec echo "hello"
sprite exec bash -c "cd /home/sprite && ls -la"
```

Use `sprite console` for interactive work:

```bash
sprite console
```


### URL

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

### Serve a quick app

```bash
sprite url
sprite exec python -m http.server 8080
```

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

## help

```bash
sprite --help
sprite exec --help
sprite url --help
sprite checkpoint --help
```

## Advanced References

Read only when needed:

- **Wake-safe services / long-lived HTTP processes**: `references/services-and-wakeup.md`
- **Advanced access, SSHFS mounting, env vars**: `references/networking-and-access.md`

## Output Expectations

When using this skill:

- State which Sprite and org you are targeting.
- Show concrete commands.
- Call out persistence, security, or restore implications when relevant.
