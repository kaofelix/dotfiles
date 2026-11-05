# Space from remote

Press **Cmd+Shift+N**, or run `herdr-app do mod.open --name space-from-remote`.

Paste a GitHub or GitLab repository URL (https, ssh, `git@host:path`, or a link
to a branch or file) and press Enter. The mod clones it into `~/Code` with `gh`
or `glab` and opens a space there. The clone runs in the new space's terminal, so
progress, credential prompts and errors are visible; a failed clone leaves the
terminal open with the command to retry. If `~/Code/<name>` already holds that
repository, the mod switches to its space (or opens one) instead of cloning.

## Machine

The dropdown beside the input chooses where the space lives: this computer or another
machine from `hc machine ls` (offline ones are disabled). It starts on the machine
of the space you are looking at; click the dropdown (↑ ↓ Enter inside its list) or press **Ctrl+N / Ctrl+P** to change
it. Everything then runs on that machine: the host and CLI checks, the `~/Code`
folder (its own home, created if missing), and the clone itself, in a terminal of
the new space there.

A machine without the `gh`/`glab` CLI that the URL needs falls back to plain
`git clone`, using the pasted protocol (https or ssh) and a URL rebuilt from the
validated host and path.

## Which CLI

The host name is never hard-coded. For each host the mod asks, in order:

1. **The name.** A host containing `gitlab` uses `glab`; one containing `github`
   uses `gh`. A name containing both is treated as unknown.
2. **Which CLI is logged in there.** `glab auth status --hostname H` and
   `gh auth status --hostname H`; if exactly one succeeds, that CLI owns the host.
3. **The server.** GitLab answers `/api/v4/version` (200, or 401 without a
   token); GitHub Enterprise tags `/api/v3/` responses with `x-github-*` headers.

A logged-in CLI resolves the project path itself and uses your configured git
protocol. `glab` without a login falls back to the full https URL.

`model.js` holds the pure logic (parsing, detection, clone command) and is
covered by `tests/herdr-remote-space.test.ts`.

Source files are managed by chezmoi. From the dotfiles checkout, apply the mod and
its shortcut with:

```sh
chezmoi --source="$PWD" apply "$HOME/.config/herdr-app/mods/space-from-remote" "$HOME/.config/herdr-app/keys.json"
```
