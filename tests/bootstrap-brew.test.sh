#!/bin/sh
set -eu
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
tmp=$(mktemp -d)
mkdir -p "$tmp/bin"
printf '#!/bin/sh\nprintf '\''export HOMEBREW_PREFIX="/custom/brew"\\n'\''\n' > "$tmp/bin/brew"
printf '#!/bin/sh\necho "unexpected download" >&2\nexit 99\n' > "$tmp/bin/curl"
chmod +x "$tmp/bin/"*
HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/config" PATH="$tmp/bin:$PATH" make -C "$repo" brew-bootstrap
# shellcheck source=/dev/null
. "$tmp/config/homebrew/shellenv.sh"
[ "$HOMEBREW_PREFIX" = /custom/brew ]
printf 'PASS: existing Homebrew needs no download or reinstallation\n'
