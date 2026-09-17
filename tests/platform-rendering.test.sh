#!/usr/bin/env bash
set -euo pipefail

repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

render() {
    platform=$1
    destination=$tmp/$platform-home
    mkdir -p "$destination" "$tmp/$platform-cache"
    : > "$tmp/$platform-config.toml"
    "$repo_root/scripts/run-with-homebrew" chezmoi \
        --source "$repo_root" \
        --destination "$destination" \
        --config "$tmp/$platform-config.toml" \
        --cache "$tmp/$platform-cache" \
        --persistent-state "$tmp/$platform-state.boltdb" \
        --override-data "{\"chezmoi\":{\"os\":\"$platform\"}}" \
        --exclude=externals \
        apply
}

render darwin
render linux

mac=$tmp/darwin-home
linux=$tmp/linux-home

assert_not_contains() {
    needle=$1
    file=$2
    if grep -Fq "$needle" "$file"; then
        printf 'Unexpected text in %s: %s\n' "$file" "$needle" >&2
        exit 1
    fi
}

[[ -f "$mac/Library/KeyBindings/DefaultKeyBinding.dict" ]]
[[ ! -e "$linux/Library/KeyBindings/DefaultKeyBinding.dict" ]]
grep -Fq '/Applications/1Password.app/Contents/MacOS/op-ssh-sign' "$mac/.gitconfig"
assert_not_contains '/Applications/1Password.app/Contents/MacOS/op-ssh-sign' "$linux/.gitconfig"
grep -Fq 'gpgsign = true' "$mac/.gitconfig"
assert_not_contains 'gpgsign = true' "$linux/.gitconfig"
grep -Fq 'Library/Group Containers/2BUA8C4S2C.com.1password' "$mac/.zshrc"
assert_not_contains 'Library/Group Containers/2BUA8C4S2C.com.1password' "$linux/.zshrc"
grep -Fq 'alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"' "$mac/.zshrc"
assert_not_contains 'alias tailscale=' "$linux/.zshrc"
grep -Fq "copy-command 'pbcopy'" "$mac/.tmux.conf"
assert_not_contains 'pbcopy' "$linux/.tmux.conf"
grep -Fq '/home/linuxbrew/.linuxbrew/bin/brew shellenv' "$linux/.zshrc"
assert_not_contains '/home/linuxbrew/.linuxbrew/bin/brew shellenv' "$mac/.zshrc"
grep -Fq '"dash"' "$mac/.pi/agent/mcp.json"
assert_not_contains '"dash"' "$linux/.pi/agent/mcp.json"
python3 -m json.tool "$mac/.pi/agent/mcp.json" >/dev/null
python3 -m json.tool "$linux/.pi/agent/mcp.json" >/dev/null

# The wrapper must adopt Homebrew's shell environment before running a command.
mkdir -p "$tmp/fake-bin"
cat > "$tmp/fake-bin/brew" <<'EOF'
#!/bin/sh
if [ "${1:-}" = shellenv ]; then
    printf '%s\n' 'export DOTFILES_HOMEBREW_WRAPPER_TEST=ready'
    exit 0
fi
exit 0
EOF
chmod +x "$tmp/fake-bin/brew"
PATH="$tmp/fake-bin:/usr/bin:/bin" "$repo_root/scripts/install-homebrew"
result=$(PATH="$tmp/fake-bin:/usr/bin:/bin" \
    "$repo_root/scripts/run-with-homebrew" printenv DOTFILES_HOMEBREW_WRAPPER_TEST)
[[ $result == ready ]]

printf 'macOS and Linux target rendering passed.\n'
