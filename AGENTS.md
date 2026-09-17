# Agent Guide: Dotfiles Repository

This macOS and Linux dotfiles repository uses chezmoi. Target state lives under
`home/`, selected by `.chezmoiroot`; repository files outside `home/` are never
applied to `$HOME`.

## Workflow

- Preview target changes with `make diff`.
- Apply with `make apply`; verify with `make verify`.
- Run application tests with `make test`.
- Run isolated GNU Stow baseline parity, idempotence, and external smoke checks
  with `make test-migration`.
- Import an intentional target-side file with `make add TARGET="$HOME/path"` or
  `chezmoi re-add "$HOME/path"`; inspect the source diff before committing.

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
- Pi config/extensions: `home/dot_pi/agent/`
- Cross-agent skills: `home/dot_agents/skills/`
- Chezmoi special files: `home/.chezmoi*`
- Migration rationale and evidence: `docs/chezmoi-migration.md`

When adding an executable script, include a shebang, useful `--help` output, and
executable source attributes; then test the installed mode through
`make test-migration`.

`Brewfile` owns cross-platform packages and guards macOS-only applications with
`OS.mac?`. Chezmoi templates and `.chezmoiignore` own target differences; keep
macOS output stable when adding Linux branches. Mise owns language runtimes and
standalone development tools. `make setup` bootstraps Homebrew, applies both
manifests, and generates dependencies and completions. With `NONINTERACTIVE=1`,
it leaves Pi credential resolution for an explicit later `make pi-auth`.
