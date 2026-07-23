# Advanced Networking and Access

Read this reference for local filesystem mounts, CI authentication, port conflicts, or target/context debugging.

## SSHFS mount

Use SSHFS only when local-editor access is worth installing an SSH server. Prefer `sprite exec`, `console`, `--file`, or direct Git operations otherwise.

Inside the Sprite:

```bash
sprite exec -o <org> -s <sprite> -- sudo apt-get install -y openssh-server
sprite exec -o <org> -s <sprite> -- mkdir -p /home/sprite/.ssh
cat ~/.ssh/id_ed25519.pub | \
  sprite exec -o <org> -s <sprite> -- tee -a /home/sprite/.ssh/authorized_keys
```

Register `sshd` as a Service so it returns after cold wake:

```bash
sprite exec -o <org> -s <sprite> -- \
  sprite-env services create sshd --cmd /usr/sbin/sshd
```

Mount through the Sprite proxy without reserving a fixed local port:

```bash
mkdir -p /tmp/sprite-mount
sshfs -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3 \
  -o 'ProxyCommand=sprite proxy -o <org> -s %h -W :22' \
  sprite@<sprite>: /tmp/sprite-mount
```

Unmount when done:

```bash
umount /tmp/sprite-mount
# macOS fallback: diskutil unmount /tmp/sprite-mount
```

## Port conflicts

`exec` may automatically forward ports opened by its process. Before starting a separate proxy:

```bash
lsof -nP -iTCP:<local-port> -sTCP:LISTEN
sprite sessions list -o <org> -s <sprite>
```

Then stop the conflicting exec/proxy, use `--no-port-forward` when the installed CLI supports it, or map a different local port:

```bash
sprite proxy -o <org> -s <sprite> 3001:3000
```

## Authentication and CI

Interactive authentication:

```bash
sprite org auth
sprite org list
```

Non-interactive CI authentication:

```bash
sprite auth setup --token "$SPRITES_TOKEN"
```

Store tokens in the CI secret manager. Keep keyring storage enabled for interactive use. Do not print, commit, or transfer token-bearing CLI configuration.

## Local context and wrong-target debugging

`sprite use` creates a project-local `.sprite` file containing the organization and Sprite selection. Add it to `.gitignore`; it is user-specific.

When behavior suggests the wrong target, bypass context:

```bash
sprite org list
sprite list -o <org>
sprite info -o <org> -s <sprite>
sprite exec -o <org> -s <sprite> -- hostname
```

Useful configuration locations and overrides:

- `~/.sprites/sprites.json` — CLI-managed global configuration; format may change.
- `.sprite` — local organization/Sprite selection.
- `SPRITE_TOKEN` — legacy token override.
- `SPRITE_URL` — direct Sprite URL override for development.
- `SPRITES_API_URL` — API endpoint override.

Inspect values only when diagnosing authentication or endpoint selection, and redact credentials from output.