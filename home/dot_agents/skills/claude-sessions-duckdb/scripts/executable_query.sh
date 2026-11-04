#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == --help ]]; then
  printf '%s\n' \
    'Usage: query.sh [DuckDB CLI options]' \
    'Query Claude Code JSONL logs in memory with bundled claude_* views.' \
    'Set CLAUDE_SESSION_GLOB to one absolute file or a DuckDB glob.' \
    "Default: \$HOME/.claude/projects/**/*.jsonl (includes subagents)." \
    'Pass SQL on stdin or with -c; requires DuckDB with WITH ORDINALITY support.'
  exit 0
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec duckdb -bail -cmd ".read \"$script_dir/create_views.sql\"" "$@" :memory:
