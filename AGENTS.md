# Agent Guide: Dotfiles Repository

This macOS and Linux dotfiles repository uses chezmoi. Target state lives under
`home/`, selected by `.chezmoiroot`; repository files outside `home/` are never
applied to `$HOME`.

## Workflow

- Use native chezmoi commands for files: `chezmoi --source="$PWD" diff`,
  `apply`, and `verify` from this checkout. The source flag avoids another clone.
- Use `make sync` to apply files, reconcile tools and locked local dependencies,
  generate completions, and verify files. Use `make upgrade` for explicit upgrades.
- Use `refresh_dotfiles --sync` for clean-tree, fast-forward pull plus sync;
  plain `refresh_dotfiles` only pulls/applies files and may leave dependencies stale.
- Run `make test` before completion; it must not provision the host or use live
  credentials. Provisioning targets reject alternate `TARGET_DIR` destinations.
- Import intentional target-side files with `chezmoi add "$HOME/path"` or
  `chezmoi re-add "$HOME/path"` (select this source when needed); inspect the diff.
- Read README.md's Everyday workflow before changing orchestration or its safety
  boundaries; it defines sync/upgrade/removal semantics and isolated rendering.

Chezmoi source names encode target attributes. Leading `dot_` creates a dotfile,
`executable_` sets executable bits, `empty_` preserves an empty file, and
`literal_` escapes a reserved source prefix. Use `chezmoi source-path` and
`chezmoi target-path` instead of guessing a non-obvious mapping.

Preserve mutable application state by keeping directories non-`exact_` unless a
reviewed requirement says unmanaged children must be deleted. Keep plaintext
credentials out of source state. `~/.pi/agent/auth.json` is generated and
unmanaged; only its 1Password reference file is tracked.

## Locations

- Shell config: `home/dot_zshrc.tmpl`
- Executable scripts: `home/dot_local/bin/executable_*`
- Pi config: `home/dot_pi/agent/`; local software and Pi packages: `packages/`
- Cross-agent skills: `home/dot_agents/skills/`
- Chezmoi special files: `home/.chezmoi*`

When adding an executable script, include a shebang, useful `--help` output, and
executable source attributes; then apply and verify the installed target.

`Brewfile` owns cross-platform packages and guards macOS-only applications with
`OS.mac?`. Chezmoi templates and `.chezmoiignore` own target differences; keep
macOS output stable when adding Linux branches. Mise owns language runtimes and
standalone development tools. `make setup` bootstraps Homebrew/chezmoi, runs sync,
configures GitHub CLI, and resolves Pi credentials. With `NONINTERACTIVE=1`, it
leaves Pi credential resolution for an explicit later `make pi-auth`. Keep auth and package
cleanup explicit; ordinary chezmoi apply remains file-only (apart from externals).
