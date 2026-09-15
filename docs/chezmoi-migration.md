# GNU Stow to chezmoi migration

## Scope and frozen baseline

The migration was performed only in the dedicated worktree
`/Users/kaofelix/dotfiles-chezmoi` on branch `migrate/chezmoi`. The original
worktree at `/Users/kaofelix/dotfiles` was not modified. Before restructuring,
its tracked modifications and non-ignored untracked files were copied into the
migration worktree and committed. That complete Stow state is frozen at commit
`36a12067652b708f07ba22f0c4ad74193468aa6a`, also recorded in
`.chezmoi-migration-baseline`.

The source moved from ten package-shaped trees to one declarative target tree
under `home/`:

- `.chezmoiroot` keeps repository-only files out of the target state.
- `dot_` encodes leading dots and `executable_` encodes executable targets.
- `empty_` preserves the one intentionally empty Python package marker.
- `literal_` protects a target filename beginning with chezmoi's reserved
  `create_` attribute.
- `.chezmoiversion` rejects older clients that may interpret this source state
  differently.
- `.chezmoiignore` excludes dependency/cache artifacts created inside source
  package directories during local testing.
- `.chezmoiexternal.toml` manages the third-party zgenom checkout.

Chezmoi's default ordinary-file mode is intentional. Retaining Stow-like
symlinks would preserve an implementation detail while giving up portable
permissions, templates, encryption, and atomic target updates. The physical
manifests therefore require Stow's links to resolve into the frozen source and
require zero links in chezmoi's managed file tree. Semantic manifests
dereference those implementation links and require exact equality of every
managed path, SHA-256 digest, size, and mode except the two installed usage
documents in `migration/expected-differences.json`. That narrow allowlist names
permitted fields and rationale; any other difference fails validation.

## Incremental checkpoints

| Checkpoint | Pattern exercised | Evidence | Result |
| --- | --- | --- | --- |
| `0b460db` | `zsh`: root dotfile plus nested XDG config | `docs/migration-evidence/01-zsh/` | 2 leaves; zero semantic differences; idempotent; verify passed |
| `a62cff6` | `bin`: executable attributes plus nested library files | `docs/migration-evidence/02-zsh-bin/` | 24 leaves; zero semantic differences; idempotent; verify passed |
| Full source | all ten former packages, reserved and empty names, all executable skills | `docs/migration-evidence/03-full/` | 678 leaves; two reviewed documentation differences; zero unexplained differences; idempotent; verify passed |

Each evidence directory contains machine-readable Stow and chezmoi semantic
manifests, physical manifests, and `comparison.json`. Temporary installation
roots are deliberately omitted; Stow link targets are normalized to
`<BASELINE_SOURCE>` so artifacts are reproducible and do not leak a temporary
path.

Run the comparison from any checkout containing the frozen Git object:

```sh
make test-migration
# or persist a fresh evidence set:
./scripts/validate-chezmoi-migration \
  --artifacts-dir docs/migration-evidence/03-full
```

The harness uses `mktemp`, explicit `--source`, `--destination`, `--config`,
`--cache`, and `--persistent-state` paths. It does not read or write the real
home, chezmoi config, cache, or state. Networked externals and scripts are
excluded from parity because they were not part of `make stow`; their
declarations are validated separately.

## Feature and best-practice review

This review targets chezmoi 2.72.2 and links to the current official
 documentation used for the decisions.

| Feature | Decision | Repository-specific rationale |
| --- | --- | --- |
| [Source subdirectory via `.chezmoiroot`](https://www.chezmoi.io/user-guide/advanced/customize-your-source-directory/) | **Adopted** | `home/` is an allowlist of target state. README, tests, Brewfile, and migration evidence need no fragile ignore list. |
| [Source attributes and target types](https://www.chezmoi.io/reference/target-types/) | **Adopted** | `dot_`, `executable_`, `empty_`, and `literal_` encode intent portably and preserve every baseline mode. |
| Default file mode instead of [symlink mode](https://www.chezmoi.io/user-guide/frequently-asked-questions/design/) | **Adopted** | Ordinary files are portable and atomically updated. Validation explicitly accounts for the only intentional physical difference from Stow. |
| [Minimum version declaration](https://www.chezmoi.io/reference/special-files/) | **Adopted** | `.chezmoiversion` prevents silently applying this source with an incompatible client. |
| [Externals](https://www.chezmoi.io/user-guide/include-files-from-elsewhere/) | **Adopted for zgenom** | Replaces the Makefile's hand-written clone-if-missing rule. A `git-repo` external matches zgenom's desired independent Git checkout and weekly refresh lifecycle. Large vendored agent skills remain first-party tracked state; making them externals would hide their contents from `diff`/`dump` and weaken reproducibility. |
| [Templates and machine data](https://www.chezmoi.io/user-guide/manage-machine-to-machine-differences/) | **Deferred until a real variation exists** | The repository explicitly targets one macOS setup and currently has no host-dependent values to prompt for. Adding identity or host templates now would invent inputs and make noninteractive bootstrap less reliable. `.zshrc.local` remains the documented untracked override boundary. |
| [`.chezmoiignore`](https://www.chezmoi.io/reference/special-files/chezmoiignore/) | **Adopted narrowly** | `.chezmoiroot` ensures only `home/` can become target state, while `.chezmoiignore` prevents local `node_modules`, Python caches, and Finder metadata created *inside* that tree from becoming targets. Runtime Pi/Herdr patterns are no longer needed because ordinary target files cannot write back through Stow links. Machine conditionals should be added only for genuine differences. |
| `exact_` directories | **Rejected for mutable application trees** | Pi, Herdr, and completion directories contain runtime state not owned by this repo. Exact directories would delete those unmanaged entries during apply, unlike Stow and contrary to behavior preservation. |
| `private_` files/directories | **Not applied to tracked references** | `auth.op.json` contains 1Password references, not plaintext credentials, and changing its mode would break byte/mode parity. The generated, untracked `auth.json` is already atomically written as `0600` by `pi-auth-setup`. New truly private managed targets should use `private_`. |
| [Password-manager template functions](https://www.chezmoi.io/user-guide/password-managers/1password/) | **Rejected for Pi `auth.json`** | Pi mutates the same file with OAuth credentials. A whole-file template would overwrite that state, while invoking secrets during normal source reads would create unnecessary 1Password coupling. The tested merge helper preserves OAuth entries, validates references without shell evaluation, avoids printing secrets, and is explicitly run by setup. |
| [Encryption](https://www.chezmoi.io/user-guide/encryption/) | **Not needed** | No plaintext secrets belong in source state. References are safe to track and generated plaintext stays unmanaged. Encryption should be introduced only if a future file truly must be versioned as ciphertext. |
| [`run_`, `run_once_`, and `run_onchange_` scripts](https://www.chezmoi.io/user-guide/use-scripts-to-perform-actions/) | **Rejected for package installs and secret generation** | Official guidance says scripts break the declarative model and must remain idempotent. Making ordinary `apply` upgrade Homebrew, install runtimes, or request secrets would be surprising and unsafe in validation. `make setup` and `make update` keep these explicit. |
| `create_` files | **Rejected for `.zshrc.local`** | Chezmoi would need to own initial contents while this file is intentionally optional, machine-local, and potentially secret. Documentation is sufficient and avoids creating an empty customization file everywhere. |
| `modify_` files | **Rejected currently** | All tracked targets are wholly owned configuration. Partial mutation adds ordering and merge complexity with no present mixed-ownership target. The Pi credential merger remains an explicit application operation rather than pretending `auth.json` is managed state. |
| [Removal declarations](https://www.chezmoi.io/user-guide/manage-different-types-of-file/) | **Use only for an explicit cleanup migration** | Automatically deleting files absent from source would differ from Stow and risks runtime state. There is currently no obsolete target that must be removed. |
| Config template (`.chezmoi.toml.tmpl`) | **Not needed** | No custom data or non-default config is required. Commands pass `--source` when operating from this clone, and normal `chezmoi init` records its source directory. Avoiding an empty config template keeps bootstrap noninteractive. |
| Automatic commit/push | **Rejected** | Explicit Git review is important for a configuration repository that includes agent code and security-sensitive references. `chezmoi re-add`, diff review, and normal Git commands are clearer. |
| Package manager integrations | **Keep Brewfile and mise** | Chezmoi's mechanism is scripts; it does not provide a more declarative package schema. Existing Brewfile and mise config remain the respective tools' native manifests, invoked explicitly by Make. |

The broader design follows chezmoi's documented [single source of
truth](https://www.chezmoi.io/user-guide/frequently-asked-questions/design/)
and [setup workflow](https://www.chezmoi.io/user-guide/setup/): inspect with
`chezmoi diff`, apply, verify, and use source control for transport and review.

## Operational changes

- `make apply`, `make diff`, and `make verify` replace package-level Stow
  targets. Partial application is available directly through chezmoi target
  arguments when needed.
- `make add TARGET=...` replaces Stow `--adopt` with an explicit chezmoi import.
- There is intentionally no `unstow`: chezmoi manages desired content rather
  than links. Removal must be an explicit reviewed target operation, not a
  broad source-and-destination destructive command.
- `make setup` installs chezmoi through Brew before applying. The apply creates
  the target files and zgenom external before commands use installed scripts.
- `make update` upgrades Brew/mise, reapplies source state (including eligible
  external refreshes), and regenerates completions.
- Existing tests now execute scripts from encoded source paths; setup commands
  execute the installed target paths. This tests source behavior without
  coupling unit tests to the real home.

## Expected differences and assumptions

1. **File representation:** all Stow-managed links become ordinary chezmoi
   files/directories. Effective modes are identical; physical manifests record
   this global type difference.
2. **Installed usage text:** `.local/bin/README-ralph.md` names `make apply`
   instead of `make stow`, and `.local/lib/pifind/README.md` names its encoded
   source path. Their byte/size changes are explicitly allowlisted; modes and
   every other managed file remain identical.
3. **zgenom lifecycle:** chezmoi now declares and periodically refreshes the
   clone instead of cloning only when absent. Its checkout was never part of
   the Stow package tree, so it is outside semantic parity.
4. **Repository runtime pollution:** application state can no longer flow back
   through links into this Git checkout. Stale Pi/Herdr runtime ignore rules
   were removed.
5. **Platform:** the configuration remains intentionally macOS-oriented. No
   unsupported Linux behavior was invented during a behavior-preserving
   migration.
6. **Fresh clone history:** the frozen baseline commit is an ancestor of the
   migration branch and therefore available to the validation harness after a
   normal clone of the completed history.
