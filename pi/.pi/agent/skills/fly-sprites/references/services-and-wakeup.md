# Services and Wake-Up Behavior

Use this file when the user wants a web server, API, worker, or other process to keep coming back after the Sprite sleeps.

## Mental Model

Sprites preserve disk, not RAM.

That means:
- Files and installed packages persist.
- Normal processes started with `sprite exec` or `sprite console` stop when the Sprite goes idle.
- HTTP requests wake the Sprite again.

If the user needs a server to be available after wake-up, prefer a service instead of a plain foreground process.

## Documented Service Pattern

The docs describe `sprite-env services create`:

```bash
sprite-env services create my-server --cmd node --args server.js
```

Use this for apps that should restart when the Sprite wakes.

## Verification Step

Because `sprite-env` was documented in the web docs but not surfaced by the local `sprite --help`, verify availability before building a workflow around it.

Suggested checks:

```bash
sprite exec command -v sprite-env
sprite exec sprite-env --help
```

If `sprite-env` is unavailable, explain that the docs reference a service mechanism that may be version-specific or preinstalled only in certain environments.

## Recommended Workflow for Wake-Safe HTTP Apps

1. Confirm the app listens on a known port, usually `8080`.
2. Verify whether `sprite-env` exists.
3. Create the service if available.
4. Check the Sprite URL with `sprite url`.
5. Keep the URL private unless the user asks for public access.

## Important Caveat

A process launched with plain `sprite exec python -m http.server 8080` is good for a quick demo, not for reliable wake/restart behavior.

Use a service for:
- webhooks
- demo apps
- long-lived preview servers
- APIs expected to survive Sprite sleep/wake cycles

## Version-Sensitive Session Note

The docs mention detachable TTY sessions, but the local CLI help used for this skill did not list dedicated `sprite sessions` commands.

If the user wants a long-running interactive process, verify the installed CLI first:

```bash
sprite console --help
sprite exec --help
```

Do not promise session management subcommands unless they are confirmed live.
