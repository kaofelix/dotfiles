#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 [--include-context] /absolute/path/to/rollout.jsonl" >&2
}

view=codex_conversation
if [[ ${1:-} == "--include-context" ]]; then
  view=codex_conversation_full
  shift
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

session_file=$1

if [[ ! -f "$session_file" ]]; then
  echo "session file not found: $session_file" >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

CODEX_SESSION_GLOB=$session_file \
  bash "$script_dir/query.sh" -csv -c "
SELECT event_timestamp, role, phase, text
FROM $view
ORDER BY event_time NULLS LAST, event_ordinal NULLS LAST;
"
