#!/bin/sh
# Install Homebrew using its official installer, or reuse an existing installation.
set -eu

# Prefix constants are only discovery fallbacks, never the configured prefix.
find_brew() {
    if command -v brew >/dev/null 2>&1; then
        command -v brew
        return
    fi
    for candidate in /opt/homebrew/bin/brew /usr/local/bin/brew /home/linuxbrew/.linuxbrew/bin/brew; do
        if [ -x "$candidate" ]; then
            printf '%s\n' "$candidate"
            return
        fi
    done
    return 1
}

configure_shell() {
    config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/homebrew"
    mkdir -p "$config_dir"
    "$1" shellenv > "$config_dir/shellenv.sh"
    echo "Homebrew environment saved to $config_dir/shellenv.sh" >&2
}

if brew_bin=$(find_brew); then
    configure_shell "$brew_bin"
    exit 0
fi

case "$(uname -s)" in
    Darwin|Linux) ;;
    *) echo "Homebrew setup supports macOS and Linux only." >&2; exit 1 ;;
esac

for dependency in bash curl git; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
        echo "Install $dependency before running make setup (see README.md)." >&2
        exit 1
    fi
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' HUP INT TERM
curl --fail --show-error --silent --location \
    https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh \
    --output "$tmp/install.sh"
# The official installer handles platform prerequisites and sudo permissions.
# Set NONINTERACTIVE=1 explicitly for unattended machines with passwordless sudo.
bash "$tmp/install.sh"
brew_bin=$(find_brew) || { echo "Homebrew installation did not produce a brew executable." >&2; exit 1; }
configure_shell "$brew_bin"
