# Personal worktree setup hooks

`herdr-codex-worktree` looks in this directory after it creates and verifies a
Herdr worktree, but before it starts Codex. The hook is optional.

To configure one repository, create an executable file whose path is the
repository's normalized `origin` URL without a protocol, user, or `.git`
suffix. For example:

```text
~/.config/herdr/worktree-setup/github.com/kcardoso/dotfiles
```

When managing a hook through these dotfiles, the corresponding chezmoi source
path is `home/dot_config/herdr/worktree-setup/github.com/kcardoso/executable_dotfiles`.

The helper also supports `default` as an executable fallback when no
repository-specific hook exists. Set `HERDR_WORKTREE_SETUP_DIR` to use a
different directory for one invocation.

Hooks receive three positional arguments:

1. Absolute path to the new worktree.
2. Requested branch/session name.
3. Normalized repository ID, which can be empty when `origin` is unavailable.

The helper waits for the hook to exit successfully. A failing hook prevents
Codex from starting, so hooks should be idempotent and use `set -euo pipefail`.
They should explicitly `cd "$1"` before running project commands.
