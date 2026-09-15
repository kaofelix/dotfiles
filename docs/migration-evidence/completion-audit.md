# Completion audit

Fresh audit performed at `2026-09-15T23:37:09Z` in
`/Users/kaofelix/dotfiles-chezmoi` on branch `migrate/chezmoi`.

| Requirement | Evidence |
| --- | --- |
| Preserve the starting working state | Commit `36a12067652b708f07ba22f0c4ad74193468aa6a` captures the tracked modifications and non-ignored untracked files copied into the dedicated worktree before migration. `migration/stow-baseline-revision` freezes that commit. |
| Work only in a dedicated worktree | `git rev-parse --show-toplevel` returned `/Users/kaofelix/dotfiles-chezmoi`; `git branch --show-current` returned `migrate/chezmoi`. The original `/Users/kaofelix/dotfiles` retained its pre-existing modified/untracked status. |
| Establish and refine a first package pattern | Commit `0b460db` migrates `zsh`; `01-zsh/comparison.json` records 2 leaves, an idempotent apply, passing verify, empty diff, and zero differences. |
| Replicate and refine with a second package | Commit `a62cff6` migrates `bin`, adding executable attributes; `02-zsh-bin/comparison.json` records 24 leaves with the same passing checks and zero differences. |
| Port every remaining package and workflow | Commit `82b8450` moves all ten package target trees under `home/`; `.chezmoiroot`, Makefile, Brewfile, README, AGENTS.md, tests, ignores, version floor, and external declaration define the replacement workflow. The full harness accounts for all 678 baseline leaves. |
| Compare isolated Stow and chezmoi installations | `scripts/validate-chezmoi-migration` checks out the frozen baseline into a temporary source, Stows into one temporary home, applies chezmoi into another with isolated config/cache/state, and never addresses real `$HOME`. `03-full/` contains both semantic and physical manifests. |
| Compare complete effective trees and metadata | Final `comparison.json` records all 678 managed leaves, SHA-256 and size comparisons, effective/source modes, 13 normalized Stow links, zero chezmoi links, and zero unexplained differences. Executable bits are part of each semantic row. |
| Explain every intentional difference | `migration/expected-differences.json` narrowly permits byte/size changes in two installed usage documents. `docs/chezmoi-migration.md` explains those changes, ordinary-file representation, zgenom lifecycle, and runtime-state isolation. Any unlisted path or field fails the harness. |
| Verify clean install, idempotence, update state, and external | `make test-migration` passed after two applies, `chezmoi verify`, and an empty `chezmoi diff`; its external smoke cloned zgenom into a fresh temporary home and reapplied at revision `d99d5dc4b27695612de2b7054bb583dd19a7235d`. A separate fresh `make apply TARGET_DIR=<temp>/home` plus `make verify` passed with `.zshrc`, executable `pi-auth-setup`, and zgenom present. |
| Review current chezmoi features and best practices | `docs/chezmoi-migration.md` links official current documentation and records adopted or rejected decisions for source roots, attributes, file/symlink mode, versioning, externals, ignores, templates/data, exact/private/create/modify/remove targets, password managers, encryption, scripts, config templates, Git automation, and package management. |
| Preserve behavior and avoid hidden migration debt | Full parity has zero unexplained differences. Mutable directories remain non-exact; plaintext Pi auth remains generated/unmanaged; package and secret side effects remain explicit. Searches found no obsolete operational Stow commands outside historical migration documentation. |
| Run tests and static/security checks | Fresh `make test` passed 5 pifind tests, 106 footer tests, 10 pi-herdr tests, and both Pi auth shell tests. `make test-migration`, ShellCheck on new/changed shell tests, Python byte-compilation of the harness, `git diff --check`, and Gitleaks over `36a1206..HEAD` all passed. Gitleaks reported no introduced leaks. |
| Leave reviewable Git state | Migration history contains explicit baseline, first-package, second-package, full-migration, test, and metadata commits. At audit start, `git status --porcelain=v1` was empty at `8ccc4304e42a0b41533b3df58783ba1236fdcb84`; dependency/cache artifacts are ignored by both Git and chezmoi. |

No requirement is deferred or only presumed satisfied. The only npm audit warnings are
from unchanged, parity-preserved lockfiles and were not created or modified by this
configuration-manager migration.
