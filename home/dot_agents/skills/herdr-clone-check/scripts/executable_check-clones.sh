#!/usr/bin/env bash
# Show how Herdr app mods and layouts cloned from shipped ones differ from
# their originals, to spot upstream changes the clones are missing.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: check-clones.sh [NAME...]

For each cloned Herdr app mod (mods/<name>) and layout (layouts/<name>.json),
print the cloned-from version next to the app version and a diff from the
shipped original to the clone. Shipped originals are refreshed by Herdr on every
start, so the diff holds your own edits plus any upstream changes the clone is
missing. Compare against your edits (they are in git) to spot the new ones.

Clone-only noise is removed: `cloned_from`, asset paths (`mods/files-flat/` vs
`mods/files/`), and JSON key order. Generated `gpui-kit.d.ts` and `jsconfig.json`
are ignored. Name clones to limit the output.

Environment:
  HERDR_APP_HOME   Herdr app home (default: ~/.config/herdr-app)
Requires: jq, diff, and herdr-app (for the version line).
USAGE
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  -*) usage >&2; exit 2 ;;
esac
names=("$@")

for tool in jq diff; do
  command -v "$tool" >/dev/null 2>&1 || { printf 'error: %s is required\n' "$tool" >&2; exit 1; }
done

home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
[[ -d "$home" ]] || { printf 'error: Herdr app home not found: %s\n' "$home" >&2; exit 1; }

app_version=unknown
if command -v herdr-app >/dev/null 2>&1; then
  app_version=$(herdr-app --version | awk '{print $NF}')
fi

# Print a file with the clone's own metadata and asset paths normalized away.
normalize() {
  local file=$1 from=$2 to=$3
  [[ -f "$file" ]] || return 0
  case "$file" in
    *.json) jq -S 'del(.cloned_from)' "$file" ;;
    *) cat "$file" ;;
  esac | sed "s#mods/$from/#mods/$to/#g"
}

mod_diff() {
  local clone=$1 original=$2 file
  {
    (cd "$home/mods/$original" && find . -type f)
    (cd "$home/mods/$clone" && find . -type f)
  } | grep -v -e '/gpui-kit\.d\.ts$' -e '/jsconfig\.json$' | sort -u | while read -r file; do
    file=${file#./}
    diff -u --label "a/$file" --label "b/$file" \
      <(normalize "$home/mods/$original/$file" "$original" "$original") \
      <(normalize "$home/mods/$clone/$file" "$clone" "$original") || true
  done
}

layout_diff() {
  local clone=$1 original=$2
  diff -u --label "a/$original.json" --label "b/$clone.json" \
    <(normalize "$home/layouts/$original.json" "$original" "$original") \
    <(normalize "$home/layouts/$clone.json" "$clone" "$original") || true
}

wanted() {
  [[ ${#names[@]} -eq 0 ]] && return 0
  local n
  for n in "${names[@]}"; do [[ "$n" == "$1" ]] && return 0; done
  return 1
}

found=0

show() {
  local kind=$1 name=$2 meta=$3 original version
  original=$(jq -r '.cloned_from.name // empty' "$meta")
  version=$(jq -r '.cloned_from.version // "?"' "$meta")
  [[ -n "$original" ]] || return 0
  wanted "$name" || return 0
  found=1
  printf '== %s %s (cloned from %s %s; app %s)\n' "$kind" "$name" "$original" "$version" "$app_version"
  if [[ "$kind" == mod ]]; then
    [[ -d "$home/mods/$original" ]] || { printf 'error: original mod missing: %s\n' "$original" >&2; return 0; }
    mod_diff "$name" "$original"
  else
    [[ -f "$home/layouts/$original.json" ]] || { printf 'error: original layout missing: %s\n' "$original" >&2; return 0; }
    layout_diff "$name" "$original"
  fi
}

for meta in "$home"/mods/*/mod.json; do
  [[ -f "$meta" ]] || continue
  show mod "$(basename "$(dirname "$meta")")" "$meta"
done
for meta in "$home"/layouts/*.json; do
  [[ -f "$meta" ]] || continue
  show layout "$(basename "$meta" .json)" "$meta"
done

[[ $found -eq 1 ]] || printf 'No cloned mods or layouts found in %s\n' "$home"
