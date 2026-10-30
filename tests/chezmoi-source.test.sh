#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
temporary=$(cd "$temporary" && pwd -P)
checkout="$temporary/checkout with spaces"
destination="$temporary/target"
mkdir -p "$checkout/home" "$checkout/scripts" "$destination/.config/chezmoi"
cp "$root/scripts/configure-chezmoi-source" "$checkout/scripts/"
git -C "$checkout" init -q
printf 'home\n' >"$checkout/.chezmoiroot"
printf 'hello\n' >"$checkout/home/dot_fixture"
printf 'sourceDir = "/missing"\nprogress = false\n[data]\nkeep = "unchanged"\n' >"$destination/.config/chezmoi/chezmoi.toml"

XDG_CONFIG_HOME="$destination/.config" bash "$checkout/scripts/configure-chezmoi-source" "$checkout" "$(command -v chezmoi)"
grep -Fq 'keep = "unchanged"' "$destination/.config/chezmoi/chezmoi.toml"
configured=$(XDG_CONFIG_HOME="$destination/.config" chezmoi source-path)
[[ "$configured" == "$checkout/home" ]]
XDG_CONFIG_HOME="$destination/.config" chezmoi --destination "$destination" apply
[[ -f "$destination/.fixture" ]]

mkdir -p "$temporary/bin"
# shellcheck disable=SC2016
printf '#!/bin/sh\nprintf "%%s\\n" "$FAKE_SOURCE"\n' >"$temporary/bin/chezmoi"
chmod +x "$temporary/bin/chezmoi"
if FAKE_SOURCE="$temporary/missing" PATH="$temporary/bin:$PATH" bash "$root/home/dot_local/bin/executable_refresh_dotfiles" >"$temporary/refresh-error" 2>&1; then exit 1; fi
grep -Fq 'run make sync' "$temporary/refresh-error"
if FAKE_SOURCE="$destination" PATH="$temporary/bin:$PATH" bash "$root/home/dot_local/bin/executable_refresh_dotfiles" >"$temporary/refresh-error" 2>&1; then exit 1; fi
grep -Fq 'not a Git checkout' "$temporary/refresh-error"
echo 'chezmoi source configuration tests passed'
