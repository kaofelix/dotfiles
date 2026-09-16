#!/usr/bin/env bash
set -euo pipefail

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
baseline=$(<"$repo_root/migration/stow-baseline-revision")
tmp=$(mktemp -d)
trap '[[ ${KEEP_TMP:-} ]] || rm -rf "$tmp"' EXIT
legacy="$tmp/legacy"
home="$tmp/home"
backup="$tmp/backup"

# Recreate a second computer whose checkout and home still use the Stow layout.
git clone -q --no-hardlinks "$repo_root" "$legacy"
git -C "$legacy" checkout -q -b legacy "$baseline"
legacy=$(cd "$legacy" && pwd -P)
mkdir -p "$home"
home=$(cd "$home" && pwd -P)
while IFS= read -r package; do
  [[ -n "$package" && ${package:0:1} != "#" ]] || continue
  stow --dir "$legacy" --target "$home" --stow "$package"
done < "$repo_root/migration/packages.txt"

# Runtime state written below folded Stow links must survive as ordinary files.
mkdir -p "$home/.pi/agent/sessions/session-a" "$home/.config/herdr"
printf 'oauth-state\n' > "$home/.pi/agent/auth.json"
printf 'conversation\n' > "$home/.pi/agent/sessions/session-a/events.jsonl"
printf 'runtime-state\n' > "$home/.config/herdr/session.json"

"$repo_root/scripts/adopt-from-stow" \
  --stow-source "$legacy" \
  --chezmoi-source "$repo_root" \
  --target "$home" \
  --backup-dir "$backup" \
  --promote origin/main \
  --exclude-externals \
  --yes

[[ $(<"$home/.pi/agent/auth.json") == "oauth-state" ]]
[[ $(<"$home/.pi/agent/sessions/session-a/events.jsonl") == "conversation" ]]
[[ $(<"$home/.config/herdr/session.json") == "runtime-state" ]]
[[ ! -L "$home/.pi/agent/settings.json" ]]
[[ ! -L "$home/.zshrc" ]]
[[ -f "$backup/home/.pi/agent/auth.json" ]]
[[ -f "$backup/dotfiles.bundle" ]]
[[ $(git -C "$legacy" rev-parse HEAD) == $(git -C "$repo_root" rev-parse HEAD) ]]
[[ ! -e "$legacy/pi" ]]
[[ -d "$backup/legacy-source-residue/pi" ]]
grep -Fq "sourceDir = \"$legacy\"" "$home/.config/chezmoi/chezmoi.toml"

chezmoi --config "$home/.config/chezmoi/chezmoi.toml" --source "$legacy" --destination "$home" --exclude=externals verify
[[ -z $(chezmoi --config "$home/.config/chezmoi/chezmoi.toml" --source "$legacy" --destination "$home" --exclude=externals status) ]]
[[ -z $(chezmoi --config "$home/.config/chezmoi/chezmoi.toml" --source "$legacy" --destination "$home" --exclude=externals --no-pager diff) ]]

printf 'Stow adoption preserved runtime state and promoted the canonical checkout.\n'
