#!/bin/sh
# Run after make setup, in an installed home (no provider credentials required).
set -eu
# shellcheck source=/dev/null
. "${XDG_CONFIG_HOME:-$HOME/.config}/homebrew/shellenv.sh"
export PATH="$HOME/.local/bin:$PATH"

for tool in brew stow zsh tmux direnv starship emacsclient; do
    command -v "$tool" >/dev/null
done
# Variables below belong to the child shell inside mise's environment.
# shellcheck disable=SC2016
mise exec -- sh -eu -c '
    for tool in node pi pifind jq delta difft git-lfs gh uv usage; do
        command -v "$tool" >/dev/null
    done
    pi --version
    pifind --help >/dev/null
    usage --version
'
for file in .zshrc .gitconfig .tmux.conf .pi/agent/settings.json .config/mise/config.toml; do
    test -f "$HOME/$file"
done
stow --simulate --restow --target="$HOME" bin zsh git pi agents tmux ghostty herdr mise

case "$(uname -s)" in
    Linux)
        test ! -e "$HOME/Library/KeyBindings/DefaultKeyBinding.dict"
        test ! -e "$HOME/.config/git/macos.config"
        test "$(git config --get gpg.format)" = ssh
        test -z "$(git config --get gpg.ssh.program || true)"
        ;;
    Darwin)
        test "$(git config --get gpg.ssh.program)" = /Applications/1Password.app/Contents/MacOS/op-ssh-sign
        ;;
esac

# A private server keeps this check away from the user's tmux sessions.
tmp=$(mktemp -d)
socket="$tmp/tmux.sock"
trap 'tmux -S "$socket" kill-server 2>/dev/null || true' EXIT
SHELL="$(command -v zsh)" tmux -S "$socket" -f "$HOME/.tmux.conf" new-session -d -s smoke
[ "$(tmux -S "$socket" show-option -sv set-clipboard)" = external ]
tmux -S "$socket" set-buffer LINUX_CLIPBOARD_OK
[ "$(tmux -S "$socket" show-buffer)" = LINUX_CLIPBOARD_OK ]
printf 'PASS: installed shell tools, configuration, Stow, Git and tmux\n'
