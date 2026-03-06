# Advanced Access

Use this file only for less-common access patterns: SSHFS mounting, local editor integration, and environment/config overrides.

## Optional SSHFS Mounting

Use this only when the user explicitly wants local-editor access to the Sprite filesystem. It is more invasive than `sprite exec`, `sprite console`, or `sprite proxy`.

High-level workflow:

1. Install an SSH server inside the Sprite.
2. Start it via the documented service mechanism.
3. Forward a local port to Sprite port 22.
4. Mount the Sprite with `sshfs`.

Documented commands:

```bash
sprite exec sudo apt install -y openssh-server
sprite proxy 2000:22
sshfs -o reconnect,ServerAliveInterval=15,ServerAliveCountMax=3 \
  "sprite@localhost:" -p 2000 /tmp/sprite-mount
```

Unmount when done and stop the proxy.

## Port Conflict Handling

If a local port is already in use:

```bash
lsof -i :3000
```

Then either choose a different local port or stop the conflicting process.

## Environment and Context Files

Useful environment variables from the CLI reference:

- `SPRITE_TOKEN`
- `SPRITE_URL`
- `SPRITES_API_URL`

Useful local context file:

- `.sprite` for selected org and Sprite in the current project

Reach for these only when debugging selection/auth issues or integrating Sprite commands into scripts.
