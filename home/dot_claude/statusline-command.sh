#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name // "?"')
effort=$(echo "$input" | jq -r '.effort.level // empty')
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

case "$effort" in
  low) e="○" ;; medium) e="◐" ;; high) e="●" ;; xhigh) e="◉" ;; max) e="◈" ;; *) e="" ;;
esac

dir=$cwd
case "$cwd" in "$HOME"*) dir="~${cwd#"$HOME"}" ;; esac
out=$(printf '\033[36m%s\033[0m' "$model")
[ -n "$e" ] && out="$out $(printf '\033[35m%s\033[0m' "$e")"

if [ -n "$used" ]; then
  pct=$(printf '%.0f' "$used")
  if   [ "$pct" -ge 90 ]; then c=31   # red
  elif [ "$pct" -ge 75 ]; then c=33   # yellow
  elif [ "$pct" -ge 50 ]; then c=93   # bright yellow
  else c=32; fi                       # green
  width=10
  filled=$(( (pct * width + 50) / 100 ))
  [ "$filled" -gt "$width" ] && filled=$width
  bar=""
  for i in $(seq 1 "$width"); do
    if [ "$i" -le "$filled" ]; then bar="${bar}▰"; else bar="${bar}▱"; fi
  done
  out="$out $(printf '\033[%sm%s %s%%\033[0m' "$c" "$bar" "$pct")"
fi

git_part=""
branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
if [ -n "$branch" ]; then
  porcelain=$(git -C "$cwd" --no-optional-locks status --porcelain 2>/dev/null)
  s=""
  echo "$porcelain" | grep -q '^[MADRC]' && s="${s}+"
  echo "$porcelain" | grep -q '^.[MD]' && s="${s}!"
  echo "$porcelain" | grep -q '^??' && s="${s}?"
  [ -z "$s" ] && s="✓"
  git_part=$(printf '\033[32m%s\033[0m \033[33m%s\033[0m' "$branch" "$s")
fi

out="$out $(printf '\033[37m%s\033[0m' "$dir")"
[ -n "$git_part" ] && out="$out $git_part"
printf '%s' "$out"
