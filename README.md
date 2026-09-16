# Kao Felix's Dotfiles

These macOS dotfiles are managed by [chezmoi](https://www.chezmoi.io/). The
repository uses `home/` as its chezmoi source state (selected by
[`.chezmoiroot`](.chezmoiroot)); files elsewhere in the repository are project
documentation, tests, or automation and are not copied into `$HOME`.

## New Mac

Add an SSH key to GitHub, install [Homebrew](https://brew.sh), then clone this
repository and run setup:

```sh
git clone git@github.com:kaofelix/dotfiles.git ~/.local/share/chezmoi
cd ~/.local/share/chezmoi
make setup
```

`make setup` installs the `Brewfile` (including chezmoi), applies the dotfiles,
installs mise tools, builds local dependencies and completions, configures the
GitHub CLI, and resolves Pi credentials. Chezmoi's external declaration clones
[zgenom](https://github.com/jandamm/zgenom) into `~/.zgenom`; zgenom then loads
Oh My Zsh and the configured plugins on first shell startup.

Before changing the real home directory, preview the target state:

```sh
make diff
make apply
make verify
```

## Existing Stow-managed Mac

Do not pull the chezmoi migration directly over a Stow checkout. Mutable Pi and
Herdr data may live below links into that checkout and become unreachable when
Git removes the old package directories. Instead, keep the old checkout in
place and fetch the new version into a temporary worktree:

```sh
cd ~/dotfiles
git status                         # must be clean
git fetch origin
git worktree add --detach ../dotfiles-chezmoi origin/main
```

Quit Pi, Herdr, and other programs writing below `~/.pi`, `~/.config/herdr`, or
`~/.local`, then run the adoption helper from the temporary worktree:

```sh
../dotfiles-chezmoi/scripts/adopt-from-stow \
  --stow-source "$HOME/dotfiles" \
  --chezmoi-source "$HOME/dotfiles-chezmoi" \
  --promote origin/main
```

The helper requires `chezmoi`, `git`, `python3`, and `stow`. It refuses a dirty
checkout, creates a private rollback snapshot and Git bundle, materializes only
links owned by the Stow checkout, unstows, restores mutable state, saves a
chezmoi preview for inspection, applies and verifies, and finally fast-forwards
the canonical checkout. It also configures chezmoi to use `~/dotfiles` and
moves ignored residue from former package directories into the rollback
folder. It prints that folder's path when complete; retain it for several days.

After the setup is stable, remove the temporary worktree:

```sh
git worktree remove ../dotfiles-chezmoi
```

Use `--backup-dir DIR` to select the rollback location, or `--yes` only after a
previously reviewed rehearsal. Run `scripts/adopt-from-stow --help` for all
options. If `git status` is not clean, first commit or manually reconcile those
machine-local source changes; the helper deliberately will not guess how to
translate them into the chezmoi layout.

Chezmoi writes ordinary files rather than Stow-style symlinks. Edit through
`chezmoi edit ~/.zshrc`, edit the encoded file in `home/` directly, or import an
intentional target-side change with `chezmoi re-add ~/.zshrc`. Add a new target
explicitly with `make add TARGET="$HOME/path"`. Review the source diff before
committing.

To update system packages and re-apply source state:

```sh
make update
```

## Pi credentials

`make setup` resolves the 1Password-backed provider entries from
`~/.pi/agent/auth.op.json` and merges their keys into Pi's unmanaged local
`auth.json`, preserving Pi-managed OAuth credentials. The generated file
contains plaintext secrets, is written with mode `0600`, and must not be
committed.

Regenerate it after rotating a key with `make pi-auth`. Verify references
without changing `auth.json` or printing values with:

```sh
pi-auth-setup --check
```

When more than one 1Password account is configured, set `OP_ACCOUNT` in the
unmanaged `~/.zshrc.local` file so tracked references remain
account-independent:

```sh
export OP_ACCOUNT="<account ID or shorthand>"
```

## Other configuration

Agent skills are installed at the cross-agent standard location
`~/.agents/skills/`.

Native macOS text bindings are installed at
`~/Library/KeyBindings/DefaultKeyBinding.dict`. Restart applications after
applying them. They extend native Emacs bindings with Option as Meta:

| Shortcut | Action |
| --- | --- |
| Control-Option-H | Delete previous word |
| Control-Option-D | Delete next word |
| Option-B / Option-F | Move backward / forward one word |

They apply only to applications using the native macOS text-binding system.
Caps Lock can be mapped to Control separately in System Settings.

Clone the Emacs configuration separately because it has its own lifecycle:

```sh
git clone git@github.com:kaofelix/kao-emacs-config.git ~/.emacs.d
```

## Validation

Run application tests and the isolated migration parity suite with:

```sh
make test
make test-migration
```

The migration suite never touches the real home directory. It checks out the
frozen Stow baseline into a temporary directory, Stows it into one temporary
home, applies the current chezmoi source into another, and compares every
managed file's path, bytes, and mode. It also records physical file types,
validates the intentional symlink-to-regular-file transition, applies twice,
runs `chezmoi verify`, and requires an empty post-apply diff. See
[`docs/chezmoi-migration.md`](docs/chezmoi-migration.md) for design decisions,
feature review, checkpoints, and evidence.
