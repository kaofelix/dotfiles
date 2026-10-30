# Kao Felix's Dotfiles

These macOS and Linux dotfiles are managed by
[chezmoi](https://www.chezmoi.io/). The repository uses `home/` as its chezmoi
source state (selected by
[`.chezmoiroot`](.chezmoiroot)); files elsewhere in the repository are project
documentation, tests, automation, or local software and are not copied into
`$HOME`. Pi extensions and `pifind` run directly from `packages/` in this
checkout; setup installs their locked dependencies there.

## New machine

Add an SSH key to GitHub, clone this repository, and run setup:

```sh
git clone git@github.com:kaofelix/dotfiles.git ~/.local/share/chezmoi
cd ~/.local/share/chezmoi
make setup
```

`make setup` bootstraps Homebrew and chezmoi when necessary, runs `make sync`,
configures the GitHub CLI to use SSH, and resolves Pi credentials. Sync applies the dotfiles
before installing declared Homebrew/mise tools, installs locked local application
dependencies, generates completions, and verifies managed files.
Homebrew bootstrap on Debian/Ubuntu requires passwordless or interactive
`sudo`; other Linux distributions should install Homebrew and its prerequisites
first. Chezmoi omits native macOS key bindings and 1Password-specific Git/shell
settings on Linux.

For a headless Linux machine, skip interactive credential resolution and run
it later only if 1Password is configured:

```sh
NONINTERACTIVE=1 make setup
# Optional later:
make pi-auth
```

Chezmoi's external declaration clones
[zgenom](https://github.com/jandamm/zgenom) into `~/.zgenom`; zgenom then loads
Oh My Zsh and the configured plugins on first shell startup.

## Everyday workflow

Chezmoi owns files; Make orchestrates host provisioning and repository tests.
Run `make` for the command summary. The former Make aliases for file operations
and `make update` have been replaced by the commands below.

### Preview and apply files

From this checkout:

```sh
chezmoi --source="$PWD" diff
chezmoi --source="$PWD" apply
chezmoi --source="$PWD" verify
```

The explicit source selects this checkout, even if chezmoi is configured for a
different clone. When the configured source is already this checkout, ordinary
`chezmoi diff`, `chezmoi apply`, and `chezmoi verify` work from anywhere.
These file operations do not provision packages or resolve Pi credentials.
Chezmoi may fetch declared externals such as zgenom during apply.

Chezmoi writes ordinary files. Edit through `chezmoi edit ~/.zshrc`, edit the
encoded file in `home/` directly, or import an intentional target-side change
with `chezmoi re-add ~/.zshrc`. Add a new target explicitly with
`chezmoi add "$HOME/path"`. For these commands too, pass `--source` when working
with a checkout other than the configured one. Review the source diff before
committing.

### Reconcile the environment

```sh
make sync
```

Sync operates on the current checkout; it does not pull Git changes. In order it:

1. Applies the dotfiles, so mise reads the current manifest in `$HOME`.
2. Reconciles the Brewfile with `brew bundle install --no-upgrade`.
3. Installs configured mise tools with `mise install`.
4. Runs `npm ci` for the local applications under `packages/`.
5. Generates shell completions and runs `chezmoi verify`.

This does not request software upgrades, delete unused packages, configure GitHub
CLI state, or resolve credentials. It is **not a frozen-version operation**:
missing tools declared as `latest` must resolve a version, and Homebrew may
upgrade dependencies when required to install a missing package. Most tool
versions are intentionally floating; only local npm dependencies are lockfile-based.
A failure stops later stages; fix its cause and rerun sync. Completed package
operations are not rolled back.

### Pull repository changes

```sh
refresh_dotfiles          # fast-forward and apply files only
refresh_dotfiles --sync   # fast-forward, then make sync for application readiness
```

Both modes require a clean checkout and refuse divergent history; neither
stashes, rebases, nor commits local edits. The default files-only mode may leave
checkout-local application dependencies stale after a lockfile change. Use
`--sync` when updating application code/dependencies, and reload or restart Pi
when its packages change. The checkout must remain in place: installed Pi
settings and the pifind launcher refer directly to it.

Native `chezmoi update` is available, but its default pull uses autostash/rebase
rather than this repository's clean-tree/fast-forward policy.

### Upgrade software deliberately

```sh
make upgrade
```

Upgrade applies configuration first, refreshes Homebrew metadata, installs and
upgrades **Brewfile-declared** packages, and upgrades active mise tools within
their declared constraints. It then installs locked local dependencies,
regenerates completions, and verifies managed files. It does not pull the
repository, bump npm lockfiles, upgrade unrelated Homebrew packages, run
`mise upgrade --inactive`, or resolve credentials.

### Remove software deliberately

Removing an entry from `Brewfile` or the mise source manifest stops managing it;
it does not uninstall existing versions. Apply/sync the changed configuration
before upgrading. For intentional removal, inspect installed versions and use
an explicit `mise uninstall --all TOOL` or `brew uninstall PACKAGE`.

For broader cleanup, review `mise prune --dry-run` or `brew bundle cleanup`
(without `--force`) first. Project configurations and manually installed tools
may still need those packages. These targets never run unused-package pruning or
uninstall tools just because they were removed from a manifest. Package managers
may still clean up superseded versions as part of their normal install/upgrade
behavior.

### Completion generation and verification boundaries

The mise postinstall hook keeps completions fresh for ad hoc tool installations.
Provisioning also runs a final `misecompsync` pass after tools are ready, even if
nothing new was installed. To regenerate manually: `mise exec -- misecompsync`.

`chezmoi verify` checks managed filesystem state, not package inventory,
credential validity, application health, or generated completion contents.
`make test` validates repository behavior separately. Shell/plugin initialization
and Pi's Python-environment bootstrap also have their own application lifecycles.

Alternate destinations are for **file rendering**, not host provisioning:

```sh
preview=$(mktemp -d)
chezmoi --source="$PWD" --destination="$preview" apply
```

That command redirects file writes, but is not a complete sandbox: chezmoi config,
cache, and persistent state still use their normal locations, and externals may
use the network. See `tests/platform-rendering.test.sh` for isolated config,
cache, state, and external-exclusion flags. Provisioning targets reject
`TARGET_DIR`; they operate on the host and cannot provision a fake home safely.

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

Install [Herdr.app](https://herdr.dev/docs/install/) manually.

Clone the Emacs configuration separately because it has its own lifecycle:

```sh
git clone git@github.com:kaofelix/kao-emacs-config.git ~/.emacs.d
```

## Validation

Run the application tests with:

```sh
make test
```

Tests cover workflow ordering and failure propagation with fake package-manager
boundaries, real local Git refresh safety, isolated macOS/Linux chezmoi rendering
and verification, and the application suites/type checks. They install checkout-local
test dependencies but do not apply live dotfiles, install host tools, or access
real credentials. Run them with the existing Node.js, Bun, Python 3, jq, and
chezmoi tools available; `make test` does not run setup or sync for you.

Preview and validate managed target state separately with `chezmoi diff` and
`chezmoi verify` (add `--source="$PWD"` to select this checkout explicitly).
