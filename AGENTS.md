# Agent Guide: Dotfiles Repository

This repository contains Kao Felix's dotfiles managed with GNU Stow. This guide helps AI agents understand the structure, commands, and patterns used in this codebase.

## Repository Overview

This is a **dotfiles repository** that uses GNU Stow to manage configuration files across different tools (zsh, git, Claude Code, etc.). The repository follows a package-based structure where each subdirectory represents a "package" that can be stowed to the home directory.

## Makefile Commands
- `make stow` - Stow all packages to the home directory (creates symlinks)
- `make unstow` - Unstow all packages from the home directory (removes symlinks)

### Stow Package Structure
Each package directory (zsh, git, claude, bin) contains files that will be symlinked to the home directory. The directory structure within packages mirrors the target location.

Example: `zsh/.zshrc` → `~/.zshrc`

#### Available Packages
- `zsh/`
- `git/`
- `claude/`
- `bin/`
- `pi/`

The `bin` package installs scripts to `~/.local/bin/` (user-local binary directory)

### Zsh Configuration (`zsh/.zshrc`)
- Uses **zgenom** for plugin management
- Uses **Starship** for prompt

### Homebrew Packages

Listed in Brewfile

## Development Workflow

### Adding New Configuration
1. Create appropriate package directory or add to existing one
2. Place files with proper directory structure (mirroring target location)
3. Add package to `STOW_PACKAGES` in Makefile if new package
4. Test with `make <package>` to stow individually
5. Commit changes

### Modifying Existing Configuration
1. Edit files in the package directories
2. Run `make stow` to update symlinks
3. Test changes in shell/application
4. Commit changes

### Adding New Scripts
1. Add script to `bin/.local/bin/` with proper shebang and permissions
2. Ensure script follows color/output conventions
3. Include comprehensive help/usage information
4. Test script functionality
5. Run `make bin` to stow scripts

## PI Coding Agent

This repo has stuff also for the pi coding agent.

- Config and extensions are in the `pi/` stow package containing a
  `.pi` folder that gets stowed in `~/.pi`. Always edit files in the package, never in the target folder
- When asked to create a pi extension, add it to `./pi/.pi/agent/extensions/`
- Skills are in the `skills/` folder. When asked to create a new skill, always add it to the top level dir. Subdirs like `pi-skills` are git submodules copied from other places
