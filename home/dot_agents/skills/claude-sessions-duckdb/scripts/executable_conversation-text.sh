#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: conversation-text.sh [--include-context] /absolute/path/to/session.jsonl' \
    'Export user/assistant text as CSV in append-log order.' \
    'Default omits isMeta messages and compaction summaries.' \
    '--include-context retains those text messages, not tools or thinking.'
}

if [[ ${1:-} == --help ]]; then
  usage
  exit 0
fi

view=claude_conversation
if [[ ${1:-} == --include-context ]]; then
  view=claude_conversation_full
  shift
fi
if [[ $# -ne 1 || ${1:-} != /* ]]; then
  usage >&2
  exit 2
fi
if [[ ! -f $1 ]]; then
  printf 'Session file not found: %s\n' "$1" >&2
  exit 1
fi
# DuckDB interprets these characters as glob patterns, even in a supplied path.
if [[ $1 == *'*'* || $1 == *'?'* || $1 == *'['* ]]; then
  printf 'Session path must not contain glob metacharacters: %s\n' "$1" >&2
  exit 2
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
CLAUDE_SESSION_GLOB=$1 bash "$script_dir/query.sh" -csv -c "
SELECT event_ordinal, event_timestamp, event_id, parent_uuid, role, text
FROM $view
ORDER BY event_ordinal;
"
