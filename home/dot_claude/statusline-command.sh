#!/bin/bash
input=$(cat)
export LC_ALL=en_US.UTF-8  # so ${#var} counts characters, not bytes
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

# Plan usage (rate limits); only present for Pro/Max subscribers
five=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
week=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
usage_color() {
  if   [ "$1" -ge 85 ]; then echo 31   # red
  elif [ "$1" -ge 60 ]; then echo 33   # yellow
  elif [ "$1" -ge 20 ]; then echo 32   # green
  else echo 2; fi                      # dim, same as the 5h/7d labels
}
usage=""
for pair in "5h:$five" "7d:$week"; do
  label=${pair%%:*}; val=${pair#*:}
  [ -z "$val" ] && continue
  p=$(printf '%.0f' "$val")
  filled=$(( (p + 10) / 20 ))  # 5 cells, 20% each, rounded
  [ "$filled" -gt 5 ] && filled=5
  ubar=""
  for i in 1 2 3 4 5; do
    if [ "$i" -le "$filled" ]; then ubar="${ubar}▰"; else ubar="${ubar}▱"; fi
  done
  part=$(printf '\033[2m%s\033[0m \033[%sm%s %s%%\033[0m' "$label" "$(usage_color "$p")" "$ubar" "$p")
  usage="${usage:+$usage }$part"
done

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

# Right-align plan usage using the terminal width Claude Code passes in $COLUMNS
if [ -n "$usage" ]; then
  strip() { printf '%s' "$1" | sed $'s/\033\[[0-9;]*m//g'; }
  vis_out=$(strip "$out"); vis_usage=$(strip "$usage")
  margin=4  # Claude Code indents the status line; keep clear of the edge
  pad=$(( ${COLUMNS:-0} - ${#vis_out} - ${#vis_usage} - margin ))
  [ "$pad" -lt 1 ] && pad=1
  out="$out$(printf '%*s' "$pad" '')$usage"
fi
printf '%s' "$out"
